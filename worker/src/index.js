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
import { getProduct } from "./products/index.js";

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
app.post("/api/rental/payment-callback", async c => {
    const orderId = c.req.query("orderId");
    if (!orderId) return c.json({ error: "Missing orderId" }, 400);

    const raw = await c.env.ORDERS_KV.get(orderId);
    if (!raw) return c.json({ error: "Order not found" }, 404);

    const order = JSON.parse(raw);

    // Idempotency — if we already processed, return success without re-sending email
    if (order.status === "paid") {
        return c.json({ ok: true, alreadyProcessed: true, orderId });
    }

    order.status = "paid";
    order.paidAt = new Date().toISOString();
    await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));

    const product = getProduct(order.productId);

    // 1) Generate PDF and store in KV (used for both email attachments and the
    //    success-page download).
    let pdfFilename = null;
    let pdfContent = null;
    let pdfContentType = "application/pdf";
    try {
        const result = await product.generateCustomerDeliverable(order, c.env);
        pdfFilename = result.filename;
        pdfContent = result.content;
        pdfContentType = result.contentType;
        await c.env.ORDERS_KV.put(`pdf:${orderId}`, pdfContent, {
            metadata: { filename: pdfFilename, contentType: pdfContentType, generatedAt: new Date().toISOString() },
        });
        order.pdfGeneratedAt = new Date().toISOString();
        order.pdfFilename = pdfFilename;
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
    } catch (err) {
        console.error("PDF generation failed", err);
        order.deliverableError = err.message;
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
        // Don't fail — payment is complete; israel can re-trigger from KV.
    }

    const attachments = (pdfContent && pdfFilename)
        ? [{ filename: pdfFilename, content: pdfContent, contentType: pdfContentType }]
        : undefined;

    // 2) Office notification — full questionnaire details + the PDF that was
    //    issued to the customer.
    try {
        const { subject, html, text } = product.formatOfficeEmail(order);
        const replyTo = order.payload?.tenant_email;
        await sendEmail(c.env, {
            to: c.env.OFFICE_EMAIL,
            subject,
            html,
            text,
            replyTo,
            attachments,
        });
        order.officeNotifiedAt = new Date().toISOString();
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
    } catch (err) {
        console.error("office email failed", err);
        order.officeEmailError = err.message;
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
    }

    // 3) Customer auto-notification — the PDF + appendices.
    try {
        if (typeof product.formatCustomerEmail === "function" && order.payload?.tenant_email && attachments) {
            const { subject, html, text } = product.formatCustomerEmail(order);
            await sendEmail(c.env, {
                to: order.payload.tenant_email,
                subject,
                html,
                text,
                replyTo: c.env.OFFICE_EMAIL,
                attachments,
            });
            order.customerNotifiedAt = new Date().toISOString();
            await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
        }
    } catch (err) {
        console.error("customer email failed", err);
        order.customerEmailError = err.message;
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
    }

    return c.json({
        ok: true,
        orderId,
        pdfReady: Boolean(order.pdfGeneratedAt),
        pdfFilename: order.pdfFilename || null,
        customerEmailSent: Boolean(order.customerNotifiedAt),
        customerEmail: order.payload?.tenant_email || null,
    });
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
