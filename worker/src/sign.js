/**
 * sign.js — remote signing ("חתימה מרחוק"), public half.
 *
 * Contract: docs/remote-signing-api.md (the office app is built against it).
 *
 * Office endpoints (Authorization: Bearer <SIGN_API_KEY>, no CORS):
 *   POST   /api/sign/requests
 *   GET    /api/sign/requests/:id
 *   GET    /api/sign/requests/:id/result      (X-Sign-Key required)
 *   DELETE /api/sign/requests/:id
 *
 * Client endpoints (public, called by /sign/ on the website):
 *   POST /api/sign/open | verify | document | submit | decline
 *
 * Storage: ORDERS_KV, three keys per request, all with a KV expiration:
 *   sign:<id>       JSON record (state machine, counters, encrypted personal fields)
 *   sign:<id>:pdf   AES-GCM(iv|ciphertext) of the original PDF
 *   sign:<id>:sig   AES-GCM(iv|ciphertext) of the signature PNG
 *
 * The 256-bit request key exists only in the signing URL fragment. The Worker
 * derives an AES-GCM key and an HMAC key from it per call and never stores it,
 * so a dump of the KV namespace alone reveals no document, name, IP or signature.
 *
 * Nothing in this file logs request content. Do not add console.log of bodies.
 */

import { Hono } from "hono";
import { Buffer } from "node:buffer";
import { rateLimit } from "./security.js";

// ---------- limits and constants ----------
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_CREATE_BODY = 14.5 * 1024 * 1024;      // base64 of 10 MB + JSON envelope
const MAX_SIG_BYTES = 300 * 1024;
const MAX_SUBMIT_BODY = 450 * 1024;
const MAX_SMALL_BODY = 4 * 1024;
const MAX_ATTEMPTS = 5;
const DEFAULT_EXPIRES_HOURS = 168;
const MAX_EXPIRES_HOURS = 720;
const SESSION_TTL_MS = 30 * 60 * 1000;
const PURGE_AFTER_EXPIRY_S = 7 * 24 * 3600;
const PURGE_AFTER_DONE_S = 30 * 24 * 3600;
const MAX_FIELDS = 20;
const MIN_API_KEY_LEN = 32;

const FIRM_NAME = "עשור ושות' - עורכי דין";
export const CONSENT_TEXT = "קראתי את המסמך ואני מאשר/ת לחתום עליו באופן אלקטרוני";

const ID_RE = /^[A-Za-z0-9_-]{22}$/;      // 128 bit
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;     // 256 bit
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

const te = new TextEncoder();
const td = new TextDecoder();

// ---------- small helpers ----------
const nowMs = () => Date.now();
const iso = ms => new Date(ms).toISOString();
const recKey = id => `sign:${id}`;
const pdfKey = id => `sign:${id}:pdf`;
const sigKey = id => `sign:${id}:sig`;
const b64u = bytes => Buffer.from(bytes).toString("base64url");
const b64 = bytes => Buffer.from(bytes).toString("base64");
const randomB64u = n => b64u(crypto.getRandomValues(new Uint8Array(n)));

async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
const hex = bytes => Buffer.from(bytes).toString("hex");

/** Constant-time comparison of two byte arrays of equal length. */
function ctEqualBytes(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}
/** Constant-time string comparison (hash first so length does not leak). */
async function ctEqualStrings(a, b) {
    const [ha, hb] = await Promise.all([sha256(te.encode(String(a))), sha256(te.encode(String(b)))]);
    return ctEqualBytes(ha, hb);
}

function decodeBase64Strict(str, maxBytes) {
    if (typeof str !== "string" || str.length === 0) return null;
    if (str.length % 4 !== 0) return null;
    if (str.length > Math.ceil(maxBytes / 3) * 4 + 4) return "too_large";
    if (!B64_RE.test(str)) return null;
    const buf = Buffer.from(str, "base64");
    if (buf.length > maxBytes) return "too_large";
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

// ---------- crypto: everything derives from the URL key ----------
async function deriveKeys(keyB64u) {
    if (typeof keyB64u !== "string" || !KEY_RE.test(keyB64u)) return null;
    const raw = Buffer.from(keyB64u, "base64url");
    if (raw.length !== 32) return null;
    const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    const hk = info => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode(info) });
    const enc = await crypto.subtle.deriveKey(hk("asor-sign/v1/enc"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const mac = await crypto.subtle.deriveKey(hk("asor-sign/v1/verify"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
    return { enc, mac };
}

/** AES-GCM seal → iv(12) | ciphertext+tag. `aad` binds the blob to its request and purpose. */
async function seal(encKey, aad, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(aad) }, encKey, bytes));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return out;
}
async function unseal(encKey, aad, blob) {
    const u = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12), additionalData: te.encode(aad) }, encKey, u.subarray(12));
    return new Uint8Array(pt);
}
const sealJson = async (k, aad, obj) => b64(await seal(k, aad, te.encode(JSON.stringify(obj))));
const unsealJson = async (k, aad, str) => JSON.parse(td.decode(await unseal(k, aad, Buffer.from(str, "base64"))));

function normalizeVerifyValue(kind, value) {
    const s = String(value ?? "").trim();
    if (kind === "id_last4") return s.replace(/\D/g, "");
    return s.replace(/[\s-]/g, "").toUpperCase();
}
async function verifyHash(macKey, saltB64, kind, value) {
    const msg = te.encode(`${saltB64}|${kind}|${normalizeVerifyValue(kind, value)}`);
    return new Uint8Array(await crypto.subtle.sign("HMAC", macKey, msg));
}

// ---------- validation ----------
function isPdf(bytes) {
    // "%PDF-" at offset 0
    return bytes.length >= 8 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** Best-effort page count without parsing the PDF (null when it cannot be told). */
function guessPageCount(bytes) {
    try {
        const s = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("latin1");
        const m = s.match(/\/Type\s*\/Page(?![A-Za-z])/g);
        return m && m.length > 0 ? m.length : null;
    } catch {
        return null;
    }
}

/** Structural PNG check: signature, IHDR first, sane dimensions, chunk walk ending in IEND. */
function isValidPng(b) {
    const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < 57) return false;
    for (let i = 0; i < 8; i++) if (b[i] !== SIG[i]) return false;
    const dv = new DataView(b.buffer, b.byteOffset, b.length);
    const type = o => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (dv.getUint32(8) !== 13 || type(12) !== "IHDR") return false;
    const w = dv.getUint32(16), h = dv.getUint32(20);
    if (w < 1 || h < 1 || w > 4000 || h > 4000) return false;
    if (![1, 2, 4, 8, 16].includes(b[24]) || ![0, 2, 3, 4, 6].includes(b[25])) return false;
    let off = 8, sawIdat = false, chunks = 0;
    while (off + 12 <= b.length) {
        const len = dv.getUint32(off);
        const t = type(off + 4);
        if (len > b.length || off + 12 + len > b.length) return false;
        if (++chunks > 5000) return false;
        if (t === "IDAT") sawIdat = true;
        off += 12 + len;
        if (t === "IEND") return len === 0 && sawIdat && off === b.length;
    }
    return false;
}

function cleanText(v, max) {
    if (typeof v !== "string") return null;
    // strip control chars except newline/tab
    const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    if (s.length === 0 || s.length > max) return null;
    return s;
}

function validateFields(fields, pageCount) {
    if (fields === undefined || fields === null) return [];
    if (!Array.isArray(fields) || fields.length > MAX_FIELDS) return null;
    const out = [];
    const frac = n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
    for (const f of fields) {
        if (!f || typeof f !== "object") return null;
        const { page, x, y, w, h } = f;
        if (!Number.isInteger(page) || page < 1 || page > 5000) return null;
        if (pageCount && page > pageCount) return null;
        if (!frac(x) || !frac(y) || !frac(w) || !frac(h) || w <= 0 || h <= 0) return null;
        if (x + w > 1.0001 || y + h > 1.0001) return null;
        out.push({ page, x, y, w, h });
    }
    return out;
}

// ---------- responses ----------
const err = (c, status, code, extra) => c.json({ error: code, ...(extra || {}) }, status);

async function readJson(c, maxBytes) {
    const ct = (c.req.header("Content-Type") || "").toLowerCase();
    if (!ct.startsWith("application/json")) return { fail: err(c, 415, "unsupported_media_type") };
    const declared = parseInt(c.req.header("Content-Length") || "0", 10);
    if (declared && declared > maxBytes) return { fail: err(c, 413, "payload_too_large") };
    let text;
    try { text = await c.req.raw.text(); } catch { return { fail: err(c, 400, "invalid_body") }; }
    if (text.length > maxBytes) return { fail: err(c, 413, "payload_too_large") };
    let body;
    try { body = JSON.parse(text); } catch { return { fail: err(c, 400, "invalid_json") }; }
    if (!body || typeof body !== "object" || Array.isArray(body)) return { fail: err(c, 400, "invalid_json") };
    return { body };
}

// ---------- KV access ----------
async function loadRecord(env, id) {
    if (typeof id !== "string" || !ID_RE.test(id)) return null;
    const raw = await env.ORDERS_KV.get(recKey(id));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
}
const kvExpiration = epochS => Math.max(epochS, Math.floor(nowMs() / 1000) + 61);
async function saveRecord(env, rec) {
    await env.ORDERS_KV.put(recKey(rec.id), JSON.stringify(rec), { expiration: kvExpiration(rec.purge_at) });
}
async function purgeAll(env, id) {
    await Promise.all([env.ORDERS_KV.delete(recKey(id)), env.ORDERS_KV.delete(pdfKey(id)), env.ORDERS_KV.delete(sigKey(id))]);
}

/** Fixed-window counter in KV (same approach as security.js). Returns false when over the limit. */
async function throttle(env, key, limit, windowSec = 60) {
    const bucket = Math.floor(nowMs() / 1000 / windowSec);
    const k = `rl:${key}:${bucket}`;
    let count = 0;
    try { count = parseInt((await env.ORDERS_KV.get(k)) || "0", 10) || 0; } catch { /* fail open */ }
    if (count >= limit) return false;
    try { await env.ORDERS_KV.put(k, String(count + 1), { expirationTtl: Math.max(60, windowSec * 2) }); } catch { /* ignore */ }
    return true;
}

// ---------- state ----------
function officeStatus(rec) {
    if (rec.status === "signed" || rec.status === "declined") return rec.status;
    if (nowMs() >= Date.parse(rec.expires_at)) return "expired";
    return rec.status; // "pending" | "viewed"
}
function clientStatus(rec) {
    const s = officeStatus(rec);
    if ((s === "pending" || s === "viewed") && rec.locked) return "locked";
    return s;
}
const isActive = rec => { const s = clientStatus(rec); return s === "pending" || s === "viewed"; };
const firstName = full => String(full || "").trim().split(/\s+/)[0] || "";

function publicAudit(rec, secret) {
    return {
        ip: secret ? secret.ip : null,
        user_agent: secret ? secret.user_agent : null,
        verified: Boolean(rec.verified),
        consent_text: rec.consent_text || null,
        attempts: rec.verify.attempts,
        verify_kind: rec.verify.kind,
        verified_at: rec.verified_at || null,
        document_served_at: rec.document_served_at || null,
    };
}

/** Authenticates the URL key by decrypting the metadata blob. Returns { keys, meta } or null. */
async function openWithKey(rec, key) {
    const keys = await deriveKeys(key);
    if (!keys) return null;
    try {
        const meta = await unsealJson(keys.enc, `${rec.id}:meta`, rec.enc_meta);
        return { keys, meta };
    } catch {
        return null;
    }
}

async function sessionOk(rec, token) {
    if (!rec.session || typeof token !== "string" || !TOKEN_RE.test(token)) return false;
    if (nowMs() >= Date.parse(rec.session.expires_at)) return false;
    const h = await sha256(te.encode(token));
    return ctEqualBytes(h, Buffer.from(rec.session.hash, "base64"));
}

const clientIp = c => (c.req.header("CF-Connecting-IP") || "").slice(0, 64) || null;
const clientUa = c => (c.req.header("User-Agent") || "").replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 400) || null;

// =====================================================================
const sign = new Hono();

// Every /api/sign response: never cached, never indexed.
sign.use("*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
});

sign.onError((e, c) => {
    // Name only — an error message may echo request content.
    console.error("sign: internal error", e && e.name);
    return c.json({ error: "internal" }, 500);
});

// ---------- office auth ----------
async function officeAuth(c, next) {
    const secret = c.env.SIGN_API_KEY;
    if (typeof secret !== "string" || secret.length < MIN_API_KEY_LEN) return err(c, 503, "signing_not_configured");
    const h = c.req.header("Authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    if (!token || !(await ctEqualStrings(token, secret))) {
        c.header("WWW-Authenticate", "Bearer");
        return err(c, 401, "unauthorized");
    }
    await next();
}
const officeLimit = rateLimit({ limit: 120, prefix: "rl:signoffice" });
sign.use("/requests", officeLimit, officeAuth);
sign.use("/requests/*", officeLimit, officeAuth);

// ---------- 1. create ----------
sign.post("/requests", async c => {
    const { body, fail } = await readJson(c, MAX_CREATE_BODY);
    if (fail) return fail;

    const title = cleanText(body.title, 200);
    const signerName = cleanText(body.signer_name, 120);
    if (!title) return err(c, 400, "invalid_title");
    if (!signerName) return err(c, 400, "invalid_signer_name");
    let message = null;
    if (body.message !== undefined && body.message !== null && body.message !== "") {
        message = cleanText(body.message, 1000);
        if (!message) return err(c, 400, "invalid_message");
    }

    const v = body.verify;
    if (!v || typeof v !== "object" || !["id_last4", "code"].includes(v.kind) || typeof v.value !== "string") {
        return err(c, 400, "invalid_verify");
    }
    const norm = normalizeVerifyValue(v.kind, v.value);
    if (v.kind === "id_last4" ? !/^\d{4}$/.test(v.value.trim()) : (norm.length < 4 || norm.length > 64)) {
        return err(c, 400, "invalid_verify");
    }

    let hours = DEFAULT_EXPIRES_HOURS;
    if (body.expires_hours !== undefined && body.expires_hours !== null) {
        if (!Number.isInteger(body.expires_hours) || body.expires_hours < 1 || body.expires_hours > MAX_EXPIRES_HOURS) {
            return err(c, 400, "invalid_expires_hours");
        }
        hours = body.expires_hours;
    }

    const pdf = decodeBase64Strict(body.pdf_b64, MAX_PDF_BYTES);
    if (pdf === "too_large") return err(c, 413, "pdf_too_large");
    if (!pdf) return err(c, 400, "invalid_pdf_b64");
    if (!isPdf(pdf)) return err(c, 400, "not_a_pdf");

    let pageCount = null;
    if (body.page_count !== undefined && body.page_count !== null) {
        if (!Number.isInteger(body.page_count) || body.page_count < 1 || body.page_count > 5000) return err(c, 400, "invalid_page_count");
        pageCount = body.page_count;
    } else {
        pageCount = guessPageCount(pdf);
    }
    const fields = validateFields(body.fields, pageCount);
    if (!fields) return err(c, 400, "invalid_fields");

    const id = randomB64u(16);
    const key = randomB64u(32);
    const keys = await deriveKeys(key);
    const created = nowMs();
    const expires = created + hours * 3600 * 1000;
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));

    const rec = {
        v: 1,
        id,
        status: "pending",
        locked: false,
        locked_at: null,
        created_at: iso(created),
        viewed_at: null,
        signed_at: null,
        declined_at: null,
        expires_at: iso(expires),
        purge_at: Math.floor(expires / 1000) + PURGE_AFTER_EXPIRY_S,
        verify: { kind: v.kind, salt, hash: b64(await verifyHash(keys.mac, salt, v.kind, v.value)), attempts: 0 },
        verified: false,
        verified_at: null,
        session: null,
        document_served_at: null,
        consent_text: null,
        pdf_sha256: hex(await sha256(pdf)),
        pdf_bytes: pdf.length,
        page_count: pageCount,
        fields,
        enc_meta: await sealJson(keys.enc, `${id}:meta`, { title, signer_name: signerName, message }),
        enc_audit: null,
        enc_signed: null,
        enc_decline: null,
    };

    // The document itself dies at expiry; the (encrypted, tiny) record lingers 7 more days
    // so the office can still read "expired".
    await c.env.ORDERS_KV.put(pdfKey(id), await seal(keys.enc, `${id}:pdf`, pdf), {
        expiration: kvExpiration(Math.floor(expires / 1000)),
    });
    await saveRecord(c.env, rec);

    const base = (c.env.SIGN_PAGE_URL || `${c.env.RETURN_URL_BASE || "https://asor-law.com"}/sign/`).trim();
    return c.json({ id, url: `${base}#${id}.${key}`, expires_at: rec.expires_at }, 201);
});

// ---------- 2. status ----------
sign.get("/requests/:id", async c => {
    const rec = await loadRecord(c.env, c.req.param("id"));
    if (!rec) return err(c, 404, "not_found");

    // IP / user agent / decline reason are encrypted at rest. They are returned only
    // when the office also presents the request key.
    let secret = null, declineReason = null;
    const key = c.req.header("X-Sign-Key");
    if (key) {
        const opened = await openWithKey(rec, key);
        if (!opened) return err(c, 403, "wrong_key");
        try {
            if (rec.enc_audit) secret = await unsealJson(opened.keys.enc, `${rec.id}:audit`, rec.enc_audit);
            if (rec.enc_decline) declineReason = (await unsealJson(opened.keys.enc, `${rec.id}:decline`, rec.enc_decline)).reason;
        } catch { return err(c, 403, "wrong_key"); }
    }
    return c.json({
        status: officeStatus(rec),
        created_at: rec.created_at,
        viewed_at: rec.viewed_at,
        signed_at: rec.signed_at,
        expires_at: rec.expires_at,
        audit: publicAudit(rec, secret),
        // additions to the contract (see docs):
        locked: Boolean(rec.locked),
        locked_at: rec.locked_at,
        declined_at: rec.declined_at,
        decline_reason: declineReason,
    });
});

// ---------- 3. result ----------
sign.get("/requests/:id/result", async c => {
    const rec = await loadRecord(c.env, c.req.param("id"));
    if (!rec) return err(c, 404, "not_found");
    if (rec.status !== "signed") return err(c, 409, "not_signed", { status: officeStatus(rec) });
    const key = c.req.header("X-Sign-Key");
    if (!key) return err(c, 400, "missing_sign_key");
    const opened = await openWithKey(rec, key);
    if (!opened) return err(c, 403, "wrong_key");

    const blob = await c.env.ORDERS_KV.get(sigKey(rec.id), { type: "arrayBuffer" });
    if (!blob) return err(c, 404, "not_found");
    let png, secret, signed;
    try {
        png = await unseal(opened.keys.enc, `${rec.id}:sig`, blob);
        secret = await unsealJson(opened.keys.enc, `${rec.id}:audit`, rec.enc_audit);
        signed = await unsealJson(opened.keys.enc, `${rec.id}:signed`, rec.enc_signed);
    } catch { return err(c, 403, "wrong_key"); }

    return c.json({
        signature_png_b64: b64(png),
        signed_name: signed.signed_name,
        signed_at: rec.signed_at,
        audit: publicAudit(rec, secret),
        pdf_sha256: rec.pdf_sha256,
        fields: rec.fields,
    });
});

// ---------- 4. delete ----------
sign.delete("/requests/:id", async c => {
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return err(c, 404, "not_found");
    const existed = Boolean(await c.env.ORDERS_KV.get(recKey(id)));
    await purgeAll(c.env, id); // always purge all three keys, even if the record is already gone
    return existed ? c.json({ deleted: true }) : err(c, 404, "not_found");
});

// =====================================================================
// Client endpoints
// =====================================================================
const ipLimit = rateLimit({ limit: 40, prefix: "rl:sign" });
const ipLimitVerify = rateLimit({ limit: 10, prefix: "rl:signv" });

/** Shared preamble: parse body, per-id throttle, load record, authenticate the key. */
async function clientContext(c, maxBody, perIdLimit, bucket = "use") {
    const { body, fail } = await readJson(c, maxBody);
    if (fail) return { fail };
    const { id, key } = body;
    if (typeof id !== "string" || !ID_RE.test(id) || typeof key !== "string" || !KEY_RE.test(key)) {
        return { fail: err(c, 404, "not_found") };
    }
    if (!(await throttle(c.env, `signid:${bucket}:${id}`, perIdLimit))) {
        c.header("Retry-After", "60");
        return { fail: err(c, 429, "too_many_requests") };
    }
    const rec = await loadRecord(c.env, id);
    // Unknown id and wrong key are indistinguishable to the caller.
    if (!rec) return { fail: err(c, 404, "not_found") };
    const opened = await openWithKey(rec, key);
    if (!opened) return { fail: err(c, 404, "not_found") };
    return { body, rec, keys: opened.keys, meta: opened.meta };
}

function clientView(rec, meta) {
    const status = clientStatus(rec);
    const active = status === "pending" || status === "viewed";
    return {
        status,
        firm_name: FIRM_NAME,
        title: meta.title,
        signer_first_name: firstName(meta.signer_name),
        message: active ? meta.message : null,
        page_count: rec.page_count,
        verify_kind: rec.verify.kind,
        attempts_left: Math.max(0, MAX_ATTEMPTS - rec.verify.attempts),
        expires_at: rec.expires_at,
        signed_at: rec.signed_at,
        declined_at: rec.declined_at,
        consent_text: CONSENT_TEXT,
    };
}

sign.post("/open", ipLimit, async c => {
    const ctx = await clientContext(c, MAX_SMALL_BODY, 30);
    if (ctx.fail) return ctx.fail;
    const { rec, meta } = ctx;
    if (rec.status === "pending" && isActive(rec)) {
        rec.status = "viewed";
        rec.viewed_at = iso(nowMs());
        await saveRecord(c.env, rec);
    }
    return c.json(clientView(rec, meta));
});

sign.post("/verify", ipLimitVerify, async c => {
    const ctx = await clientContext(c, MAX_SMALL_BODY, 10, "verify");
    if (ctx.fail) return ctx.fail;
    const { body, rec, keys } = ctx;
    const status = clientStatus(rec);
    if (status === "locked") return err(c, 423, "locked", { status, attempts_left: 0 });
    if (status !== "pending" && status !== "viewed") return err(c, 409, "not_active", { status });
    if (typeof body.value !== "string" || body.value.length === 0 || body.value.length > 100) {
        return err(c, 400, "invalid_value");
    }

    const got = await verifyHash(keys.mac, rec.verify.salt, rec.verify.kind, body.value);
    const ok = ctEqualBytes(got, Buffer.from(rec.verify.hash, "base64"));

    if (!ok) {
        rec.verify.attempts += 1;
        const left = Math.max(0, MAX_ATTEMPTS - rec.verify.attempts);
        if (left === 0) {
            rec.locked = true;
            rec.locked_at = iso(nowMs());
            rec.session = null;
        }
        await saveRecord(c.env, rec);
        if (left === 0) {
            // A locked request is dead: drop the document right away.
            await c.env.ORDERS_KV.delete(pdfKey(rec.id));
            return err(c, 423, "locked", { status: "locked", attempts_left: 0 });
        }
        return err(c, 401, "wrong_value", { attempts_left: left });
    }

    const token = randomB64u(32);
    const now = nowMs();
    rec.verified = true;
    rec.verified_at = rec.verified_at || iso(now);
    rec.session = { hash: b64(await sha256(te.encode(token))), expires_at: iso(now + SESSION_TTL_MS) };
    if (rec.status === "pending") { rec.status = "viewed"; rec.viewed_at = iso(now); }
    await saveRecord(c.env, rec);

    return c.json({
        session: token,
        session_expires_at: rec.session.expires_at,
        page_count: rec.page_count,
        fields: rec.fields,
        consent_text: CONSENT_TEXT,
    });
});

/** Session-gated preamble for document / submit / decline. */
async function sessionContext(c, maxBody) {
    const ctx = await clientContext(c, maxBody, 30);
    if (ctx.fail) return ctx;
    const status = clientStatus(ctx.rec);
    if (status === "signed") return { fail: err(c, 409, "already_signed", { status }) };
    if (status !== "pending" && status !== "viewed") return { fail: err(c, 409, "not_active", { status }) };
    if (!(await sessionOk(ctx.rec, ctx.body.session))) return { fail: err(c, 401, "session_invalid") };
    return ctx;
}

sign.post("/document", ipLimit, async c => {
    const ctx = await sessionContext(c, MAX_SMALL_BODY);
    if (ctx.fail) return ctx.fail;
    const { rec, keys } = ctx;
    const blob = await c.env.ORDERS_KV.get(pdfKey(rec.id), { type: "arrayBuffer" });
    if (!blob) return err(c, 404, "not_found");
    let pdf;
    try { pdf = await unseal(keys.enc, `${rec.id}:pdf`, blob); } catch { return err(c, 404, "not_found"); }
    if (!rec.document_served_at) {
        rec.document_served_at = iso(nowMs());
        await saveRecord(c.env, rec);
    }
    return new Response(pdf, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdf.length),
            "Content-Disposition": "inline; filename=\"document.pdf\"",
        },
    });
});

sign.post("/submit", ipLimit, async c => {
    const ctx = await sessionContext(c, MAX_SUBMIT_BODY);
    if (ctx.fail) return ctx.fail;
    const { body, rec, keys } = ctx;
    if (body.consent !== true) return err(c, 400, "consent_required");
    if (!rec.document_served_at) return err(c, 409, "document_not_viewed");
    const signedName = cleanText(body.signed_name, 120);
    if (!signedName || signedName.length < 2) return err(c, 400, "invalid_signed_name");
    const png = decodeBase64Strict(body.signature_png_b64, MAX_SIG_BYTES);
    if (png === "too_large") return err(c, 413, "signature_too_large");
    if (!png || !isValidPng(png)) return err(c, 400, "invalid_signature_png");

    const now = nowMs();
    const purgeAt = Math.floor(now / 1000) + PURGE_AFTER_DONE_S;
    await c.env.ORDERS_KV.put(sigKey(rec.id), await seal(keys.enc, `${rec.id}:sig`, png), { expiration: purgeAt });

    rec.status = "signed";
    rec.signed_at = iso(now);
    rec.consent_text = CONSENT_TEXT;
    rec.session = null;                 // one signature per request; the session dies with it
    rec.purge_at = purgeAt;
    rec.enc_audit = await sealJson(keys.enc, `${rec.id}:audit`, { ip: clientIp(c), user_agent: clientUa(c) });
    rec.enc_signed = await sealJson(keys.enc, `${rec.id}:signed`, { signed_name: signedName });
    await saveRecord(c.env, rec);

    // The office holds the original; the cloud copy is no longer needed.
    await c.env.ORDERS_KV.delete(pdfKey(rec.id));

    return c.json({ status: "signed", signed_at: rec.signed_at });
});

sign.post("/decline", ipLimit, async c => {
    const ctx = await sessionContext(c, MAX_SMALL_BODY);
    if (ctx.fail) return ctx.fail;
    const { body, rec, keys } = ctx;
    let reason = null;
    if (body.reason !== undefined && body.reason !== null && body.reason !== "") {
        reason = cleanText(body.reason, 500);
        if (!reason) return err(c, 400, "invalid_reason");
    }
    const now = nowMs();
    rec.status = "declined";
    rec.declined_at = iso(now);
    rec.session = null;
    rec.purge_at = Math.floor(now / 1000) + PURGE_AFTER_DONE_S;
    rec.enc_audit = await sealJson(keys.enc, `${rec.id}:audit`, { ip: clientIp(c), user_agent: clientUa(c) });
    rec.enc_decline = await sealJson(keys.enc, `${rec.id}:decline`, { reason });
    await saveRecord(c.env, rec);
    await c.env.ORDERS_KV.delete(pdfKey(rec.id));
    return c.json({ status: "declined", declined_at: rec.declined_at });
});

sign.all("*", c => err(c, 404, "not_found"));

export default sign;
