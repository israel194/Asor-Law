/**
 * asor-digital-api — Cloudflare Worker
 *
 * Routes:
 *   POST /api/rental/create-payment
 *     Persists the order to KV (status="pending_payment"), then creates a SUMIT
 *     hosted-redirect payment page and returns the URL.
 *
 *   POST /api/rental/payment-callback
 *     Called by the customer-facing success page after SUMIT redirects back.
 *     Marks the order as paid and emails office@asor-law.com a copy.
 *
 *   GET  /api/orders/:id
 *     Returns minimal info (status, productName) — used by success page.
 *
 *   GET  /api/orders/:id/document
 *     Streams the generated PDF for a paid order.
 *
 *   POST /api/orders/:id/share/email
 *     Emails the PDF to a customer-supplied address. Body: { email }.
 *
 *   GET  /healthz
 *     Liveness check.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPaymentRedirect } from "./sumit.js";
import { sendEmail } from "./email.js";
import { getProduct, listProducts } from "./products/index.js";
import { intakeChat } from "./intake.js";

/**
 * Generic order processing — used for both Type A products (with PDF
 * deliverable) and Type B products (digital intake, attorney-handled).
 */
async function processPaidOrder(env, order) {
    const product = getProduct(order.productId);
    const orderId = order.orderId;

    // 1) For Type A products, generate PDF and store in KV.
    let attachments;
    if (typeof product.generateCustomerDeliverable === "function") {
        try {
            const { filename, content, contentType } = await product.generateCustomerDeliverable(order, env);
            await env.ORDERS_KV.put(`pdf:${orderId}`, content, {
                metadata: { filename, contentType, generatedAt: new Date().toISOString() },
            });
            order.pdfGeneratedAt = new Date().toISOString();
            order.pdfFilename = filename;
            await env.ORDERS_KV.put(orderId, JSON.stringify(order));
            attachments = [{ filename, content, contentType }];
        } catch (err) {
            console.error("PDF generation failed", err);
            order.deliverableError = err.message;
            await env.ORDERS_KV.put(orderId, JSON.stringify(order));
        }
    }

    // 2) Office notification — full questionnaire + the PDF (for Type A).
    try {
        const { subject, html, text } = product.formatOfficeEmail(order);
        await sendEmail(env, {
            to: env.OFFICE_EMAIL,
            subject,
            html,
            text,
            replyTo: order.payload?.client_email || order.payload?.tenant_email,
            attachments,
        });
        order.officeNotifiedAt = new Date().toISOString();
        await env.ORDERS_KV.put(orderId, JSON.stringify(order));
    } catch (err) {
        console.error("office email failed", err);
        order.officeEmailError = err.message;
        await env.ORDERS_KV.put(orderId, JSON.stringify(order));
    }

    // 3) Customer email.
    const customerEmail = order.payload?.client_email || order.payload?.tenant_email;
    if (typeof product.formatCustomerEmail === "function" && customerEmail) {
        try {
            const { subject, html, text } = product.formatCustomerEmail(order);
            await sendEmail(env, {
                to: customerEmail,
                subject,
                html,
                text,
                replyTo: env.OFFICE_EMAIL,
                attachments,
            });
            order.customerNotifiedAt = new Date().toISOString();
            await env.ORDERS_KV.put(orderId, JSON.stringify(order));
        } catch (err) {
            console.error("customer email failed", err);
            order.customerEmailError = err.message;
            await env.ORDERS_KV.put(orderId, JSON.stringify(order));
        }
    }

    return order;
}

const app = new Hono();

// CORS — only allow from our own domains (configured in wrangler.toml [vars])
app.use("/api/*", async (c, next) => {
    const origins = c.env.CORS_ORIGINS.split(",").map(s => s.trim());
    return cors({
        origin: origins,
        allowMethods: ["POST", "GET", "OPTIONS"],
        allowHeaders: ["Content-Type"],
        maxAge: 600,
    })(c, next);
});

app.get("/healthz", c => c.json({ ok: true, service: "asor-digital-api" }));

// ===== Create payment for rental agreement =====
app.post("/api/rental/create-payment", async c => {
    let payload;
    try {
        payload = await c.req.json();
    } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
    }

    // Minimum identity fields needed to charge & email back
    const required = ["tenant_name", "tenant_email", "tenant_phone"];
    for (const k of required) {
        if (!payload[k]) return c.json({ error: `Missing field: ${k}` }, 400);
    }

    const product = getProduct("rental-agreement");
    const orderId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const order = {
        orderId,
        productId: product.id,
        status: "pending_payment",
        priceIls: product.priceIls,
        createdAt,
        payload,
    };

    // Persist before redirecting to payment provider — if KV write fails we
    // don't want a paying customer with no record on our side.
    await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));

    const returnUrl = `${c.env.RETURN_URL_BASE}/digital/rental-agreement/success.html?orderId=${encodeURIComponent(orderId)}`;

    try {
        const { redirectUrl } = await createPaymentRedirect(c.env, {
            orderId,
            productName: product.name,
            priceIls: product.priceIls,
            customerName: payload.tenant_name,
            customerEmail: payload.tenant_email,
            customerPhone: payload.tenant_phone,
            returnUrl,
        });
        return c.json({ orderId, redirectUrl });
    } catch (err) {
        console.error("create-payment failed", err);
        // Best-effort: mark order as payment_failed so we can see it in KV
        try {
            await c.env.ORDERS_KV.put(orderId, JSON.stringify({ ...order, status: "payment_init_failed", error: err.message }));
        } catch { /* swallow */ }
        return c.json({ error: "Payment provider error", detail: err.message }, 502);
    }
});

// ===== Payment callback (called by frontend success page) =====
//   /api/rental/payment-callback   — legacy alias (still in use by the rental form)
//   /api/orders/:id/payment-callback — generic, used by all newer products
async function paymentCallbackHandler(c, orderIdOverride) {
    const orderId = orderIdOverride || c.req.query("orderId");
    if (!orderId) return c.json({ error: "Missing orderId" }, 400);

    const raw = await c.env.ORDERS_KV.get(orderId);
    if (!raw) return c.json({ error: "Order not found" }, 404);

    const orderInitial = JSON.parse(raw);
    if (orderInitial.status === "paid") {
        return c.json({ ok: true, alreadyProcessed: true, orderId });
    }

    orderInitial.status = "paid";
    orderInitial.paidAt = new Date().toISOString();
    await c.env.ORDERS_KV.put(orderId, JSON.stringify(orderInitial));

    const order = await processPaidOrder(c.env, orderInitial);

    const customerEmail = order.payload?.client_email || order.payload?.tenant_email || null;
    return c.json({
        ok: true,
        orderId,
        pdfReady: Boolean(order.pdfGeneratedAt),
        pdfFilename: order.pdfFilename || null,
        customerEmailSent: Boolean(order.customerNotifiedAt),
        customerEmail,
    });
}

app.post("/api/rental/payment-callback", c => paymentCallbackHandler(c));
app.post("/api/orders/:id/payment-callback", c => paymentCallbackHandler(c, c.req.param("id")));

// ===== Generic create-payment for any registered product =====
app.post("/api/products/:productId/create-payment", async c => {
    const productId = c.req.param("productId");
    let product;
    try { product = getProduct(productId); }
    catch { return c.json({ error: `Unknown product: ${productId}` }, 404); }

    let payload;
    try { payload = await c.req.json(); }
    catch { return c.json({ error: "Invalid JSON body" }, 400); }

    const required = product.requiredFields || ["client_name", "client_email", "client_phone"];
    for (const k of required) {
        if (!payload[k]) return c.json({ error: `Missing field: ${k}` }, 400);
    }

    const orderId = crypto.randomUUID();
    const order = {
        orderId,
        productId: product.id,
        status: "pending_payment",
        priceIls: product.priceIls,
        createdAt: new Date().toISOString(),
        payload,
    };
    await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));

    const returnUrl = `${c.env.RETURN_URL_BASE}/digital/${product.id}/success.html?orderId=${encodeURIComponent(orderId)}`;

    try {
        const { redirectUrl } = await createPaymentRedirect(c.env, {
            orderId,
            productName: product.name,
            priceIls: product.priceIls,
            customerName: payload.client_name || payload.tenant_name,
            customerEmail: payload.client_email || payload.tenant_email,
            customerPhone: payload.client_phone || payload.tenant_phone,
            returnUrl,
        });
        return c.json({ orderId, redirectUrl });
    } catch (err) {
        console.error("create-payment failed", err);
        try {
            await c.env.ORDERS_KV.put(orderId, JSON.stringify({ ...order, status: "payment_init_failed", error: err.message }));
        } catch { /* swallow */ }
        return c.json({ error: "Payment provider error", detail: err.message }, 502);
    }
});

// ===== List all available products (used by /digital/ index page) =====
app.get("/api/products", c => c.json({ products: listProducts() }));

// ===== AI Intake assistant (Claude Sonnet 4.6) =====
app.post("/api/intake/chat", async c => {
    let body;
    try { body = await c.req.json(); }
    catch { return c.json({ error: "Invalid JSON" }, 400); }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length > 30) {
        return c.json({ error: "Conversation too long" }, 413);
    }

    try {
        const result = await intakeChat(c.env, messages);
        return c.json({ ok: true, reply: result.reply, usage: result.usage });
    } catch (err) {
        console.error("intake chat failed", err);
        return c.json({ error: err.message || "Internal error" }, err.status || 500);
    }
});

// ===== Consultation request (creates a lead, emails office) =====
app.post("/api/consultation/request", async c => {
    let body;
    try { body = await c.req.json(); }
    catch { return c.json({ error: "Invalid JSON" }, 400); }

    const { name, phone, email, preferredDate, summary, conversationSummary } = body;
    if (!name || !email || !phone) {
        return c.json({ error: "חסר שם / טלפון / מייל" }, 400);
    }

    const requestId = crypto.randomUUID();
    const lead = {
        id: requestId,
        type: "consultation",
        createdAt: new Date().toISOString(),
        name, phone, email,
        preferredDate: preferredDate || null,
        summary: summary || null,
        conversationSummary: conversationSummary || null,
    };
    await c.env.ORDERS_KV.put(`consultation:${requestId}`, JSON.stringify(lead));

    // Notify the office.
    try {
        const subject = `בקשת ייעוץ — ${name} (${requestId.slice(0, 8)})`;
        const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#fdfbf7;padding:24px;direction:rtl;">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 12px;color:#0d2c4f;">בקשת ייעוץ חדשה</h2>
        <p style="color:#5a6478;margin:0 0 18px;">בקשה התקבלה דרך הצ׳אט הדיגיטלי באתר. צור קשר תוך 24 שעות עסקים.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><th align="right" style="padding:8px;background:#faf6f0;border:1px solid #e8dfd2;">שם</th><td style="padding:8px;border:1px solid #e8dfd2;">${name}</td></tr>
            <tr><th align="right" style="padding:8px;background:#faf6f0;border:1px solid #e8dfd2;">טלפון</th><td style="padding:8px;border:1px solid #e8dfd2;">${phone}</td></tr>
            <tr><th align="right" style="padding:8px;background:#faf6f0;border:1px solid #e8dfd2;">דוא"ל</th><td style="padding:8px;border:1px solid #e8dfd2;">${email}</td></tr>
            ${preferredDate ? `<tr><th align="right" style="padding:8px;background:#faf6f0;border:1px solid #e8dfd2;">מועד מבוקש</th><td style="padding:8px;border:1px solid #e8dfd2;">${preferredDate}</td></tr>` : ""}
            ${summary ? `<tr><th align="right" style="padding:8px;background:#faf6f0;border:1px solid #e8dfd2;vertical-align:top;">תיאור הלקוח</th><td style="padding:8px;border:1px solid #e8dfd2;white-space:pre-wrap;">${summary}</td></tr>` : ""}
            ${conversationSummary ? `<tr><th align="right" style="padding:8px;background:#faf6f0;border:1px solid #e8dfd2;vertical-align:top;">תקציר שיחה עם הצ׳אט</th><td style="padding:8px;border:1px solid #e8dfd2;white-space:pre-wrap;font-size:13px;color:#5a6478;">${conversationSummary}</td></tr>` : ""}
        </table>
        <p style="color:#5a6478;font-size:12px;margin:20px 0 0;">מס׳ בקשה: ${requestId}</p>
    </div>
</body></html>`;
        const text = `בקשת ייעוץ\n\nשם: ${name}\nטלפון: ${phone}\nדוא"ל: ${email}\nמועד: ${preferredDate || "—"}\n\n${summary || ""}\n\nמס׳ בקשה: ${requestId}`;
        await sendEmail(c.env, {
            to: c.env.OFFICE_EMAIL,
            subject, html, text,
            replyTo: email,
        });
    } catch (err) {
        console.error("consultation email failed", err);
    }

    return c.json({ ok: true, requestId });
});

// ===== Email the document on customer request =====
app.post("/api/orders/:id/share/email", async c => {
    const id = c.req.param("id");
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

    const email = (body.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return c.json({ error: "Invalid email address" }, 400);
    }

    const orderRaw = await c.env.ORDERS_KV.get(id);
    if (!orderRaw) return c.json({ error: "Order not found" }, 404);
    const order = JSON.parse(orderRaw);
    if (order.status !== "paid") return c.json({ error: "Order not paid" }, 402);

    const { value, metadata } = await c.env.ORDERS_KV.getWithMetadata(`pdf:${id}`, { type: "arrayBuffer" });
    if (!value) return c.json({ error: "Document not yet generated" }, 404);

    const product = getProduct(order.productId);
    const { subject, html, text } = product.formatCustomerEmail(order);
    const filename = (metadata && metadata.filename) || `${id}.pdf`;
    const contentType = (metadata && metadata.contentType) || "application/pdf";

    try {
        await sendEmail(c.env, {
            to: email,
            subject,
            html,
            text,
            replyTo: c.env.OFFICE_EMAIL,
            attachments: [{ filename, content: new Uint8Array(value), contentType }],
        });
    } catch (err) {
        console.error("share/email failed", err);
        return c.json({ error: "Email send failed", detail: err.message }, 502);
    }

    // Track shares for visibility in KV
    order.sharedVia = order.sharedVia || [];
    order.sharedVia.push({ channel: "email", to: email, at: new Date().toISOString() });
    await c.env.ORDERS_KV.put(id, JSON.stringify(order));

    return c.json({ ok: true });
});

// ===== Document download (one-time-ish: by orderId) =====
app.get("/api/orders/:id/document", async c => {
    const id = c.req.param("id");
    const orderRaw = await c.env.ORDERS_KV.get(id);
    if (!orderRaw) return c.json({ error: "Order not found" }, 404);

    const order = JSON.parse(orderRaw);
    if (order.status !== "paid") return c.json({ error: "Order not paid" }, 402);

    const { value, metadata } = await c.env.ORDERS_KV.getWithMetadata(`pdf:${id}`, { type: "arrayBuffer" });
    if (!value) return c.json({ error: "Document not yet generated" }, 404);

    const filename = (metadata && metadata.filename) || `${id}.pdf`;
    const contentType = (metadata && metadata.contentType) || "application/pdf";
    return new Response(value, {
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
            "Cache-Control": "private, no-store",
        },
    });
});

// ===== Public order lookup (limited fields) — used by success page =====
app.get("/api/orders/:id", async c => {
    const id = c.req.param("id");
    const raw = await c.env.ORDERS_KV.get(id);
    if (!raw) return c.json({ error: "Order not found" }, 404);
    const order = JSON.parse(raw);
    return c.json({
        orderId: order.orderId,
        productId: order.productId,
        status: order.status,
        createdAt: order.createdAt,
        // Customer-facing fields only — DO NOT leak full payload
        customerName: order.payload?.tenant_name || null,
        customerEmail: order.payload?.tenant_email || null,
    });
});

app.notFound(c => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal error", detail: err.message }, 500);
});

export default app;
