/**
 * /sign/ — client side of remote signing. Vanilla ES module, no third-party requests.
 *
 * The link is  /sign/#<id>.<key>.  The key stays in the URL fragment (never sent as part of
 * a URL, never stored by the page) and is posted in the JSON body of each API call.
 * API contract: docs/remote-signing-api.md
 */

const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_BASE = LOCAL ? 'http://localhost:8787' : 'https://asor-digital-api.israel-486.workers.dev';

const $ = id => document.getElementById(id);
const state = {
    id: null, key: null, session: null,
    meta: null, fields: [],
    pdf: null, pdfLoaded: false, renderedWidth: 0,
};

// ---------------------------------------------------------------- API
class NetworkError extends Error {}

async function api(path, body, binary = false) {
    let res;
    try {
        res = await fetch(`${API_BASE}/api/sign/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.id, key: state.key, ...body }),
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
        });
    } catch {
        throw new NetworkError();
    }
    if (res.ok && binary) return { ok: true, status: res.status, buffer: await res.arrayBuffer() };
    let json = {};
    try { json = await res.json(); } catch { /* non-JSON error body */ }
    return { ok: res.ok, status: res.status, json };
}

// ---------------------------------------------------------------- screens
const STEP_OF = { verify: 1, document: 2 };

function show(name, focusEl) {
    document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== name; });
    const step = STEP_OF[name];
    const steps = $('steps');
    steps.hidden = !step;
    if (step) setStep(step);
    window.scrollTo(0, 0);
    if (focusEl) focusEl.focus({ preventScroll: true });
}
function setStep(n) {
    $('steps').querySelectorAll('li').forEach(li => {
        const s = Number(li.dataset.step);
        li.classList.toggle('is-done', s < n);
        li.classList.toggle('is-current', s === n);
        if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
}

const fmtWhen = isoStr => {
    try {
        const d = new Date(isoStr);
        const date = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
        const time = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        return { date, time };
    } catch {
        return { date: isoStr, time: '' };
    }
};

const STATES = {
    expired: { title: 'תוקף הקישור פג', text: 'לא ניתן עוד לחתום באמצעות קישור זה.', sub: 'לקבלת קישור חדש יש לפנות למשרד.' },
    signed: { title: 'המסמך כבר נחתם', text: '', sub: 'עותק חתום של המסמך יישלח אליכם מהמשרד.', ok: true },
    declined: { title: 'נרשם שבחרתם שלא לחתום', text: 'המשרד קיבל הודעה על כך.', sub: 'לכל שאלה אפשר לפנות למשרד.' },
    locked: { title: 'הקישור ננעל', text: 'מספר ניסיונות הזיהוי המותר הסתיים.', sub: 'לקבלת קישור חדש יש לפנות למשרד.', warn: true },
    notfound: { title: 'הקישור אינו תקין', text: 'ייתכן שהקישור הועתק באופן חלקי, או שהבקשה כבר אינה קיימת.', sub: 'נסו לפתוח שוב את הקישור המלא מההודעה שקיבלתם, או פנו למשרד.', warn: true },
    network: { title: 'אין חיבור לשרת', text: 'לא הצלחנו לטעון את המסמך.', sub: 'בדקו את החיבור לאינטרנט ונסו שוב.', retry: true, warn: true },
    busy: { title: 'יותר מדי בקשות', text: 'יש להמתין כדקה ולנסות שוב.', sub: '', retry: true },
    error: { title: 'אירעה תקלה', text: 'לא הצלחנו להשלים את הפעולה.', sub: 'נסו שוב בעוד רגע. אם התקלה חוזרת, פנו למשרד.', retry: true, warn: true },
};

function showState(kind, extra = {}) {
    const s = STATES[kind] || STATES.error;
    $('stateTitle').textContent = s.title;
    $('stateText').textContent = extra.text || s.text;
    $('stateText').hidden = !(extra.text || s.text);
    $('stateSub').textContent = s.sub;
    $('stateSub').hidden = !s.sub;
    $('stateRetry').hidden = !s.retry;
    const icon = $('stateIcon');
    icon.classList.toggle('s-icon-warn', Boolean(s.warn));
    icon.classList.toggle('s-icon-ok', Boolean(s.ok));
    icon.classList.toggle('s-icon-info', !s.warn && !s.ok);
    show('state', $('stateTitle'));
}

function showStatus(status, meta) {
    if (status === 'signed') {
        const m = meta || state.meta || {};
        let text = '';
        if (m.signed_at) { const w = fmtWhen(m.signed_at); text = `המסמך נחתם ביום ${w.date} בשעה ${w.time}.`; }
        return showState('signed', { text });
    }
    if (['expired', 'declined', 'locked'].includes(status)) return showState(status);
    return showState('error');
}

function setError(el, msg) {
    el.textContent = msg || '';
    el.hidden = !msg;
}
const MSG_NET = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
const MSG_BUSY = 'בוצעו יותר מדי ניסיונות. יש להמתין כדקה ולנסות שוב.';
const MSG_GENERIC = 'אירעה תקלה. נסו שוב בעוד רגע.';

/** Handles the responses that mean "leave this screen". Returns true when it navigated. */
function handleTerminal(res) {
    if (res.status === 404) { showState('notfound'); return true; }
    if (res.status === 423) { showState('locked'); return true; }
    if (res.status === 409 && res.json && res.json.status) { showStatus(res.json.status); return true; }
    if (res.status === 401 && res.json && res.json.error === 'session_invalid') { reverify(); return true; }
    return false;
}

// ---------------------------------------------------------------- 1. open
async function start() {
    // Never run inside someone else's frame (a meta CSP cannot express frame-ancestors).
    if (window.top !== window.self) return showState('notfound');
    const m = /^#([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(location.hash || '');
    if (!m) return showState('notfound');
    state.id = m[1];
    state.key = m[2];
    show('loading');

    let res;
    try { res = await api('open', {}); } catch { return showState('network'); }
    if (res.status === 429) return showState('busy');
    if (!res.ok) { if (!handleTerminal(res)) showState('error'); return; }

    const meta = state.meta = res.json;
    if (meta.status !== 'pending' && meta.status !== 'viewed') return showStatus(meta.status, meta);

    document.title = `${meta.title} | חתימה על מסמך | עשור ושות׳`;
    $('docTitle').textContent = meta.title;
    $('docTitle2').textContent = meta.title;
    $('firmName').textContent = meta.firm_name;
    $('hello').textContent = meta.signer_first_name ? `שלום ${meta.signer_first_name},` : 'שלום,';
    $('officeMessageBox').hidden = !meta.message;
    $('officeMessage').textContent = meta.message || '';
    $('consentText').textContent = meta.consent_text;

    const input = $('verifyInput');
    if (meta.verify_kind === 'id_last4') {
        $('verifyLabel').textContent = '4 הספרות האחרונות של מספר תעודת הזהות';
        input.inputMode = 'numeric';
        input.maxLength = 4;
        input.setAttribute('pattern', '[0-9]{4}');
    } else {
        $('verifyLabel').textContent = 'הקוד שקיבלתם מהמשרד';
        input.maxLength = 64;
        input.classList.add('s-input-code-long');
    }
    updateAttempts(meta.attempts_left);
    show('verify');
}

function updateAttempts(left) {
    $('verifyHint').textContent = left === 1 ? 'נותר ניסיון אחד.' : `נותרו ${left} ניסיונות.`;
}

function reverify() {
    state.session = null;
    setError($('verifyError'), 'פג תוקף הזיהוי. יש להזדהות שוב כדי להמשיך.');
    $('verifyInput').value = '';
    show('verify', $('verifyInput'));
}

// ---------------------------------------------------------------- 2. verify
$('verifyForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const input = $('verifyInput');
    const errEl = $('verifyError');
    const value = input.value.trim();
    const isId = state.meta.verify_kind === 'id_last4';
    if (isId ? !/^\d{4}$/.test(value) : value.length < 4) {
        input.setAttribute('aria-invalid', 'true');
        setError(errEl, isId ? 'יש להקליד 4 ספרות.' : 'יש להקליד את הקוד המלא.');
        input.focus();
        return;
    }
    input.removeAttribute('aria-invalid');
    setError(errEl, '');
    const btn = $('verifyBtn');
    btn.disabled = true;
    try {
        const res = await api('verify', { value });
        if (res.ok) {
            state.session = res.json.session;
            state.fields = Array.isArray(res.json.fields) ? res.json.fields : [];
            input.value = '';
            await enterDocument();
            return;
        }
        if (res.status === 401 && res.json.error === 'wrong_value') {
            updateAttempts(res.json.attempts_left);
            input.setAttribute('aria-invalid', 'true');
            setError(errEl, 'הפרט שהוקלד אינו תואם. נסו שוב.');
            input.select();
            return;
        }
        if (res.status === 429) return setError(errEl, MSG_BUSY);
        if (!handleTerminal(res)) setError(errEl, MSG_GENERIC);
    } catch {
        setError(errEl, MSG_NET);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------- 3. document
let pdfjsPromise = null;
function loadPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = import('./vendor/pdfjs/pdf.min.js').then(lib => {
            lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
            return lib;
        });
    }
    return pdfjsPromise;
}

async function enterDocument() {
    show('document', $('docTitle2'));
    $('docTitle2').setAttribute('tabindex', '-1');
    pad.resize();
    if (state.pdfLoaded) return;

    const fields = state.fields;
    $('fieldNote').textContent = fields.length === 0
        ? 'החתימה תצורף בעמוד נפרד בסוף המסמך.'
        : (fields.length === 1 ? 'החתימה תשובץ במקום המסומן במסמך.' : 'החתימה תשובץ במקומות המסומנים במסמך.');
    $('docInfo').textContent = 'טוען את המסמך...';
    const pagesEl = $('pages');
    pagesEl.textContent = '';
    setError($('docError'), '');

    let res;
    try { res = await api('document', { session: state.session }, true); }
    catch { $('docInfo').textContent = ''; return setError($('docError'), MSG_NET + ' לאחר מכן רעננו את הדף.'); }
    if (!res.ok) {
        $('docInfo').textContent = '';
        if (res.status === 429) return setError($('docError'), MSG_BUSY);
        if (!handleTerminal(res)) setError($('docError'), MSG_GENERIC);
        return;
    }
    state.pdfLoaded = true;

    // A plain download is always offered: it is the fallback when the viewer cannot run,
    // and the accessible route for screen-reader users (canvas pages carry no text).
    const blobUrl = URL.createObjectURL(new Blob([res.buffer], { type: 'application/pdf' }));
    const dl = $('downloadLink');
    dl.href = blobUrl;
    dl.hidden = false;

    try {
        const lib = await loadPdfJs();
        const pdf = state.pdf = await lib.getDocument({
            data: new Uint8Array(res.buffer.slice(0)),
            isEvalSupported: false,
            enableXfa: false,
            standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
        }).promise;
        $('docInfo').textContent = pdf.numPages === 1 ? 'עמוד אחד. יש לקרוא את המסמך לפני החתימה.' : `${pdf.numPages} עמודים. יש לקרוא את המסמך לפני החתימה.`;
        await buildPages(pdf, pagesEl);
    } catch {
        $('docInfo').textContent = '';
        setError($('docError'), 'לא ניתן להציג את המסמך בדפדפן זה. אפשר להוריד אותו לקריאה בכפתור "הורדת המסמך לקריאה".');
    }
}

const pageSlots = [];   // { el, page, rendered, rendering }
let pageObserver = null;

async function buildPages(pdf, container) {
    pageSlots.length = 0;
    if (pageObserver) pageObserver.disconnect();
    pageObserver = 'IntersectionObserver' in window
        ? new IntersectionObserver(entries => {
            for (const e of entries) if (e.isIntersecting) renderSlot(pageSlots[Number(e.target.dataset.index)]);
        }, { rootMargin: '800px 0px' })
        : null;

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const el = document.createElement('div');
        el.className = 's-page is-loading';
        el.dataset.index = String(i - 1);
        el.style.aspectRatio = `${vp.width} / ${vp.height}`;
        const num = document.createElement('span');
        num.className = 's-page-num';
        num.textContent = `עמוד ${i} מתוך ${pdf.numPages}`;
        el.appendChild(num);
        container.appendChild(el);
        const slot = { el, page, rendered: false, rendering: false };
        pageSlots.push(slot);
        if (pageObserver) pageObserver.observe(el); else renderSlot(slot);
    }

    // Signature placeholders (fractions of the page, origin top-left).
    let first = null;
    for (const f of state.fields) {
        const slot = pageSlots[f.page - 1];
        if (!slot) continue;
        const box = document.createElement('div');
        box.className = 's-field';
        box.style.left = `${f.x * 100}%`;
        box.style.top = `${f.y * 100}%`;
        box.style.width = `${f.w * 100}%`;
        box.style.height = `${f.h * 100}%`;
        box.textContent = 'מקום החתימה';
        slot.el.appendChild(box);
        if (!first) first = box;
    }
    const jump = $('jumpField');
    jump.hidden = !first;
    if (first) jump.onclick = () => first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    state.renderedWidth = container.clientWidth;
    pad.refreshPreview();
}

async function renderSlot(slot) {
    if (!slot || slot.rendered || slot.rendering) return;
    slot.rendering = true;
    try {
        const cssWidth = slot.el.clientWidth || 320;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = slot.page.getViewport({ scale: 1 });
        let scale = (cssWidth * dpr) / base.width;
        const maxPixels = 5e6;                         // keep phone memory in check
        if (base.width * base.height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (base.width * base.height));
        const vp = slot.page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', slot.el.querySelector('.s-page-num').textContent);
        await slot.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const old = slot.el.querySelector('canvas');
        if (old) old.remove();
        slot.el.insertBefore(canvas, slot.el.firstChild);
        slot.rendered = true;
    } catch {
        /* a single page failing to paint must not break the flow; the download link remains */
    } finally {
        slot.el.classList.remove('is-loading');
        slot.rendering = false;
    }
}

// Re-render on rotation / resize so pages stay sharp.
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        pad.resize();
        const w = $('pages').clientWidth;
        if (!pageSlots.length || Math.abs(w - state.renderedWidth) < 40) return;
        state.renderedWidth = w;
        for (const s of pageSlots) {
            s.rendered = false;
            const r = s.el.getBoundingClientRect();
            if (!pageObserver || (r.bottom > -800 && r.top < window.innerHeight + 800)) renderSlot(s);
            else { pageObserver.unobserve(s.el); pageObserver.observe(s.el); }
        }
    }, 250);
});

// ---------------------------------------------------------------- 4. signature pad
const pad = (() => {
    const canvas = $('pad');
    const ctx = canvas.getContext('2d');
    const INK = '#0b1b33';
    const LINE = 2.6;
    let strokes = [];        // arrays of {x, y} in CSS pixels
    let current = null;
    let cssW = 0, cssH = 0;

    function resize() {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (cssW && r.width < cssW) {                 // shrink drawn strokes uniformly; never stretch
            const k = r.width / cssW;
            for (const s of strokes) for (const p of s) { p.x *= k; p.y *= k; }
        }
        cssW = r.width; cssH = r.height;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redraw();
    }

    function paint(c, list, width) {
        c.strokeStyle = INK; c.fillStyle = INK;
        c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const s of list) {
            if (s.length === 1) { c.beginPath(); c.arc(s[0].x, s[0].y, width / 2, 0, Math.PI * 2); c.fill(); continue; }
            c.beginPath();
            c.moveTo(s[0].x, s[0].y);
            for (let i = 1; i < s.length - 1; i++) {
                const mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2;
                c.quadraticCurveTo(s[i].x, s[i].y, mx, my);
            }
            const last = s[s.length - 1];
            c.lineTo(last.x, last.y);
            c.stroke();
        }
    }
    function redraw() {
        ctx.clearRect(0, 0, cssW, cssH);
        paint(ctx, strokes, LINE);
    }

    const pos = ev => {
        const r = canvas.getBoundingClientRect();
        return { x: Math.max(0, Math.min(r.width, ev.clientX - r.left)), y: Math.max(0, Math.min(r.height, ev.clientY - r.top)) };
    };
    canvas.addEventListener('pointerdown', ev => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        ev.preventDefault();
        try { canvas.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
        current = [pos(ev)];
        strokes.push(current);
        redraw();
    });
    canvas.addEventListener('pointermove', ev => {
        if (!current) return;
        ev.preventDefault();
        const evs = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
        for (const e of (evs.length ? evs : [ev])) {
            const p = pos(e), q = current[current.length - 1];
            if (Math.hypot(p.x - q.x, p.y - q.y) >= 0.8) current.push(p);
        }
        redraw();
    });
    const end = () => {
        if (!current) return;
        current = null;
        clearPadError();
        refreshPreview();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);

    function inkLength() {
        let len = 0;
        for (const s of strokes) for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
        return len;
    }
    /** A signature needs real ink: a dot or a tiny tick is refused. */
    const isEmpty = () => strokes.length === 0 || inkLength() < 40;

    /** Trimmed, transparent PNG of the strokes (data URL), longest side <= maxSide px. */
    function exportPng(maxSide = 900) {
        if (isEmpty()) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        const m = 6;
        const w = (x1 - x0) + 2 * m, h = (y1 - y0) + 2 * m;
        const k = Math.min(3, maxSide / Math.max(w, h));
        const out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(w * k));
        out.height = Math.max(1, Math.round(h * k));
        const c = out.getContext('2d');
        c.setTransform(k, 0, 0, k, (m - x0) * k, (m - y0) * k);
        paint(c, strokes, LINE);
        return out.toDataURL('image/png');
    }

    /** Shows the drawn signature inside the highlighted places in the document. */
    function refreshPreview() {
        const url = isEmpty() ? null : exportPng(400);
        document.querySelectorAll('.s-field').forEach(box => {
            box.textContent = '';
            box.classList.toggle('has-sig', Boolean(url));
            if (url) { const img = new Image(); img.alt = ''; img.src = url; box.appendChild(img); }
            else box.textContent = 'מקום החתימה';
        });
    }

    function clear() {
        strokes = [];
        current = null;
        redraw();
        refreshPreview();
    }
    return { resize, clear, isEmpty, exportPng, refreshPreview };
})();

function clearPadError() {
    setError($('padError'), '');
    document.querySelector('.s-pad-box').classList.remove('is-invalid');
}
$('padClear').addEventListener('click', () => { pad.clear(); clearPadError(); });

// Sticky "go to signature" bar: visible only while the form is off screen.
$('toSign').addEventListener('click', () => {
    $('signForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('signHeading').focus({ preventScroll: true });
});
if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { for (const e of es) $('signBar').classList.toggle('is-off', e.isIntersecting); }, { threshold: 0.15 })
        .observe($('signForm'));
}

// ---------------------------------------------------------------- submit
const MAX_SIG_BYTES = 300 * 1024;

$('consent').addEventListener('change', () => setError($('consentError'), ''));
$('signedName').addEventListener('input', () => { setError($('nameError'), ''); $('signedName').removeAttribute('aria-invalid'); });

$('signForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const submitErr = $('submitError');
    setError(submitErr, '');
    let firstBad = null;

    if (!$('consent').checked) { setError($('consentError'), 'כדי לחתום יש לסמן את תיבת האישור.'); firstBad = firstBad || $('consent'); }
    const name = $('signedName').value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) { setError($('nameError'), 'יש להקליד שם מלא.'); $('signedName').setAttribute('aria-invalid', 'true'); firstBad = firstBad || $('signedName'); }
    if (pad.isEmpty()) {
        setError($('padError'), 'יש לחתום בתוך המסגרת לפני השליחה.');
        document.querySelector('.s-pad-box').classList.add('is-invalid');
        firstBad = firstBad || $('pad');
    }
    if (firstBad) {
        firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (firstBad !== $('pad')) firstBad.focus({ preventScroll: true });
        return;
    }

    // PNG, at most 300 KB (in practice a few KB); shrink if a browser produces a large one.
    let b64 = null;
    for (const side of [900, 600, 400]) {
        const url = pad.exportPng(side);
        const part = url && url.startsWith('data:image/png;base64,') ? url.slice(22) : null;
        if (part && part.length * 0.75 <= MAX_SIG_BYTES) { b64 = part; break; }
    }
    if (!b64) return setError(submitErr, 'לא ניתן היה לעבד את החתימה. נקו את המסגרת וחתמו שוב.');

    const btn = $('submitBtn');
    btn.disabled = true;
    try {
        const res = await api('submit', { session: state.session, signature_png_b64: b64, signed_name: name, consent: true });
        if (res.ok) {
            const w = fmtWhen(res.json.signed_at);
            $('doneWhen').textContent = `המסמך "${state.meta.title}" נחתם ביום ${w.date} בשעה ${w.time} (שעון ישראל).`;
            state.session = null;
            show('done', $('doneTitle'));
            return;
        }
        if (res.status === 429) return setError(submitErr, MSG_BUSY);
        if (res.status === 409 && res.json.error === 'already_signed') return showStatus('signed');
        if (!handleTerminal(res)) setError(submitErr, MSG_GENERIC);
    } catch {
        setError(submitErr, MSG_NET);
    } finally {
        btn.disabled = false;
    }
});

// ---------------------------------------------------------------- decline
function toggleDecline(open) {
    $('declinePanel').hidden = !open;
    $('declineToggle').setAttribute('aria-expanded', String(open));
    if (open) $('declineReason').focus();
}
$('declineToggle').addEventListener('click', () => toggleDecline($('declinePanel').hidden));
$('declineCancel').addEventListener('click', () => { toggleDecline(false); $('declineToggle').focus(); });
$('declineBtn').addEventListener('click', async () => {
    const errEl = $('declineError');
    setError(errEl, '');
    const btn = $('declineBtn');
    btn.disabled = true;
    try {
        const res = await api('decline', { session: state.session, reason: $('declineReason').value.trim() });
        if (res.ok) return showState('declined');
        if (res.status === 429) return setError(errEl, MSG_BUSY);
        if (!handleTerminal(res)) setError(errEl, MSG_GENERIC);
    } catch {
        setError(errEl, MSG_NET);
    } finally {
        btn.disabled = false;
    }
});

$('stateRetry').addEventListener('click', start);
window.addEventListener('hashchange', () => location.reload());

start();
