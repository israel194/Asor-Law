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

    // Send the office notification — using the per-product formatter
    try {
        const product = getProduct(order.productId);
        const { subject, html, text } = product.formatOfficeEmail(order);
        const replyTo = order.payload?.tenant_email;
        await sendEmail(c.env, {
            to: c.env.OFFICE_EMAIL,
            subject,
            html,
            text,
            replyTo,
        });
        order.officeNotifiedAt = new Date().toISOString();
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
    } catch (err) {
        console.error("office email failed", err);
        order.officeEmailError = err.message;
        await c.env.ORDERS_KV.put(orderId, JSON.stringify(order));
        // We don't fail the request — payment IS complete. Surface the issue
        // server-side so israel can be notified out-of-band if needed.
    }

    return c.json({ ok: true, orderId });
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
