/**
 * Product: רישום מכר (Sale Registration / property transfer).
 *
 * Type B — digital intake → attorney handles transfer of ownership in the
 * Land Registry, including tax matters. No PDF deliverable.
 */

export const id = "sale-registration";
export const name = "רישום מכר (העברת בעלות)";
export const priceIls = 4500;
export const requiredFields = ["client_name", "client_id", "client_email", "client_phone"];

const CLIENT_ROLE = {
    seller: "מוכר",
    buyer: "קונה",
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

function fmtNum(n) {
    if (n === undefined || n === null || n === "") return "—";
    return Number(n).toLocaleString("he-IL");
}

export function formatOfficeEmail(order) {
    const d = order.payload || {};
    const subject = `הזמנה חדשה - ${name} - ${d.client_name || "—"} (${order.orderId.slice(0, 8)})`;

    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:'Heebo',Arial,sans-serif;background:#fdfbf7;padding:24px;color:#3a2e22;direction:rtl;">
    <div style="max-width:680px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 4px;color:#7a5c3e;">${name} — הזמנה חדשה התקבלה</h2>
        <p style="margin:0 0 24px;color:#7c6a55;">${priceIls} ₪ כולל מע״מ</p>

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
            row("הלקוח הוא", CLIENT_ROLE[d.client_role] || d.client_role || "—"),
        ])}

        ${section("פרטי הצד השני (ה" + (d.client_role === "seller" ? "קונה" : "מוכר") + ")", [
            row("שם מלא", d.counterparty_name),
            row("ת.ז.", d.counterparty_id),
            row("טלפון", d.counterparty_phone),
            row("דוא״ל", d.counterparty_email),
        ])}

        ${section("פרטי הנכס", [
            row("כתובת", `${d.property_street || ""}${d.property_city ? ", " + d.property_city : ""}`),
            row("גוש / חלקה", `גוש ${d.property_block || "—"}, חלקה ${d.property_parcel || "—"}${d.property_subparcel ? ", ת״ח " + d.property_subparcel : ""}`),
            row("סוג הנכס", d.property_type),
        ])}

        ${section("פרטי העסקה", [
            row("מחיר העסקה", `${fmtNum(d.transaction_price)} ₪`),
            row("מועד חתימת הסכם המכר", d.contract_date),
            row("מועד מסירה מתוכנן", d.handover_date),
            row("תשלום מס שבח", d.mas_shevach_party === "client" ? "על הלקוח" : d.mas_shevach_party === "counterparty" ? "על הצד השני" : "—"),
            row("תשלום מס רכישה", d.mas_rechisha_party === "client" ? "על הלקוח" : d.mas_rechisha_party === "counterparty" ? "על הצד השני" : "—"),
        ])}

        ${section("הערות מהלקוח", [
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
        `לקוח: ${d.client_name || "—"} (${CLIENT_ROLE[d.client_role] || "—"}) — ${d.client_email || "—"}`,
        `צד שני: ${d.counterparty_name || "—"}`,
        `נכס: גוש ${d.property_block || "—"}, חלקה ${d.property_parcel || "—"}`,
        `מחיר העסקה: ${fmtNum(d.transaction_price)} ₪`,
    ].join("\n");

    return { subject, html, text };
}

export function formatCustomerEmail(order) {
    const d = order.payload || {};
    const subject = `אישור הזמנה — ${name} · עשור ושות׳`;
    const html = `
<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"></head>
<body style="font-family:'Heebo',Arial,sans-serif;background:#fdfbf7;padding:24px;color:#3a2e22;direction:rtl;">
    <div style="max-width:580px;margin:0 auto;background:#fff;padding:32px;border:1px solid #e8dfd2;border-radius:8px;">
        <h2 style="margin:0 0 12px;color:#7a5c3e;">תודה על ההזמנה, ${d.client_name || ""}</h2>
        <p style="margin:0 0 16px;line-height:1.7;">
            הזמנתך ל-<strong>${name}</strong> התקבלה והתשלום נקלט בהצלחה. נחזור אליך תוך 24 שעות עסקים לאיסוף מסמכי העסקה (הסכם מכר חתום, אישורי הצדדים, אישורי תשלום מסי שבח ורכישה, וכו').
        </p>
        <p style="margin:16px 0;line-height:1.7;color:#5a3d20;">
            <strong>מס׳ הזמנה:</strong> ${order.orderId}<br>
            <strong>סכום ששולם:</strong> ${priceIls} ₪ כולל מע״מ
        </p>
        <p style="margin:16px 0;line-height:1.7;font-size:14px;color:#7c6a55;">
            הליך רישום העברת בעלות מתבצע מול לשכת רישום המקרקעין ויכול לקחת כמה שבועות, בהתאם להיקף המסמכים ולמבנה העסקה.
        </p>
        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e8dfd2;color:#7c6a55;font-size:13px;line-height:1.6;">
            לשאלות — office@asor-law.com.
        </p>
    </div>
</body></html>`;
    const text = [
        `תודה על ההזמנה, ${d.client_name || ""}.`,
        ``,
        `${name} - מס׳ הזמנה: ${order.orderId}`,
        `סכום ששולם: ${priceIls} ₪ כולל מע״מ`,
        ``,
        `נחזור אליך תוך 24 שעות עסקים.`,
        `לפניות: office@asor-law.com`,
    ].join("\n");
    return { subject, html, text };
}
