/**
 * Email delivery via Resend (https://resend.com).
 *
 * RESEND_API_KEY is a Worker secret. EMAIL_FROM is in [vars].
 *
 * The sending domain (asor-law.com) must be verified in the Resend dashboard
 * — until then, sending will only work to the address that owns the Resend account.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send an email.
 *
 * @param {Object} env
 * @param {Object} msg
 * @param {string|string[]} msg.to        - Recipient(s)
 * @param {string} msg.subject
 * @param {string} [msg.html]             - HTML body (preferred for office notifications)
 * @param {string} [msg.text]             - Plain-text fallback
 * @param {string} [msg.replyTo]          - Optional reply-to address
 * @returns {Promise<{id: string}>}
 */
export async function sendEmail(env, { to, subject, html, text, replyTo }) {
    if (!env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
    }

    const payload = {
        from: env.EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
    };
    if (html) payload.html = html;
    if (text) payload.text = text;
    if (replyTo) payload.reply_to = replyTo;

    const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const body = await res.text();
        const err = new Error(`Resend API error (${res.status}): ${body}`);
        err.status = res.status;
        throw err;
    }

    return await res.json();
}
