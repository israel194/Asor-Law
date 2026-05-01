/**
 * Build the rental-agreement HTML document for PDF rendering.
 *
 * Inputs:  order.payload — the form fields submitted by the customer
 *          order.orderId, order.createdAt
 *
 * Output:  full HTML5 document (RTL Hebrew, A4 print styles) ready to be
 *          handed to Cloudflare Browser Rendering for PDF conversion.
 */

const PAYMENT_LABEL = {
    checks: "המחאות דחויות",
    bank_transfer: "הוראת קבע / העברה בנקאית",
    cash: "מזומן / אחר",
};

function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fmtNum(n) {
    if (n === undefined || n === null || n === "") return "—";
    return Number(n).toLocaleString("he-IL");
}

function fmtDate(iso) {
    if (!iso) return "—";
    const d = (iso instanceof Date) ? iso : new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return [
        String(d.getDate()).padStart(2, "0"),
        String(d.getMonth() + 1).padStart(2, "0"),
        d.getFullYear(),
    ].join("/");
}

function addMonthsMinusOneDay(startIso, months) {
    const d = new Date(startIso);
    if (isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + Number(months));
    d.setDate(d.getDate() - 1);
    return d;
}

function paymentTermsBlock(d, monthlyRent, leaseMonths) {
    const method = d.payment_method;
    const rent = fmtNum(monthlyRent);
    if (method === "checks") {
        const num = Math.max(0, Number(leaseMonths) - 1);
        return `
            <p class="clause">במעמד החתימה על הסכם זה ישלם השוכר למשכיר את דמי השכירות בגין החודש הראשון של תקופת השכירות, בסך של ${rent} ₪.</p>
            <p class="clause">בנוסף, ובמעמד החתימה, יפקיד השוכר בידי המשכיר ${num} המחאות דחויות, על סך של ${rent} ₪ כל אחת, אשר תאריכי פירעונן ב-${esc(d.payment_day || "—")} לכל חודש קלנדרי, החל מהחודש השני של תקופת השכירות ועד לחודש האחרון של תקופת השכירות.</p>`;
    }
    if (method === "bank_transfer") {
        return `
            <p class="clause">במעמד החתימה על הסכם זה ישלם השוכר למשכיר את דמי השכירות בגין החודש הראשון של תקופת השכירות, בסך של ${rent} ₪.</p>
            <p class="clause">החל מהחודש השני של תקופת השכירות, ישלם השוכר את דמי השכירות באמצעות הוראת קבע / העברה בנקאית לחשבון הבנק של המשכיר, ב-${esc(d.payment_day || "—")} לכל חודש קלנדרי, בגין אותו החודש.</p>`;
    }
    return `
        <p class="clause">אופן תשלום דמי השכירות: ${PAYMENT_LABEL[method] || "כפי שיוסכם בין הצדדים בכתב"}.</p>
        <p class="clause">דמי השכירות בגין כל חודש ישולמו ב-${esc(d.payment_day || "—")} לכל חודש קלנדרי, בגין אותו החודש.</p>`;
}

function furnitureRecital(d) {
    if (d.has_furniture && (d.has_furniture === "yes" || d.has_furniture === "on" || d.has_furniture === true)) {
        const list = d.furniture_list ? esc(d.furniture_list).replace(/\n/g, "<br>") : "כמפורט בנספח א'";
        return `
            <p class="recital"><strong>והואיל</strong> והמשכיר משאיר בדירה חפצים ופריטי ריהוט (${list}) המהווים חלק בלתי נפרד מהסכם זה. בכל פעם שיוזכר המונח "דירה" או "מושכר" הרי שהכוונה היא לדירה ביחד עם החפצים. (להלן: <strong>"החפצים"</strong>);</p>`;
    }
    return "";
}

function guarantorsBlock(d, promissoryNote) {
    if (d.has_guarantors !== "yes") {
        return `<p class="clause"><strong>שטר חוב</strong> בסכום של ${fmtNum(promissoryNote)} ₪ עבור כל אחד מהשוכרים בנפרד.</p>`;
    }
    const details = d.guarantors_details ? esc(d.guarantors_details).replace(/\n/g, "<br>") : "";
    return `
        <p class="clause"><strong>שטר חוב</strong> בסכום של ${fmtNum(promissoryNote)} ₪ עבור כל אחד מהשוכרים בנפרד.</p>
        <p class="clause"><strong>ערבים אישיים</strong>: השוכר ימציא למשכיר ערבים אישיים שיחתמו על שטר החוב, לשביעות רצון המשכיר. פרטי הערבים: ${details || "כפי שיסוכם בין הצדדים"}.</p>`;
}

function additionalTenantsRecital(d) {
    if (!d.additional_tenants || !d.additional_tenants.trim()) return "";
    const list = esc(d.additional_tenants).replace(/\n/g, "<br>");
    return `
        <p class="recital"><strong>והואיל</strong> ובנוסף לשוכר הראשי המפורט מעלה, שוכרים נוספים יחזיקו ויתגוררו בדירה ביחד עם השוכר, וכל ההתחייבויות שבהסכם זה תחולנה עליהם יחד ולחוד: ${list};</p>`;
}

export function renderRentalAgreementHtml(order) {
    const d = order?.payload || {};
    const orderId = order?.orderId || "—";

    const signDate = order?.createdAt ? new Date(order.createdAt) : new Date();
    const signDateStr = fmtDate(signDate);
    const signCity = d.property_city || "ירושלים";

    const leaseMonths = Number(d.lease_months || 0);
    const leaseStart = d.lease_start;
    const leaseEnd = leaseStart ? addMonthsMinusOneDay(leaseStart, leaseMonths) : null;

    const monthlyRent = Number(d.monthly_rent || 0);
    const securityDeposit = monthlyRent * 3;
    const earlyTerminationMonths = 4;
    const earlyTerminationAmount = monthlyRent * earlyTerminationMonths;
    const promissoryNote = Number(d.promissory_note || 0);
    const latePenalty = Number(d.late_penalty || 500);

    const propertyAddress = [d.property_street, d.property_city].filter(Boolean).map(esc).join(", ");
    const landlordAddress = [d.landlord_street, d.landlord_city].filter(Boolean).map(esc).join(", ");
    const tenantAddress = [d.tenant_street, d.tenant_city].filter(Boolean).map(esc).join(", ");

    return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>הסכם שכירות בלתי מוגנת — ${esc(d.tenant_name || "")}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=David+Libre:wght@400;500;700&display=swap">
    <style>
        @page { size: A4; margin: 2.5cm 2cm 2.5cm 2cm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        body {
            font-family: 'David Libre', 'David', 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.7;
            color: #1a1a1a;
            direction: rtl;
            text-align: justify;
            counter-reset: section clause;
        }
        h1 {
            text-align: center;
            font-family: 'David Libre', 'David', serif;
            font-size: 18pt;
            font-weight: 700;
            margin: 0 0 4pt;
            letter-spacing: 0.02em;
        }
        .subtitle {
            text-align: center;
            font-size: 10pt;
            color: #555;
            margin: 0 0 18pt;
        }
        h2 {
            font-family: 'David Libre', 'David', serif;
            font-size: 13pt;
            font-weight: 700;
            margin: 18pt 0 6pt;
            color: #5a3d20;
            text-align: center;
        }
        h2:not(.no-counter) {
            counter-increment: section;
        }
        h2:not(.no-counter)::before {
            content: counter(section, hebrew) ". ";
        }
        p { margin: 4pt 0; }
        /* Hanging indent — wrapped lines align with the start of the text,
           not under the number / והואיל prefix. */
        .clause {
            counter-increment: clause;
            padding-right: 1.8em;
            text-indent: -1.8em;
        }
        .clause::before {
            content: counter(clause) ". ";
            font-weight: 700;
            color: #5a3d20;
            margin-left: 4pt;
        }
        ol.clauses {
            list-style: none;
            padding-right: 0;
            margin: 6pt 0;
        }
        ol.clauses > li {
            counter-increment: clause;
            margin: 6pt 0;
            padding-right: 1.8em;
            text-indent: -1.8em;
        }
        ol.clauses > li::before {
            content: counter(clause) ". ";
            font-weight: 700;
            color: #5a3d20;
            margin-left: 4pt;
        }
        .recital {
            margin: 6pt 0;
        }
        .meta {
            text-align: center;
            font-size: 10pt;
            color: #555;
            margin-bottom: 14pt;
        }
        .party-block {
            margin: 6pt auto 10pt;
            max-width: 75%;
            padding: 10pt 18pt;
            background: #faf6f0;
            border-right: 3px solid #c8b89a;
            border-left: 3px solid #c8b89a;
        }
        .party-label {
            font-family: 'David Libre', 'David', serif;
            font-weight: 700;
            color: #5a3d20;
            margin: 0 0 4pt;
        }
        .party-aka {
            text-align: left;
            font-size: 10pt;
            color: #555;
            margin-top: 6pt;
        }
        .party-aka strong { color: #1a1a1a; font-weight: 700; }
        .recital { margin: 6pt 0; padding-right: 0; }
        .recital strong { color: #5a3d20; margin-left: 4pt; }
        .clause { margin: 6pt 0; }
        .signatures {
            margin-top: 36pt;
            display: flex;
            justify-content: space-between;
            gap: 40pt;
            page-break-inside: avoid;
        }
        .sig-block {
            flex: 1;
            text-align: center;
        }
        .sig-line {
            border-top: 1px solid #1a1a1a;
            margin: 36pt 8pt 6pt;
            padding-top: 4pt;
        }
        .sig-label {
            font-family: 'David Libre', 'David', serif;
            font-weight: 700;
            font-size: 11pt;
        }
        .sig-name { font-size: 10pt; color: #555; margin-top: 2pt; }
        .footer-note {
            margin-top: 24pt;
            font-size: 8.5pt;
            color: #777;
            text-align: center;
            border-top: 1px solid #e5dfd2;
            padding-top: 6pt;
        }
        .small { font-size: 9pt; color: #555; }
    </style>
</head>
<body>

<h1>הסכם שכירות בלתי מוגנת</h1>

<p class="meta">שנערך ונחתם ביום ${signDateStr}, בעיר ${esc(signCity)}</p>

<h2 class="no-counter">הצדדים להסכם</h2>

<div class="party-block">
    <p class="party-label">המשכיר:</p>
    <p><strong>${esc(d.landlord_name)}</strong> &nbsp;·&nbsp; ת.ז.: <strong>${esc(d.landlord_id)}</strong></p>
    <p>כתובת: ${landlordAddress || "—"}</p>
    <p>טלפון: ${esc(d.landlord_phone)} &nbsp;·&nbsp; דוא"ל: ${esc(d.landlord_email)}</p>
    <p class="party-aka">(להלן: <strong>"המשכיר"</strong>)</p>
</div>

<div class="party-block">
    <p class="party-label">השוכר:</p>
    <p><strong>${esc(d.tenant_name)}</strong> &nbsp;·&nbsp; ת.ז.: <strong>${esc(d.tenant_id)}</strong></p>
    <p>כתובת: ${tenantAddress || "—"}</p>
    <p>טלפון: ${esc(d.tenant_phone)} &nbsp;·&nbsp; דוא"ל: ${esc(d.tenant_email)}</p>
    <p class="party-aka">(להלן: <strong>"השוכר"</strong>)</p>
</div>

<p class="recital" style="margin-top:14pt;"><strong>והואיל</strong> והמשכיר הינו הבעלים של דירת מגורים הכוללת ${esc(d.property_bedrooms || "—")} חדרי שינה, ${esc(d.property_bathrooms || "—")} שירותים ו-${esc(d.property_showers || "—")} מקלחות, הנמצאת ברחוב ${esc(d.property_street || "—")}, ${esc(d.property_city || "—")}${d.property_neighborhood ? ", בשכונת " + esc(d.property_neighborhood) : ""}, והידועה כגוש: ${esc(d.property_block || "—")} חלקה: ${esc(d.property_parcel || "—")}${d.property_subparcel ? " ת״ח: " + esc(d.property_subparcel) : ""} (להלן: <strong>"הדירה"</strong> ו/או <strong>"המושכר"</strong>);</p>

<p class="recital"><strong>והואיל</strong> והשוכר מעוניין לשכור את הדירה מהמשכיר בהתאם לתנאים המפורטים בהסכם זה;</p>

<p class="recital"><strong>והואיל</strong> והשוכר מצהיר כי לא שילם למשכיר כל דמי מפתח עבור הדירה ולא כל תשלום אחר מלבד דמי השכירות הנקובים להלן, וכי לא יחזיק בדירה כדייר מוגן;</p>

<p class="recital"><strong>והואיל</strong> והמשכיר מעוניין להשכיר את הדירה והשוכר מעוניין לשכור את הדירה ובלבד שלא יהיה מוגן בה לפי חוק הגנת הדייר (נוסח משולב), תשל״ב-1972 או כל חוק דומה אשר יחוקק בעתיד;</p>
${furnitureRecital(d)}
<p class="recital"><strong>והואיל</strong> והמשכיר מצהיר כי המושכר ראוי למגורים ולמשכיר אין כל מניעה להתקשר בהסכם זה;</p>

<p class="recital"><strong>והואיל</strong> והשוכר מצהיר כי ישתמש במושכר למטרת מגורים בלבד והמשכיר הסכים להרשות לשוכר את השימוש בדירה למטרת מגורים בלבד;</p>
${additionalTenantsRecital(d)}

<p style="margin-top:10pt;"><strong>אי לכך הוסכם, הותנה והוצהר בין הצדדים כדלקמן:</strong></p>

<h2>מבוא ופרשנות</h2>
<p class="clause">המבוא להסכם זה מהווה חלק בלתי נפרד הימנו כאילו נכלל בגוף סעיפי ההסכם. כותרות הסעיפים נועדו לנוחות בלבד ואין בהן כדי להשפיע על פרשנות ההסכם.</p>

<h2>אי תחולת חוק הגנת הדייר</h2>
<p class="clause">השוכר והמשכיר (להלן: <strong>"הצדדים"</strong>) מצהירים ומסכימים שהשוכר אינו ולא יהיה דייר מוגן בגין השכירות במושכר לפי חוק הגנת הדייר ו/או התקנות שהותקנו ו/או יותקנו לפיו ו/או חוקי הגבלת דמי שכירות ו/או עפ"י כל דין אחר כפי שהוא כיום ו/או כפי שיוחלף ו/או יותקן ו/או ישונה מעת לעת, ולא יחולו על השכירות לפי הסכם זה דיני הגנת הדייר ודיני הגבלת דמי השכירות.</p>
<p class="clause">השוכר מאשר כי לא שילם, אינו משלם ולא ישלם דמי מפתח בכל צורה שהיא לגבי המושכר או השכירות, וכן כי כל אשר ישקיע מידי פעם בביצוע שינויים במושכר — אם יעשה כן — לא יחשב כתשלום דמי מפתח או כל חלק מהם.</p>
<p class="clause">מכל מקום, מוותר בזאת השוכר מראש, למפרע ובאופן בלתי חוזר על כל טענה ו/או תביעה לדיירות מוגנת ו/או להגבלת דמי שכירות.</p>

<h2>תקופת השכירות</h2>
<p class="clause">המשכיר משכיר לשוכר והשוכר שוכר מאת המשכיר את המושכר למשך <strong>${esc(d.lease_months || "—")} חודשים</strong>, החל מיום <strong>${fmtDate(leaseStart)}</strong> ועד ליום <strong>${leaseEnd ? fmtDate(leaseEnd) : "—"}</strong> (להלן: <strong>"תקופת השכירות"</strong>).</p>
<p class="clause">מהות השכירות היא למגורים בלבד.</p>

<h2>דמי השכירות ואופן התשלום</h2>
<p class="clause">תמורת שכירות הדירה ישלם השוכר למשכיר דמי שכירות חודשיים בסך של <strong>${fmtNum(monthlyRent)} ₪</strong>, ב-${esc(d.payment_day || "—")} לכל חודש קלנדרי, בגין אותו החודש.</p>
${paymentTermsBlock(d, monthlyRent, leaseMonths)}
<p class="clause">כל סכום אשר על השוכר לשלם למשכיר בגין דמי השכירות ואשר לא ישולם במועדו, יעמיד למשכיר את הזכות לפנות את השוכרים מהדירה לאחר הודעה של 7 ימים ממועד ההודעה על פיגור בתשלום, וככל שההפרה טרם תוקנה, וזאת מבלי לפגוע בכל זכות אחרת העומדת בפני המשכיר מכוח הסכם זה ומכוח כל דין.</p>

<h2>מיסים והוצאות</h2>
<p class="clause">המיסים וההוצאות החלים על הדירה ישולמו כדלקמן:</p>
<p class="clause">ארנונה, מים וביוב, גז, חשמל, כבלים ואינטרנט וכל תשלום שוטף אחר החל על מחזיק יועברו על שם השוכר עם תחילת תקופת השכירות וישולמו ע"י השוכר במועדים הקבועים לתשלומם. השוכר יעביר למשכיר עפ"י דרישתו אסמכתאות המעידות על העברת החיובים השוטפים ע"ש השוכר.</p>
<p class="clause">דמי וועד בית בגין אחזקה שוטפת של החלק היחסי בבניין ישולמו ע"י השוכר במועדם. כל העלאה, אם תהיה כזו בדמי וועד הבית, תחול על השוכר בלבד.</p>
<p class="clause">השוכר יעביר על שמו את כל החיובים האמורים בתוך 30 ימים ממועד חתימת הסכם זה, וימציא למשכיר העתק מאישור העירייה בדבר חילופי המחזיקים בנכס.</p>
<p class="clause">עם סיום הסכם זה מכל סיבה שהיא, הצדדים מתחייבים לפעול יחד על מנת להשיב את רישום החשבונות על שם המשכיר.</p>
<p class="clause">תשלומים והוצאות החלים כדרך קבע על בעל הנכס, כגון היטל השבחה והיטל סלילה, יחולו וישולמו על ידי המשכיר.</p>

<h2>סיום מוקדם ופיצוי מוסכם</h2>
<p class="clause">השוכר לא יוכל לסיים את תקופת השכירות מוקדם יותר מהאמור בהסכם זה. אם פינה השוכר את הדירה לפני תום המועדים על פי הסכם זה, יצטרך לשלם פיצוי מוסכם בגובה של <strong>${earlyTerminationMonths} חודשי שכירות (${fmtNum(earlyTerminationAmount)} ₪)</strong>.</p>
<p class="clause">במידה והשוכר ימציא למשכיר שוכר חליפי לשביעות רצון המשכיר, יוכל לפנות את הדירה מוקדם מהאמור על פי הסכם זה, וזאת ללא חיוב בפיצוי המוסכם.</p>
<p class="clause">במידה ומי מהצדדים יחליט לסיים את תקופת השכירות מוקדם כאמור, יאפשר השוכר למשכיר להכניס שוכרים פוטנציאליים לראות את הנכס עד 2 מועדים בשבוע (שאינם בשבתות ומועדי ישראל), בשעות סבירות, כאשר כל מועד ביקור יהיה לכל היותר בטווח של 3 שעות.</p>

<h2>התחייבויות השוכר</h2>
<ol class="clauses">
    <li>השוכר מצהיר כי ראה את המושכר, בדק אותו היטב, ומצא אותו מתאים למטרותיו וראוי למגורים. השוכר מוותר על כל טענה ו/או תביעה בגין אי התאמה כלשהי, ורק בשל הצהרתו זו הסכים המשכיר להתקשר עמו בהסכם השכירות.</li>
    <li>השימוש בדירה ובתכולתה ייעשה באופן זהיר וסביר. השוכר ידאג לשלמותה וניקיונה וימנע מביצוע כל קלקול או נזק בה.</li>
    <li>השוכר אחראי לכל נזק, אובדן או קלקול שייגרמו לדירה ולכל הקשור והמחובר אליה כתוצאה מרשלנותו ו/או בזדון על ידו ו/או ע"י מי מטעמו ו/או מי מאורחיו ו/או מבקריו, ולמעט נזק, אובדן או קלקול הנגרמו עקב פגם נסתר.</li>
    <li>השוכר יתקן כל נזק, אובדן או קלקול כאמור על חשבונו בתוך זמן סביר ממועד קרותם או התגלותם, ויודיע למשכיר על כל נזק כאמור.</li>
    <li>השוכר יאפשר למשכיר לבצע כל פעולה ו/או תיקון ו/או טיפול במושכר, ולאפשר לבעלי מקצוע מטעם המשכיר להיכנס למושכר לצורך אחזקתו ו/או בדיקתו, תוך תיאום מראש עם השוכר. בנסיבות קיצוניות שבהן לא יתאפשר ליצור קשר עם השוכר, יוכל המשכיר להיכנס לדירה ללא תיאום, ובלבד שיעדכן את השוכר מייד שניתן יהיה לעשות זאת.</li>
    <li>השוכר לא יערוך או יבצע כל שינוי, פנימי או חיצוני, בדירה או חלק הימנה ללא הסכמת המשכיר בכתב ומראש. כל שינוי או תוספת — אם יותרו — יהיו רכוש המשכיר והשוכר לא יהיה רשאי לפרקם או לתבוע תמורה עבורם.</li>
    <li>השוכר ישמור על יחסי שכנות תקינים, ישמור על שקט, ולא יפריע בכל צורה שהיא לשכנים בבניין בו מצויה הדירה.</li>
    <li>השוכר יקיים את כל הוראות החוק, התקנות וחוקי העזר העירוניים בקשר למטרת השימוש בדירה ולאחזקתה. השוכר יהיה אחראי לשפות ולפצות את המשכיר בגין כל נזק או הוצאה שייגרמו לו עקב הפרת התחייבות זו.</li>
</ol>

<h2>אחריות וביטוח</h2>
<p class="clause">המשכיר וכל הפועל בשמו או מטעמו לא יישאו בכל אחריות ובכל חבות לגבי כל נזק לרכוש ו/או לגוף שייגרם לשוכר ו/או לכל אדם שיימצא בדירה ובבניין, אשר ינבעו משימוש ו/או החזקה של השוכר במושכר, ובלבד שאין מדובר בנזק הנובע מפגם ו/או מום נסתר ו/או בשל המבנה עצמו. השוכר נוטל על עצמו את מלוא האחריות והסיכון בגין כל נזק כאמור, ומתחייב לפצות ולשפות את המשכיר בגין כל דמי נזק שיחויב בתשלומם וכנגד כל הוצאות שיוציא המשכיר בגין נזק כאמור. סעיף זה הינו יסודי בהסכם זה.</p>
<p class="clause">על אף כל האמור לעיל, האחריות והתשלום לתיקון נזקים או תקלות בתשתיות האינסטלציה ו/או החשמל, וכן לתיקון נזק ו/או תקלה הנובעת משימוש סביר ומבלאי סביר במושכר — שאינו ממעשה זדון או מחדל של השוכר — תחול על המשכיר, והוא מתחייב לתקנם תוך זמן סביר מקבלת הודעת השוכר על כך.</p>
<p class="clause">השוכר מתחייב לרכוש על חשבונו פוליסת ביטוח תכולה וצדדי ג' (נזקים לגוף ולרכוש של צדדי ג'), ובהתאם לדרישת המשכיר להמציא אליו עותק מהפוליסה.</p>

<h2>תום תקופת השכירות ופינוי המושכר</h2>
<p class="clause">עם תום תקופת השכירות מתחייב השוכר להחזיר למשכיר את הדירה ותכולתה כשהיא נקיה, מסודרת, פנויה מכל אדם וחפץ, במצב טוב ותקין כפי שקיבלה — פרט לבלאי סביר. אחרת יהיה המשכיר רשאי לתקן ולנקות את הטעון ניקוי, סיוד או תיקון על חשבון השוכר.</p>
<p class="clause">בכל מקרה של איחור בפינוי הדירה עם תום תקופת השכירות, ישלם השוכר למשכיר פיצויים מוסכמים בסך של <strong>${fmtNum(latePenalty)} ₪</strong> בגין כל יום של איחור במסירה, וזאת כדמי פיצוי מוסכמים שאינם טעונים הוכחה ומבלי לפגוע בזכותו של המשכיר לתבוע כל סעד ו/או פיצוי אחר.</p>
<p class="clause">בנוסף, מבלי לפגוע בכלליות האמור, בכל מקרה שבו יפוג תוקפו של הסכם זה והשוכר יסרב לפנות את הדירה, יהיה המשכיר רשאי לתבוע פינוי, ולצורך זה יהיה המשכיר ו/או ב"כ רשאי להיכנס לדירה ולתפוס בה החזקה, אף ללא נטילת רשות השוכר. השוכר מוסר בזאת בעצם חתימתו על הסכם זה ייפוי כוח והרשאה למשכיר לבצע את האמור.</p>
<p class="clause">המשכיר מתחייב להודיע לשוכר מראש ובכתב על כל הפרה ולאפשר לשוכר לתקן את ההפרה בתוך 14 ימים מיום שקיבל הודעה על כך, וזאת בטרם שיפעל למימוש זכויותיו עפ"י הסכם זה ו/או עפ"י כל דין.</p>

<h2>בטחונות</h2>
<p class="clause">כבטחון למילוי כל התחייבויות השוכר על פי הסכם זה — לרבות כל התשלומים ופינוי הדירה בתום תקופת השכירות — יפקיד השוכר בידי המשכיר במעמד חתימת הסכם זה את הביטחונות הבאים, אשר יוחזרו לידי השוכר עד 60 יום מתום תקופת השכירות, בכפוף להשלמת מלוא התחייבויות השוכר ומסירת הדירה למשכיר לשביעות רצונו:</p>
<p class="clause"><strong>פיקדון מזומן / העברה בנקאית</strong> בסך של <strong>${fmtNum(securityDeposit)} ₪</strong> (3 חודשי שכירות).</p>
<p class="clause"><strong>שיק ביטחון</strong> להפקדה (בסיום ההסכם, ובמידה והשוכר לא יפנה את הנכס) — עם תאריך, חתימה, ציון המוטב וקרוס, ללא סכום.</p>
${guarantorsBlock(d, promissoryNote)}
<p class="clause">כל הביטחונות שיפקיד השוכר בידי המשכיר ייפרעו, אם וככל שייפרעו, בהתאם לעקרונות הסכם זה ותנאיו. במידה ויעשה בהם שימוש שלא עפ"י הקבוע בהסכם זה, ישפה המשכיר את השוכר בהתאם לסכום הפירעון שנעשה בחריגה מתנאי הסכם זה.</p>
<p class="clause">המשכיר יהיה רשאי לפעול למימוש ו/או הפקדת הבטחונות אך ורק במקרה שהשוכר הפר הוראה מהוראות הסכם זה, ולא תיקן את ההפרה בתוך 14 ימים מיום ששלח לו המשכיר הודעה בכתב לעשות כן.</p>

<h2>הוראות כלליות</h2>
<p class="clause">המשכיר רשאי להעביר ו/או להמחות את זכויותיו על פי הסכם זה ללא צורך בהסכמת השוכר, ובלבד שזכויות השוכר לא תיפגענה ושיודיע על כך בכתב לשוכר. השוכר לא יהא רשאי להמחות, להסב, להעביר או לשעבד את זכויותיו לפי הסכם זה.</p>
<p class="clause">השוכר לא יהיה רשאי לרשום הערת אזהרה בלשכת רישום המקרקעין בגין הסכם זה, ולא תהיה לו זכות עיכבון בדירה.</p>
<p class="clause">השוכר לא יהיה רשאי לקזז כל סכום שהוא מדמי השכירות, והוא מתחייב לשלם למשכיר את דמי השכירות במלואם כאמור בהסכם זה.</p>
<p class="clause">בכל מקרה בו צד להסכם לא ישתמש בזכות מזכויותיו הנובעות מהסכם זה, לא ייחשב הדבר כויתור או הסכמה. כל ויתור, ארכה או סובלנות מהצד הנפגע לא יגרעו ולא יפגעו באיזה זכות מזכויות הנפגע.</p>
<p class="clause">שום הסכמה ושום שינוי בתנאי הסכם זה לא יהיה להם תוקף אלא אם נעשו בכתב ובחתימת שני הצדדים.</p>
<p class="clause">כתובות הצדדים לצורכי הסכם זה הן כאמור במבוא. כל הודעה שתישלח לפי הכתובת הנ"ל בדואר רשום ו/או לכתובת המייל המצוינת לעיל, תיחשב כאילו הגיעה לתעודתה תוך 72 שעות מעת שיגורה.</p>
<p class="clause">המבוא וסעיפים ב, ג, ד, ו, ז, ח, ט ו-י הינם סעיפים יסודיים ועיקריים להסכם זה והפרתם תהווה הפרה יסודית של הוראות ההסכם.</p>

<div class="signatures">
    <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">המשכיר</div>
        <div class="sig-name">${esc(d.landlord_name)}</div>
    </div>
    <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">השוכר</div>
        <div class="sig-name">${esc(d.tenant_name)}</div>
    </div>
</div>

<p class="footer-note">
    הסכם זה הופק באופן דיגיטלי בפלטפורמת המוצרים הדיגיטליים של עשור ושות׳ — עורכי דין.<br>
    מס׳ הזמנה: ${esc(orderId)} · נוצר: ${signDateStr}
</p>

</body>
</html>`;
}
