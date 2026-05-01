/**
 * Product: residential rental agreement (הסכם שכירות דירת מגורים).
 *
 * Customer deliverable: PDF rendered from an HTML template (rental-agreement-html.js)
 * via Cloudflare Browser Rendering.
 */

import puppeteer from "@cloudflare/puppeteer";
import { renderRentalAgreementHtml } from "./rental-agreement-html.js";

export const id = "rental-agreement";
export const name = "הסכם שכירות דירת מגורים";
export const priceIls = 500;

const PAYMENT_METHODS = {
    checks: "המחאות דחויות",
    bank_transfer: "הוראת קבע / העברה בנקאית",
    cash: "מזומן / אחר",
};

function fmtNum(n) {
    if (n === undefined || n === null || n === "") return "—";
    return Number(n).toLocaleString("he-IL");
}

function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return [
        String(d.getDate()).padStart(2, "0"),
        String(d.getMonth() + 1).padStart(2, "0"),
        d.getFullYear(),
    ].join("/");
}

function endDate(startIso, months) {
    if (!startIso || !months) return "—";
    const d = new Date(startIso);
    if (isNaN(d.getTime())) return "—";
    d.setMonth(d.getMonth() + Number(months));
    d.setDate(d.getDate() - 1);
    return fmtDate(d.toISOString());
}

function row(label, value) {
    const v = (value === undefined || value === null || value === "") ? "—" : value;
    return `<tr><th align="right" style="padding:6px 12px;background:#faf6f1;border:1px solid #e8dfd2;">${label}</th><td style="padding:6px 12px;border:1px solid #e8dfd2;">${v}</td></tr>`;
}

function section(title, rows) {
    return `
        <h3 style="margin:24px 0 8px;color:#7a5c3e;font-family:'Heebo',Arial,sans-serif;">${title}</h3>
        <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-family:'Heebo',Arial,sans-serif;font-size:14px;direction:rtl;">
            ${rows.join("")}
        </table>
    `;
}

/**
 * Build the office notification email for a paid rental-agreement order.
 *
 * @param {Object} order
 * @param {string} order.orderId
 * @param {Object} order.payload   — full form data
 * @param {string} order.createdAt
 * @returns {{subject: string, html: string, text: string}}
 */
export function formatOfficeEmail(order) {
    const d = order.payload || {};
    const subject = `הזמנה חדשה - הסכם שכירות - ${d.tenant_name || "—"} (${order.orderId.slice(0, 8)})`;

    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:'Heebo',Arial,sans-serif;background:#fdfbf7;padding:24px;color:#3a2e22;direction:rtl;">
    <div style="max-width:680px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 4px;color:#7a5c3e;">הזמנה חדשה התקבלה</h2>
        <p style="margin:0 0 24px;color:#7c6a55;">${name} · ${priceIls} ₪ כולל מע״מ</p>

        <table cellspacing="0" cellpadding="0" style="width:100%;font-size:13px;color:#7c6a55;">
            <tr>
                <td><strong>מס׳ הזמנה:</strong> ${order.orderId}</td>
                <td align="left"><strong>נוצרה:</strong> ${fmtDate(order.createdAt)}</td>
            </tr>
        </table>

        ${section("המשכיר", [
            row("שם מלא", d.landlord_name),
            row("ת.ז.", d.landlord_id),
            row("כתובת", `${d.landlord_street || ""}${d.landlord_city ? ", " + d.landlord_city : ""}`),
            row("טלפון", d.landlord_phone),
            row("דוא״ל", d.landlord_email),
        ])}

        ${section("השוכר", [
            row("שם מלא", d.tenant_name),
            row("ת.ז.", d.tenant_id),
            row("כתובת קודמת", `${d.tenant_street || ""}${d.tenant_city ? ", " + d.tenant_city : ""}`),
            row("טלפון", d.tenant_phone),
            row("דוא״ל", d.tenant_email),
            d.additional_tenants ? row("שוכרים נוספים", d.additional_tenants.replace(/\n/g, "<br>")) : "",
        ].filter(Boolean))}

        ${section("הנכס", [
            row("כתובת", `${d.property_street || ""}${d.property_city ? ", " + d.property_city : ""}${d.property_neighborhood ? ", " + d.property_neighborhood : ""}`),
            row("חדרים", `${d.property_bedrooms || "—"} שינה · ${d.property_bathrooms || "—"} שירותים · ${d.property_showers || "—"} מקלחות`),
            row("גוש/חלקה", `גוש ${d.property_block || "—"}, חלקה ${d.property_parcel || "—"}${d.property_subparcel ? ", ת״ח " + d.property_subparcel : ""}`),
            row("ריהוט", d.has_furniture ? (d.furniture_list || "כלול") : "ללא ריהוט"),
        ])}

        ${section("תנאי שכירות", [
            row("תקופה", `${fmtDate(d.lease_start)} עד ${endDate(d.lease_start, d.lease_months)} (${d.lease_months || "—"} חודשים)`),
            row("דמי שכירות", `${fmtNum(d.monthly_rent)} ₪ לחודש`),
            row("יום תשלום", d.payment_day ? `ה-${d.payment_day} לכל חודש` : "—"),
            row("אופן תשלום", PAYMENT_METHODS[d.payment_method] || "—"),
        ])}

        ${section("ערבויות", [
            row("ערבון בנקאי", `${fmtNum(Number(d.monthly_rent || 0) * 3)} ₪ (3 חודשי שכירות)`),
            row("שטר חוב", `${fmtNum(d.promissory_note)} ₪`),
            row("פיצוי איחור פינוי יומי", `${fmtNum(d.late_penalty)} ₪`),
            row("ערבים אישיים", d.has_guarantors === "yes" ? (d.guarantors_details || "נדרשים").replace(/\n/g, "<br>") : "ללא ערבים"),
        ])}

        <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e8dfd2;color:#7c6a55;font-size:13px;">
            הודעה זו נשלחה אוטומטית מהפלטפורמה הדיגיטלית של עשור ושות׳.
        </p>
    </div>
</body></html>`;

    const text = [
        `הזמנה חדשה - ${name}`,
        `מס׳ הזמנה: ${order.orderId}`,
        ``,
        `שוכר: ${d.tenant_name || "—"} (${d.tenant_email || "—"})`,
        `משכיר: ${d.landlord_name || "—"} (${d.landlord_email || "—"})`,
        `נכס: ${d.property_street || "—"}, ${d.property_city || "—"}`,
        `שכ״ד: ${fmtNum(d.monthly_rent)} ₪/חודש · ${d.lease_months || "—"} חודשים מ-${fmtDate(d.lease_start)}`,
        ``,
        `(פרטים מלאים בגרסת ה-HTML)`,
    ].join("\n");

    return { subject, html, text };
}

/**
 * Build the customer notification email body. The PDF is attached separately
 * by the caller (index.js).
 */
export function formatCustomerEmail(order) {
    const d = order.payload || {};
    const subject = `ההסכם שלך מוכן · ${name} · עשור ושות׳`;
    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:'Heebo',Arial,sans-serif;background:#fdfbf7;padding:24px;color:#3a2e22;direction:rtl;">
    <div style="max-width:580px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 12px;color:#7a5c3e;">תודה על הרכישה, ${d.tenant_name || ""}</h2>
        <p style="margin:0 0 16px;line-height:1.7;">
            ${name} שביקשת מצורף להודעה זו כקובץ PDF.
        </p>
        <p style="margin:0 0 16px;line-height:1.7;">
            ההסכם נוצר לפי הנתונים שמילאת בטופס. מומלץ לעבור עליו בעיון לפני החתימה,
            ולוודא שכל הפרטים תואמים את ההבנות בין הצדדים. ההסכם מוכן להדפסה ולחתימה.
        </p>
        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e8dfd2;color:#7c6a55;font-size:13px;line-height:1.6;">
            לכל שאלה — ניתן להשיב להודעה זו או לכתוב ל-${"office@asor-law.com"}.<br>
            מס׳ הזמנה: ${order.orderId}
        </p>
    </div>
</body></html>`;
    const text = [
        `תודה על הרכישה, ${d.tenant_name || ""}.`,
        ``,
        `${name} מצורף להודעה זו כקובץ PDF.`,
        `מומלץ לעבור עליו בעיון לפני החתימה.`,
        ``,
        `מס׳ הזמנה: ${order.orderId}`,
        `לפניות: office@asor-law.com`,
    ].join("\n");
    return { subject, html, text };
}

/**
 * Build the customer-facing PDF.
 *
 * Pipeline:
 *   1. Render the order data into a full HTML document (RTL Hebrew, A4, print
 *      styles) via renderRentalAgreementHtml.
 *   2. Hand that HTML to Cloudflare Browser Rendering and ask for an A4 PDF.
 *   3. Return the PDF bytes + a localized filename.
 *
 * @param {Object} order
 * @param {Object} env  - Worker bindings (must include BROWSER).
 * @returns {Promise<{filename: string, content: Uint8Array, contentType: string}>}
 */
export async function generateCustomerDeliverable(order, env) {
    if (!env.BROWSER) {
        const e = new Error("BROWSER binding missing — Browser Rendering not configured");
        e.code = "BROWSER_BINDING_MISSING";
        throw e;
    }

    const html = renderRentalAgreementHtml(order);

    // Per-page footer: initial-lines for both parties + page number.
    // This is for ראשי תיבות on every page (Israeli legal practice — confirms
    // the party read each page). The full, prominent signatures live in the
    // body of the document on the last page.
    // Note: footerTemplate is sandboxed — inline styles required, no scripts.
    const footerTemplate = `
        <div style="width:100%;font-family:'David Libre','David',serif;direction:rtl;padding:0 2cm;box-sizing:border-box;color:#1a1a1a;">
            <div style="display:flex;justify-content:space-between;gap:2cm;">
                <div style="flex:1;text-align:center;">
                    <div style="border-top:1px solid #1a1a1a;padding-top:1mm;font-size:9pt;">ראשי תיבות <strong>המשכיר</strong></div>
                </div>
                <div style="flex:1;text-align:center;">
                    <div style="border-top:1px solid #1a1a1a;padding-top:1mm;font-size:9pt;">ראשי תיבות <strong>השוכר</strong></div>
                </div>
            </div>
            <div style="text-align:center;margin-top:2mm;font-size:8.5pt;color:#777;">
                עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span>
            </div>
        </div>`;

    const browser = await puppeteer.launch(env.BROWSER);
    try {
        const page = await browser.newPage();
        // Load the HTML directly. networkidle0 waits for Google Fonts to settle.
        await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            preferCSSPageSize: false,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate,
            margin: { top: "2cm", right: "2cm", bottom: "3cm", left: "2cm" },
        });
        const tenant = (order?.payload?.tenant_name || "customer").replace(/[^\p{L}\p{N} _-]/gu, "");
        const shortId = (order?.orderId || "").slice(0, 8);
        return {
            filename: `הסכם-שכירות-${tenant}-${shortId}.pdf`,
            content: pdf,
            contentType: "application/pdf",
        };
    } finally {
        await browser.close();
    }
}
