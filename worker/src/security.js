/**
 * security.js — defensive middleware for the asor-digital-api Worker.
 *
 * Two layers:
 *   1. securityHeaders() — hardening headers on every response.
 *   2. rateLimit()       — coarse per-IP throttling for abuse-prone endpoints
 *                          (payment creation, consultation leads, AI intake,
 *                          document sharing). Backed by ORDERS_KV.
 */

/**
 * Adds standard security response headers to every reply. Safe for a JSON API
 * and for the PDF download endpoint (nosniff is especially valuable there).
 */
export function securityHeaders() {
    return async (c, next) => {
        await next();
        c.header("X-Content-Type-Options", "nosniff");
        c.header("Referrer-Policy", "strict-origin-when-cross-origin");
        c.header("X-Frame-Options", "DENY");
        c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
        c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
        c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        c.header("Cross-Origin-Resource-Policy", "same-site");
    };
}

/**
 * Per-IP fixed-window rate limiter using KV. Eventual consistency is acceptable
 * for coarse abuse protection. Keyed by Cloudflare's CF-Connecting-IP.
 *
 * @param {object}  opts
 * @param {number}  opts.limit      max requests per window (default 20)
 * @param {number}  opts.windowSec  window length in seconds (default 60, KV TTL min)
 * @param {string}  opts.prefix     KV key namespace (default "rl")
 */
export function rateLimit({ limit = 20, windowSec = 60, prefix = "rl" } = {}) {
    return async (c, next) => {
        const ip =
            c.req.header("CF-Connecting-IP") ||
            c.req.header("X-Forwarded-For") ||
            "unknown";
        const bucket = Math.floor(Date.now() / 1000 / windowSec);
        const key = `${prefix}:${ip}:${bucket}`;

        let count = 0;
        try {
            const cur = await c.env.ORDERS_KV.get(key);
            count = cur ? parseInt(cur, 10) || 0 : 0;
        } catch {
            // KV read failure: fail open (don't block legitimate traffic).
        }

        if (count >= limit) {
            const retry = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
            c.header("Retry-After", String(Math.max(1, retry)));
            return c.json({ error: "יותר מדי בקשות. נסו שוב בעוד רגע." }, 429);
        }

        try {
            // TTL of 2× the window keeps the previous bucket around briefly; KV
            // minimum TTL is 60s, so windowSec should be >= 60.
            await c.env.ORDERS_KV.put(key, String(count + 1), {
                expirationTtl: Math.max(60, windowSec * 2),
            });
        } catch {
            // Swallow write failures — never block on the limiter's bookkeeping.
        }

        await next();
    };
}
