/**
 * Remote-signing tests. No dependencies beyond Node (>= 20) and the Worker source.
 *
 *   npm test                         in-memory: the real Hono app + a fake KV + a fake clock
 *   SIGN_TEST_BASE=http://127.0.0.1:8799 SIGN_TEST_KEY=<key> npm test
 *                                    live: the same flows against `wrangler dev`
 *                                    (tests that need the clock or the KV are skipped)
 *
 * All names and documents here are fictional.
 */
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import crypto from "node:crypto";

const LIVE_BASE = process.env.SIGN_TEST_BASE || "";
const LIVE = Boolean(LIVE_BASE);
const API_KEY = process.env.SIGN_TEST_KEY || "test-office-key-" + crypto.randomBytes(24).toString("hex");
const memOnly = { skip: LIVE ? "needs in-memory clock/KV" : false };

// ---------- fake clock ----------
const realNow = Date.now.bind(Date);
let clockOffset = 0;
if (!LIVE) Date.now = () => realNow() + clockOffset;
const advance = ms => { clockOffset += ms; };
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

// ---------- fake KV (same semantics the Worker relies on) ----------
class FakeKV {
    constructor() { this.m = new Map(); }
    _live(k) {
        const e = this.m.get(k);
        if (!e) return null;
        if (e.expiration && Date.now() / 1000 >= e.expiration) { this.m.delete(k); return null; }
        return e;
    }
    async get(k, opts) {
        const e = this._live(k);
        if (!e) return null;
        const type = typeof opts === "string" ? opts : opts && opts.type;
        if (type === "arrayBuffer") return e.bytes.buffer.slice(e.bytes.byteOffset, e.bytes.byteOffset + e.bytes.length);
        return Buffer.from(e.bytes).toString("utf8");
    }
    async getWithMetadata(k, opts) { return { value: await this.get(k, opts), metadata: null }; }
    async put(k, v, opts = {}) {
        let expiration = opts.expiration || null;
        if (opts.expirationTtl) {
            if (opts.expirationTtl < 60) throw new Error("KV: expirationTtl must be >= 60");
            expiration = Math.floor(Date.now() / 1000) + opts.expirationTtl;
        }
        if (expiration && expiration < Math.floor(Date.now() / 1000) + 60) throw new Error("KV: expiration must be >= 60s ahead");
        const bytes = typeof v === "string" ? Buffer.from(v, "utf8") : Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v);
        this.m.set(k, { bytes, expiration });
    }
    async delete(k) { this.m.delete(k); }
    signKeys() { return [...this.m.keys()].filter(k => k.startsWith("sign:") && this._live(k)); }
    dump() { return Buffer.concat([...this.m.entries()].filter(([k]) => k.startsWith("sign:")).map(([, e]) => e.bytes)); }
}

let app = null;
const kv = new FakeKV();
const baseEnv = {
    ORDERS_KV: kv,
    CORS_ORIGINS: "https://asor-law.com,http://localhost:8080",
    RETURN_URL_BASE: "https://asor-law.com",
    SIGN_PAGE_URL: "https://asor-law.com/sign/",
    SIGN_API_KEY: API_KEY,
};
if (!LIVE) app = (await import("../src/index.js")).default;

let ipSeq = 10;
const newIp = () => `203.0.113.${ipSeq++}`;   // TEST-NET-3, never a real client

async function call(method, path, { body, headers = {}, env, raw } = {}) {
    const init = { method, headers: { ...headers } };
    if (body !== undefined) {
        init.body = raw ? body : JSON.stringify(body);
        if (!init.headers["Content-Type"]) init.headers["Content-Type"] = "application/json";
    }
    const res = LIVE
        ? await fetch(LIVE_BASE + path, init)
        : await app.fetch(new Request("http://worker.test" + path, init), env || baseEnv);
    return res;
}
const office = (method, path, opts = {}) =>
    call(method, path, { ...opts, headers: { Authorization: `Bearer ${API_KEY}`, ...(opts.headers || {}) } });
const client = (path, body, ip, extraHeaders = {}) =>
    call("POST", "/api/sign/" + path, { body, headers: { "CF-Connecting-IP": ip, "User-Agent": "sign-test/1.0", ...extraHeaders } });

// ---------- fixtures ----------
function tinyPdf(pages = 2, marker = "FICTIONAL TEST DOCUMENT") {
    const objs = [];
    const kids = [];
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    let n = 4;
    for (let p = 1; p <= pages; p++) {
        const stream = `BT /F1 20 Tf 72 760 Td (${marker} - page ${p} of ${pages}) Tj ET`;
        const pageNo = n++, contentNo = n++;
        kids.push(`${pageNo} 0 R`);
        objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`;
        objs[contentNo] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }
    objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages} >>`;
    let out = "%PDF-1.4\n";
    const offsets = [];
    for (let i = 1; i < objs.length; i++) {
        offsets[i] = out.length;
        out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, "latin1");
}

function crc32(buf) {
    let c, crc = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
        c = (crc ^ buf[n]) & 0xff;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function png(width = 60, height = 20, noise = false) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6;   // 8-bit RGBA
    const rowLen = 1 + width * 4;
    const rawData = noise ? crypto.randomBytes(rowLen * height) : Buffer.alloc(rowLen * height, 0x40);
    for (let y = 0; y < height; y++) rawData[y * rowLen] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rawData)), chunk("IEND", Buffer.alloc(0)),
    ]);
}

const PDF = tinyPdf(2);
const PDF_SHA = crypto.createHash("sha256").update(PDF).digest("hex");
const SIGNER = "דנה בדיקה-פיקטיבית";
const TITLE = "ייפוי כוח לבדיקה XQ7731";

function createBody(over = {}) {
    return {
        title: TITLE,
        signer_name: SIGNER,
        verify: { kind: "id_last4", value: "4821" },
        fields: [{ page: 2, x: 0.55, y: 0.8, w: 0.3, h: 0.08 }],
        message: "הודעת בדיקה ללקוח ZK5512",
        pdf_b64: PDF.toString("base64"),
        ...over,
    };
}
async function create(over) {
    const res = await office("POST", "/api/sign/requests", { body: createBody(over) });
    assert.equal(res.status, 201, "create should return 201");
    const j = await res.json();
    const m = /^(.*)#([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(j.url);
    assert.ok(m, "url must be <page>#<id>.<key>");
    assert.equal(m[2], j.id);
    return { id: j.id, key: m[3], url: j.url, pageBase: m[1], expires_at: j.expires_at };
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// =====================================================================
test("office auth: 503 when the secret is missing or too short, 401 on bad bearer", memOnly, async () => {
    for (const bad of [undefined, "", "short-secret"]) {
        const env = { ...baseEnv, SIGN_API_KEY: bad };
        for (const [m, p] of [["POST", "/api/sign/requests"], ["GET", "/api/sign/requests/abc"], ["GET", "/api/sign/requests/abc/result"], ["DELETE", "/api/sign/requests/abc"]]) {
            const r = await call(m, p, { env, headers: { Authorization: `Bearer ${bad || "x"}` }, body: m === "POST" ? {} : undefined });
            assert.equal(r.status, 503, `${m} ${p} with secret=${JSON.stringify(bad)}`);
        }
    }
});

test("office auth: 401 without / with a wrong bearer token", async () => {
    const paths = [["POST", "/api/sign/requests"], ["GET", "/api/sign/requests/AAAAAAAAAAAAAAAAAAAAAA"], ["GET", "/api/sign/requests/AAAAAAAAAAAAAAAAAAAAAA/result"], ["DELETE", "/api/sign/requests/AAAAAAAAAAAAAAAAAAAAAA"]];
    for (const [m, p] of paths) {
        const body = m === "POST" ? createBody() : undefined;
        assert.equal((await call(m, p, { body })).status, 401, `${m} ${p} no header`);
        assert.equal((await call(m, p, { body, headers: { Authorization: "Bearer " + "w".repeat(API_KEY.length) } })).status, 401);
        assert.equal((await call(m, p, { body, headers: { Authorization: API_KEY } })).status, 401, "missing Bearer prefix");
    }
});

test("create: input validation, content type, PDF magic, size limits", async () => {
    const post = (body, opts = {}) => office("POST", "/api/sign/requests", { body, ...opts });
    assert.equal((await post(JSON.stringify(createBody()), { raw: true, headers: { "Content-Type": "text/plain" } })).status, 415);
    assert.equal((await post("{not json", { raw: true })).status, 400);
    const bad = async (over, code, status = 400) => {
        const r = await post(createBody(over));
        assert.equal(r.status, status, JSON.stringify(Object.keys(over)));
        assert.equal((await r.json()).error, code);
    };
    await bad({ title: "" }, "invalid_title");
    await bad({ signer_name: 5 }, "invalid_signer_name");
    await bad({ verify: { kind: "sms", value: "1234" } }, "invalid_verify");
    await bad({ verify: { kind: "id_last4", value: "12345" } }, "invalid_verify");
    await bad({ verify: { kind: "code", value: "ab" } }, "invalid_verify");
    await bad({ expires_hours: 721 }, "invalid_expires_hours");
    await bad({ expires_hours: 1.5 }, "invalid_expires_hours");
    await bad({ fields: [{ page: 0, x: 0, y: 0, w: 0.1, h: 0.1 }] }, "invalid_fields");
    await bad({ fields: [{ page: 1, x: 0.95, y: 0, w: 0.1, h: 0.1 }] }, "invalid_fields");
    await bad({ fields: [{ page: 3, x: 0.1, y: 0.1, w: 0.1, h: 0.1 }] }, "invalid_fields"); // PDF has 2 pages
    await bad({ pdf_b64: "@@@not-base64@@@" }, "invalid_pdf_b64");
    await bad({ pdf_b64: Buffer.from("GIF89a this is not a pdf at all").toString("base64") }, "not_a_pdf");
    // 10 MB + 1 byte, with a valid PDF header
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 - 8, 0x20)]);
    assert.equal(big.length, 10 * 1024 * 1024 + 1);
    await bad({ pdf_b64: big.toString("base64") }, "pdf_too_large", 413);
    // far beyond the body cap
    const huge = await post(createBody({ pdf_b64: "A".repeat(16 * 1024 * 1024) }));
    assert.equal(huge.status, 413);
});

test("full flow: create, open, verify, document, submit, status, result, replay, delete", async () => {
    const ip = newIp();
    const before = LIVE ? 0 : kv.signKeys().length;
    const { id, key, url, expires_at } = await create();
    assert.ok(url.includes("/sign/#"), "key travels in the fragment only");
    assert.match(expires_at, ISO_RE);

    if (!LIVE) {
        // Nothing personal is readable at rest.
        const dump = kv.dump();
        for (const needle of [SIGNER, "דנה", TITLE, "XQ7731", "ZK5512", "FICTIONAL TEST DOCUMENT", "%PDF-", "4821", key]) {
            assert.equal(dump.includes(Buffer.from(needle, "utf8")), false, `KV must not contain plaintext: ${needle}`);
        }
        assert.equal(kv.signKeys().length, before + 2, "record + encrypted pdf");
    }

    let st = await (await office("GET", `/api/sign/requests/${id}`)).json();
    assert.equal(st.status, "pending");
    assert.equal(st.viewed_at, null);
    assert.deepEqual([st.audit.verified, st.audit.attempts, st.audit.ip], [false, 0, null]);

    // open
    let r = await client("open", { id, key }, ip);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.match(r.headers.get("X-Robots-Tag"), /noindex/);
    const meta = await r.json();
    assert.equal(meta.status, "viewed");
    assert.equal(meta.title, TITLE);
    assert.equal(meta.signer_first_name, "דנה");
    assert.equal(JSON.stringify(meta).includes("בדיקה-פיקטיבית"), false, "only the first name is exposed before verification");
    assert.equal(meta.page_count, 2);
    assert.equal(meta.attempts_left, 5);
    assert.ok(meta.firm_name.includes("עשור"));

    st = await (await office("GET", `/api/sign/requests/${id}`)).json();
    assert.equal(st.status, "viewed");
    assert.match(st.viewed_at, ISO_RE);

    // session-gated endpoints refuse before verification
    assert.equal((await client("document", { id, key }, ip)).status, 401);
    assert.equal((await client("document", { id, key, session: "A".repeat(43) }, ip)).status, 401);

    // one wrong attempt, then the right one
    r = await client("verify", { id, key, value: "0000" }, ip);
    assert.equal(r.status, 401);
    assert.equal((await r.json()).attempts_left, 4);
    r = await client("verify", { id, key, value: " 4821 " }, ip);
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.match(v.session, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(v.fields.length, 1);
    const session = v.session;

    const goodSig = png(120, 40);
    const submitBody = { id, key, session, signature_png_b64: goodSig.toString("base64"), signed_name: SIGNER, consent: true };

    // cannot sign a document that was never delivered
    r = await client("submit", submitBody, ip);
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "document_not_viewed");

    // document round-trips byte for byte
    r = await client("document", { id, key, session }, ip);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Content-Type"), "application/pdf");
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    const got = Buffer.from(await r.arrayBuffer());
    assert.ok(got.equals(PDF), "decrypted PDF equals the original");

    // submit validation
    const badSubmit = async (over, status, code) => {
        const rr = await client("submit", { ...submitBody, ...over }, ip);
        assert.equal(rr.status, status, code);
        assert.equal((await rr.json()).error, code);
    };
    await badSubmit({ consent: false }, 400, "consent_required");
    await badSubmit({ consent: "true" }, 400, "consent_required");
    await badSubmit({ signed_name: " " }, 400, "invalid_signed_name");
    await badSubmit({ signature_png_b64: Buffer.from("GIF89a" + "x".repeat(100)).toString("base64") }, 400, "invalid_signature_png");
    await badSubmit({ signature_png_b64: goodSig.subarray(0, goodSig.length - 5).toString("base64").replace(/=+$/, "").padEnd(Math.ceil((goodSig.length - 5) / 3) * 4, "=") }, 400, "invalid_signature_png");
    const fat = png(260, 300, true);           // incompressible → > 300 KB
    assert.ok(fat.length > 300 * 1024 && fat.length < 330 * 1024, `fixture size ${fat.length}`);
    await badSubmit({ signature_png_b64: fat.toString("base64") }, 413, "signature_too_large");
    await badSubmit({ session: "B".repeat(43) }, 401, "session_invalid");

    // sign
    r = await client("submit", submitBody, ip);
    assert.equal(r.status, 200);
    const done = await r.json();
    assert.equal(done.status, "signed");
    assert.match(done.signed_at, ISO_RE);

    if (!LIVE) {
        assert.deepEqual(kv.signKeys().filter(k => k.includes(id)).sort(), [`sign:${id}`, `sign:${id}:sig`], "the PDF is deleted from the cloud at signing");
        const dump = kv.dump();
        for (const needle of [SIGNER, ip, "sign-test/1.0", goodSig.subarray(0, 16)]) {
            assert.equal(dump.includes(Buffer.isBuffer(needle) ? needle : Buffer.from(needle)), false, "no plaintext audit/signature at rest");
        }
    }

    // replay: a signed request cannot be signed, declined, verified or read again
    r = await client("submit", submitBody, ip);
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, "already_signed");
    assert.equal((await client("decline", { id, key, session }, ip)).status, 409);
    assert.equal((await client("document", { id, key, session }, ip)).status, 409);
    assert.equal((await client("verify", { id, key, value: "4821" }, ip)).status, 409);
    const reopened = await (await client("open", { id, key }, ip)).json();
    assert.equal(reopened.status, "signed");
    assert.equal(reopened.message, null);

    // office: status without the key hides ip / user agent
    st = await (await office("GET", `/api/sign/requests/${id}`)).json();
    assert.equal(st.status, "signed");
    assert.equal(st.signed_at, done.signed_at);
    assert.deepEqual([st.audit.verified, st.audit.attempts, st.audit.ip, st.audit.user_agent], [true, 1, null, null]);
    assert.equal(st.audit.consent_text, "קראתי את המסמך ואני מאשר/ת לחתום עליו באופן אלקטרוני");
    // ... and with the key returns them
    st = await (await office("GET", `/api/sign/requests/${id}`, { headers: { "X-Sign-Key": key } })).json();
    if (!LIVE) assert.equal(st.audit.ip, ip);
    assert.equal(st.audit.user_agent, "sign-test/1.0");

    // result
    assert.equal((await office("GET", `/api/sign/requests/${id}/result`)).status, 400, "X-Sign-Key is required");
    assert.equal((await office("GET", `/api/sign/requests/${id}/result`, { headers: { "X-Sign-Key": "C".repeat(43) } })).status, 403);
    assert.equal((await call("GET", `/api/sign/requests/${id}/result`, { headers: { "X-Sign-Key": key } })).status, 401, "key alone is not office auth");
    r = await office("GET", `/api/sign/requests/${id}/result`, { headers: { "X-Sign-Key": key } });
    assert.equal(r.status, 200);
    const result = await r.json();
    assert.ok(Buffer.from(result.signature_png_b64, "base64").equals(goodSig), "signature round-trips");
    assert.equal(result.signed_name, SIGNER);
    assert.equal(result.signed_at, done.signed_at);
    assert.equal(result.pdf_sha256, PDF_SHA);
    assert.equal(result.audit.verified, true);
    assert.equal(result.audit.user_agent, "sign-test/1.0");

    // delete → every byte gone
    r = await office("DELETE", `/api/sign/requests/${id}`);
    assert.equal(r.status, 200);
    if (!LIVE) assert.equal(kv.signKeys().filter(k => k.includes(id)).length, 0);
    assert.equal((await office("GET", `/api/sign/requests/${id}`)).status, 404);
    assert.equal((await office("GET", `/api/sign/requests/${id}/result`, { headers: { "X-Sign-Key": key } })).status, 404);
    assert.equal((await office("DELETE", `/api/sign/requests/${id}`)).status, 404);
    assert.equal((await client("open", { id, key }, ip)).status, 404);
});

test("lock: five wrong values lock the request, the office sees it, the PDF is dropped", async () => {
    const ip = newIp();
    const { id, key } = await create({ verify: { kind: "code", value: "ab-12 cd" } });
    await client("open", { id, key }, ip);
    for (let i = 1; i <= 4; i++) {
        const r = await client("verify", { id, key, value: "WRONG" + i }, ip);
        assert.equal(r.status, 401);
        assert.equal((await r.json()).attempts_left, 5 - i);
    }
    let r = await client("verify", { id, key, value: "WRONG5" }, ip);
    assert.equal(r.status, 423);
    assert.equal((await r.json()).error, "locked");
    // the correct code no longer helps
    r = await client("verify", { id, key, value: "AB12CD" }, ip);
    assert.equal(r.status, 423);
    assert.equal((await (await client("open", { id, key }, ip)).json()).status, "locked");

    const st = await (await office("GET", `/api/sign/requests/${id}`)).json();
    assert.equal(st.locked, true);
    assert.match(st.locked_at, ISO_RE);
    assert.equal(st.audit.attempts, 5);
    assert.equal(st.audit.verified, false);
    if (!LIVE) assert.deepEqual(kv.signKeys().filter(k => k.includes(id)), [`sign:${id}`]);
    await office("DELETE", `/api/sign/requests/${id}`);
});

test("code verification is case and separator insensitive; a second request's session does not cross over", async () => {
    const ip = newIp();
    const a = await create({ verify: { kind: "code", value: "ab-12 cd" }, fields: [] });
    const b = await create({ fields: [] });
    const va = await (await client("verify", { id: a.id, key: a.key, value: "AB12CD" }, ip)).json();
    assert.ok(va.session);
    assert.deepEqual(va.fields, []);
    // a's session/key against b, and b's id with a's key
    assert.equal((await client("document", { id: b.id, key: b.key, session: va.session }, ip)).status, 401);
    assert.equal((await client("open", { id: b.id, key: a.key }, ip)).status, 404);
    await office("DELETE", `/api/sign/requests/${a.id}`);
    await office("DELETE", `/api/sign/requests/${b.id}`);
});

test("unknown id and wrong key are indistinguishable; malformed input is rejected", async () => {
    const ip = newIp();
    const { id, key } = await create();
    const r1 = await client("open", { id, key: "D".repeat(43) }, ip);
    const r2 = await client("open", { id: "E".repeat(22), key }, ip);
    assert.equal(r1.status, 404);
    assert.equal(r2.status, 404);
    assert.equal(await r1.text(), await r2.text());
    assert.equal((await client("open", { id: "../../x", key }, ip)).status, 404);
    assert.equal((await client("open", {}, ip)).status, 404);
    assert.equal((await call("POST", "/api/sign/open", { body: JSON.stringify({ id, key }), raw: true, headers: { "Content-Type": "text/plain" } })).status, 415);
    assert.equal((await client("open", { id, key, pad: "x".repeat(5000) }, ip)).status, 413);
    assert.equal((await call("GET", "/api/sign/open")).status, 404);
    await office("DELETE", `/api/sign/requests/${id}`);
});

test("decline: recorded, reason readable only with the key, PDF dropped", async () => {
    const ip = newIp();
    const { id, key } = await create();
    await client("open", { id, key }, ip);
    assert.equal((await client("decline", { id, key, reason: "x" }, ip)).status, 401, "decline needs a verified session");
    const { session } = await (await client("verify", { id, key, value: "4821" }, ip)).json();
    const r = await client("decline", { id, key, session, reason: "סיבת בדיקה QW9" }, ip);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "declined");
    let st = await (await office("GET", `/api/sign/requests/${id}`)).json();
    assert.equal(st.status, "declined");
    assert.equal(st.decline_reason, null);
    st = await (await office("GET", `/api/sign/requests/${id}`, { headers: { "X-Sign-Key": key } })).json();
    assert.equal(st.decline_reason, "סיבת בדיקה QW9");
    assert.equal((await office("GET", `/api/sign/requests/${id}/result`, { headers: { "X-Sign-Key": key } })).status, 409);
    assert.equal((await client("submit", { id, key, session, signature_png_b64: png().toString("base64"), signed_name: SIGNER, consent: true }, ip)).status, 409);
    if (!LIVE) {
        assert.deepEqual(kv.signKeys().filter(k => k.includes(id)), [`sign:${id}`]);
        assert.equal(kv.dump().includes(Buffer.from("QW9")), false);
    }
    await office("DELETE", `/api/sign/requests/${id}`);
});

test("CORS: none on office endpoints, site origin only on client endpoints", memOnly, async () => {
    const { id, key } = await create();
    const o = await office("GET", `/api/sign/requests/${id}`, { headers: { Origin: "https://asor-law.com" } });
    assert.equal(o.headers.get("Access-Control-Allow-Origin"), null);
    const pre = await call("OPTIONS", "/api/sign/requests", { headers: { Origin: "https://asor-law.com", "Access-Control-Request-Method": "POST" } });
    assert.equal(pre.headers.get("Access-Control-Allow-Origin"), null);
    const c1 = await client("open", { id, key }, newIp(), { Origin: "https://asor-law.com" });
    assert.equal(c1.headers.get("Access-Control-Allow-Origin"), "https://asor-law.com");
    const c2 = await client("open", { id, key }, newIp(), { Origin: "https://evil.example" });
    assert.equal(c2.headers.get("Access-Control-Allow-Origin"), null);
    await office("DELETE", `/api/sign/requests/${id}`);
});

test("expiry and automatic deletion (KV expirations)", memOnly, async () => {
    const ip = newIp();
    // default = 168 h
    const d = await create();
    assert.equal(Math.round((Date.parse(d.expires_at) - Date.now()) / HOUR), 168);
    await office("DELETE", `/api/sign/requests/${d.id}`);

    // --- unsigned request: expires, document dies at expiry, record 7 days later
    const { id, key } = await create({ expires_hours: 2 });
    const { session } = await (await client("verify", { id, key, value: "4821" }, ip)).json();
    advance(31 * 60 * 1000);
    assert.equal((await client("document", { id, key, session }, ip)).status, 401, "session lives 30 minutes");
    advance(2 * HOUR);
    assert.equal((await (await client("open", { id, key }, ip)).json()).status, "expired");
    let r = await client("verify", { id, key, value: "4821" }, ip);
    assert.equal(r.status, 409);
    assert.equal((await r.json()).status, "expired");
    assert.equal((await (await office("GET", `/api/sign/requests/${id}`)).json()).status, "expired");
    assert.deepEqual(kv.signKeys().filter(k => k.includes(id)), [`sign:${id}`], "PDF gone at expiry");
    advance(7 * DAY - 3 * HOUR);
    assert.equal((await office("GET", `/api/sign/requests/${id}`)).status, 200, "record still there just before expiry + 7d");
    advance(4 * HOUR);
    assert.equal((await office("GET", `/api/sign/requests/${id}`)).status, 404, "record purged at expiry + 7d");
    assert.equal(kv.signKeys().filter(k => k.includes(id)).length, 0);

    // --- signed request: purged 30 days after signing, even if expiry was far away
    const s = await create({ expires_hours: 720 });
    const ip2 = newIp();
    const ver = await (await client("verify", { id: s.id, key: s.key, value: "4821" }, ip2)).json();
    await client("document", { id: s.id, key: s.key, session: ver.session }, ip2);
    r = await client("submit", { id: s.id, key: s.key, session: ver.session, signature_png_b64: png().toString("base64"), signed_name: SIGNER, consent: true }, ip2);
    assert.equal(r.status, 200);
    advance(29 * DAY);
    assert.equal((await office("GET", `/api/sign/requests/${s.id}/result`, { headers: { "X-Sign-Key": s.key } })).status, 200);
    advance(1 * DAY + HOUR);
    assert.equal((await office("GET", `/api/sign/requests/${s.id}`)).status, 404);
    assert.equal(kv.signKeys().filter(k => k.includes(s.id)).length, 0, "signature + record purged 30 days after signing");
});

test("rate limits: per IP on verify, per request id on open", memOnly, async () => {
    advance(2 * 60 * 1000); // fresh window
    const ip = newIp();
    const { id, key } = await create();
    const codes = [];
    for (let i = 0; i < 12; i++) codes.push((await client("verify", { id: "F".repeat(22), key, value: "1" }, ip)).status);
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(404));
    assert.deepEqual(codes.slice(10), [429, 429]);

    const seen = [];
    for (let i = 0; i < 32; i++) seen.push((await client("open", { id, key }, newIp())).status);
    assert.equal(seen.filter(x => x === 200).length, 30);
    assert.equal(seen.filter(x => x === 429).length, 2);
    await office("DELETE", `/api/sign/requests/${id}`);
});
