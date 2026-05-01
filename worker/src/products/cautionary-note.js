/**
 * Product: רישום הערת אזהרה (Cautionary Note Registration).
 *
 * Type B — digital intake → attorney handles the actual registration with
 * the Israel Land Registry (Tabu). No PDF deliverable is generated.
 */

import { withVat } from "./vat.js";

export const id = "cautionary-note";
export const name = "רישום הערת אזהרה";
export const priceBeforeVat = 299;
export const priceIls = withVat(priceBeforeVat);
export const requiredFields = ["client_name", "client_id", "client_email", "client_phone"];

const NOTE_TYPES = {
    sale: "הסכם מכר",
    loan: "הסכם הלוואה / משכנתא בלתי מסויגת",
    inheritance: "צו ירושה / קיום צוואה",
    gift: "מתנה",
    other: "אחר",
};

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

export function formatOfficeEmail(order) {
    const d = order.payload || {};
    const subject = `הזמנה חדשה - ${name} - ${d.client_name || "—"} (${order.orderId.slice(0, 8)})`;

    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:'Heebo',Arial,sans-serif;background:#fdfbf7;padding:24px;color:#3a2e22;direction:rtl;">
    <div style="max-width:680px;margin:0 auto 16px;text-align:center;">
        <img src="https://asor-law.com/images/logo-he.png" alt="עשור ושות׳ - עורכי דין" style="width:200px;height:auto;display:inline-block;">
    </div>
    <div style="max-width:680px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 4px;color:#7a5c3e;">${name} — הזמנה חדשה התקבלה</h2>
        <p style="margin:0 0 24px;color:#7c6a55;">${priceBeforeVat} ₪ + מע״מ (סה״כ: ${priceIls} ₪)</p>

        <table cellspacing="0" cellpadding="0" style="width:100%;font-size:13px;color:#7c6a55;">
            <tr>
                <td><strong>מס׳ הזמנה:</strong> ${order.orderId}</td>
                <td align="left"><strong>נוצרה:</strong> ${order.createdAt}</td>
            </tr>
        </table>

        ${section("פרטי הלקוח", [
            row("שם מלא", d.client_name),
            row("ת.ז.", d.client_id),
            row("טלפון", d.client_phone),
            row("דוא״ל", d.client_email),
            row("כתובת", `${d.client_street || ""}${d.client_city ? ", " + d.client_city : ""}`),
        ])}

        ${section("פרטי הנכס", [
            row("כתובת", `${d.property_street || ""}${d.property_city ? ", " + d.property_city : ""}`),
            row("גוש / חלקה", `גוש ${d.property_block || "—"}, חלקה ${d.property_parcel || "—"}${d.property_subparcel ? ", ת״ח " + d.property_subparcel : ""}`),
        ])}

        ${section("פרטי ההערה", [
            row("סוג ההערה", NOTE_TYPES[d.note_type] || d.note_type || "—"),
            row("שם בעל הנכס הרשום", d.owner_name),
            row("ת.ז. בעל הנכס הרשום", d.owner_id),
            row("מועד עסקת הבסיס", d.base_transaction_date),
        ])}

        ${section("הסבר נוסף מהלקוח", [
            row("פירוט", (d.description || "").replace(/\n/g, "<br>")),
        ])}

        <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e8dfd2;color:#7c6a55;font-size:13px;">
            הודעה זו נשלחה אוטומטית מהפלטפורמה הדיגיטלית של עשור ושות׳.<br>
            ניתן להשיב להודעה זו ישירות ללקוח בדוא״ל ${d.client_email || ""}.
        </p>
    </div>
</body></html>`;

    const text = [
        `הזמנה חדשה - ${name}`,
        `מס׳ הזמנה: ${order.orderId}`,
        ``,
        `לקוח: ${d.client_name || "—"} (${d.client_email || "—"}, ${d.client_phone || "—"})`,
        `נכס: גוש ${d.property_block || "—"}, חלקה ${d.property_parcel || "—"}${d.property_subparcel ? ", ת״ח " + d.property_subparcel : ""}`,
        `סוג ההערה: ${NOTE_TYPES[d.note_type] || d.note_type || "—"}`,
        `בעל הנכס: ${d.owner_name || "—"}`,
        ``,
        d.description ? `פירוט: ${d.description}` : "",
    ].filter(Boolean).join("\n");

    return { subject, html, text };
}

export function formatCustomerEmail(order) {
    const d = order.payload || {};
    const subject = `אישור הזמנה — ${name} · עשור ושות׳`;
    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:'Heebo',Arial,sans-serif;background:#fdfbf7;padding:24px;color:#3a2e22;direction:rtl;">
    <div style="max-width:680px;margin:0 auto 16px;text-align:center;">
        <img src="https://asor-law.com/images/logo-he.png" alt="עשור ושות׳ - עורכי דין" style="width:200px;height:auto;display:inline-block;">
    </div>
    <div style="max-width:580px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 12px;color:#7a5c3e;">תודה על ההזמנה, ${d.client_name || ""}</h2>
        <p style="margin:0 0 16px;line-height:1.7;">
            הזמנתך ל-<strong>${name}</strong> התקבלה והתשלום נקלט בהצלחה. נחזור אליך תוך 24 שעות עסקים לתחילת תהליך הרישום ולקבלת מסמכים נוספים שעשויים להידרש.
        </p>
        <p style="margin:16px 0;line-height:1.7;color:#5a3d20;">
            <strong>מס׳ הזמנה:</strong> ${order.orderId}<br>
            <strong>סכום ששולם:</strong> ${priceBeforeVat} ₪ + מע״מ (סה״כ: ${priceIls} ₪)
        </p>
        <p style="margin:16px 0;line-height:1.7;font-size:14px;color:#7c6a55;">
            הליך רישום הערת אזהרה מתבצע מול לשכת רישום המקרקעין (טאבו) ולוקח בדרך כלל מספר ימי עסקים. נעדכן אותך לאורך התהליך.
        </p>
        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e8dfd2;color:#7c6a55;font-size:13px;line-height:1.6;">
            לשאלות — ניתן להשיב להודעה זו או לכתוב ל-office@asor-law.com.
        </p>
    </div>
</body></html>`;
    const text = [
        `תודה על ההזמנה, ${d.client_name || ""}.`,
        ``,
        `${name} - מס׳ הזמנה: ${order.orderId}`,
        `סכום ששולם: ${priceBeforeVat} ₪ + מע״מ (סה״כ: ${priceIls} ₪)`,
        ``,
        `נחזור אליך תוך 24 שעות עסקים.`,
        `לפניות: office@asor-law.com`,
    ].join("\n");
    return { subject, html, text };
}
