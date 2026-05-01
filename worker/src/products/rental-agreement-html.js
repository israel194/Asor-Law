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
        const apxLetter = d.has_guarantors === "yes" ? "ג'" : "ב'";
        return `
            <p class="recital"><strong>והואיל</strong> והמשכיר משאיר בדירה חפצים ופריטי ריהוט המפורטים בנספח ${apxLetter} להסכם זה והמהווים חלק בלתי נפרד הימנו, ובכל פעם שיוזכר המונח "דירה" או "מושכר" הרי שהכוונה היא לדירה ביחד עם החפצים (להלן: <strong>"החפצים"</strong>);</p>`;
    }
    return "";
}

function guarantorsBlock(d, promissoryNote) {
    if (d.has_guarantors !== "yes") {
        return `<p class="clause"><strong>שטר חוב</strong> בסכום של ${fmtNum(promissoryNote)} ₪, חתום בידי השוכר ועבור כל אחד מהשוכרים בנפרד, בנוסח המצורף כנספח א' להסכם זה.</p>`;
    }
    const details = d.guarantors_details ? esc(d.guarantors_details).replace(/\n/g, "<br>") : "";
    return `
        <p class="clause"><strong>שטר חוב</strong> בסכום של ${fmtNum(promissoryNote)} ₪, חתום בידי השוכר ועבור כל אחד מהשוכרים בנפרד, בנוסח המצורף כנספח א' להסכם זה.</p>
        <p class="clause"><strong>כתב ערבות אוואל</strong>: שטר החוב יוחתם גם בידי ערבים בערבות אוואל מלאה, ביחד ולחוד, בנוסח המצורף כנספח ב' להסכם זה. פרטי הערבים: ${details || "כפי שיסוכם בין הצדדים"}.</p>`;
}

function additionalTenantsRecital(d) {
    if (!d.additional_tenants || !d.additional_tenants.trim()) return "";
    const list = esc(d.additional_tenants).replace(/\n/g, "<br>");
    return `
        <p class="recital"><strong>והואיל</strong> ובנוסף לשוכר הראשי המפורט מעלה, שוכרים נוספים יחזיקו ויתגוררו בדירה ביחד עם השוכר, וכל ההתחייבויות שבהסכם זה תחולנה עליהם יחד ולחוד: ${list};</p>`;
}

function numberToHebrewWords(n) {
    // Lightweight number-to-Hebrew-words for amounts up to 999,999.
    // Used in the promissory note appendix. Falls back to digits-only if outside range.
    if (n === undefined || n === null || isNaN(n)) return "";
    const num = Math.floor(Number(n));
    if (num < 0 || num > 999999) return String(num);
    const ones = ["", "אחד", "שניים", "שלושה", "ארבעה", "חמישה", "שישה", "שבעה", "שמונה", "תשעה",
        "עשרה", "אחד עשר", "שניים עשר", "שלושה עשר", "ארבעה עשר", "חמישה עשר", "שישה עשר",
        "שבעה עשר", "שמונה עשר", "תשעה עשר"];
    const tens = ["", "", "עשרים", "שלושים", "ארבעים", "חמישים", "שישים", "שבעים", "שמונים", "תשעים"];
    function under1000(x) {
        if (x === 0) return "";
        const h = Math.floor(x / 100);
        const r = x % 100;
        const hStr = h === 0 ? "" : h === 1 ? "מאה" : h === 2 ? "מאתיים" : ones[h] + " מאות";
        let rStr = "";
        if (r > 0) {
            if (r < 20) rStr = ones[r];
            else {
                const t = Math.floor(r / 10);
                const u = r % 10;
                rStr = u === 0 ? tens[t] : tens[t] + " ו" + ones[u];
            }
        }
        return [hStr, rStr].filter(Boolean).join(" ו");
    }
    if (num === 0) return "אפס";
    const thousands = Math.floor(num / 1000);
    const rest = num % 1000;
    let result = "";
    if (thousands > 0) {
        if (thousands === 1) result = "אלף";
        else if (thousands === 2) result = "אלפיים";
        else if (thousands < 11) result = ones[thousands] + " אלפים";
        else result = under1000(thousands) + " אלף";
    }
    if (rest > 0) {
        const restStr = under1000(rest);
        result = result ? result + " ו" + restStr : restStr;
    }
    return result;
}

function appendixPromissoryNote(d, signDateStr, signCity, promissoryNote) {
    const tenantName = esc(d.tenant_name) || "—";
    const tenantId = esc(d.tenant_id) || "—";
    const landlordName = esc(d.landlord_name) || "—";
    const landlordId = esc(d.landlord_id) || "—";
    const propAddr = [d.property_street, d.property_city].filter(Boolean).map(esc).join(", ") || "—";
    const amountWords = numberToHebrewWords(promissoryNote);
    return `
<div class="appendix">
    <div class="appendix-title">שטר חוב</div>
    <div class="appendix-subtitle">נספח א' להסכם השכירות</div>
    <p class="appendix-meta">נחתם ביום ${signDateStr}, בעיר ${esc(signCity)}</p>

    <p style="text-align:center;font-size:14pt;margin:18pt 0;">סכום השטר: <strong>${fmtNum(promissoryNote)} ₪</strong>${amountWords ? ` <span class="small">(${amountWords} שקלים חדשים)</span>` : ""}</p>

    <p>אני החתום מטה, <strong>${tenantName}</strong>, ת.ז. <strong>${tenantId}</strong> (להלן: <strong>"החייב"</strong>), מתחייב/ת בזאת לשלם, לפי דרישה ובכפוף לתנאים המפורטים מטה, ל<strong>${landlordName}</strong>, ת.ז. <strong>${landlordId}</strong> (להלן: <strong>"המוטב"</strong>), את סכום השטר הנקוב לעיל, וזאת בקשר עם הסכם השכירות שנחתם בין הצדדים ביום ${signDateStr} ביחס לדירה הנמצאת ב${propAddr} (להלן: <strong>"הסכם השכירות"</strong> ו<strong>"הדירה"</strong>, בהתאמה).</p>

    <h3 class="appendix-section-title">תנאי הפירעון</h3>
    <ol class="appendix-list">
        <li>שטר חוב זה משמש כבטוחה למילוי כל התחייבויות החייב על פי הסכם השכירות, לרבות תשלום דמי שכירות, פיצויים מוסכמים, נזקים לדירה ופינוי בתום התקופה.</li>
        <li>שטר חוב זה ייפרע אך ורק במקרה של הפרה יסודית של הסכם השכירות מצד החייב, ולאחר מתן הודעה בכתב לחייב על דרישת הפירעון, ובמתן ארכה של 14 ימים לתיקון ההפרה — אלא אם מהות ההפרה אינה ניתנת לתיקון.</li>
        <li>השטר ניתן למימוש כולו או חלקו, בהתאם לסכום הנזק או החוב בפועל, ופירעון חלקי לא יגרע מזכות המוטב לתבוע את היתרה.</li>
        <li>החייב מוותר בזה על חובת הצגת השטר לפני פירעונו ועל מתן הודעת חילול.</li>
        <li>הוראות שטר זה בנוסף ולא במקום הוראות הסכם השכירות וכל דין; לא יהיה במימוש שטר זה כדי לפטור את החייב מכל זכות או חובה אחרת בהסכם השכירות.</li>
    </ol>

    <div class="signature-row" style="margin-top:18pt;">
        <div class="signature-block" style="flex:1;text-align:center;">
            <div class="signature-line">חתימת החייב</div>
            <div class="small">${tenantName}</div>
            <div class="small">ת.ז.: ${tenantId}</div>
            <div class="small">תאריך: ${signDateStr}</div>
        </div>
    </div>

    <div class="witness-row" style="margin-top:14pt;">
        <div class="signature-block">
            <div class="signature-line">עד 1</div>
            <div class="small">שם: _______________________</div>
            <div class="small">ת.ז.: _______________________</div>
            <div class="small">חתימה: ____________________</div>
        </div>
        <div class="signature-block">
            <div class="signature-line">עד 2</div>
            <div class="small">שם: _______________________</div>
            <div class="small">ת.ז.: _______________________</div>
            <div class="small">חתימה: ____________________</div>
        </div>
    </div>
</div>`;
}

function appendixAvalGuarantee(d, signDateStr, signCity, promissoryNote, leaseStart, leaseEnd, monthlyRent, leaseMonths) {
    if (d.has_guarantors !== "yes") return "";
    const tenantName = esc(d.tenant_name) || "—";
    const tenantId = esc(d.tenant_id) || "—";
    const landlordName = esc(d.landlord_name) || "—";
    const landlordId = esc(d.landlord_id) || "—";
    const propAddr = [d.property_street, d.property_city].filter(Boolean).map(esc).join(", ") || "—";
    const amountWords = numberToHebrewWords(promissoryNote);
    return `
<div class="appendix">
    <div class="appendix-title">כתב ערבות אוואל אישית וספציפית</div>
    <div class="appendix-subtitle">נספח ב' להסכם השכירות</div>
    <p class="appendix-meta">נחתם ביום ${signDateStr}, בעיר ${esc(signCity)}</p>

    <p style="text-align:center;font-size:11pt;color:#5a3d20;margin-bottom:14pt;"><strong>ערבות זו הינה אישית וספציפית — כל ערב חתום לחוד וביחד עם הערב/ים האחר/ים, להבטחת התחייבויות השוכר המפורטות בהסכם השכירות הספציפי הנקוב בכתב ערבות זה.</strong></p>

    <p class="recital"><strong>הואיל</strong> ו<strong>${tenantName}</strong>, ת.ז. <strong>${tenantId}</strong> (להלן: <strong>"השוכר"</strong>), חתם ביום ${signDateStr} על הסכם שכירות עם <strong>${landlordName}</strong>, ת.ז. <strong>${landlordId}</strong> (להלן: <strong>"המשכיר"</strong>), ביחס לדירה הנמצאת ב${propAddr} (להלן: <strong>"הסכם השכירות"</strong> ו<strong>"הדירה"</strong>, בהתאמה);</p>

    <p class="recital"><strong>והואיל</strong> ועל פי הסכם השכירות, תקופת השכירות הינה ${esc(leaseMonths || "—")} חודשים, החל מיום ${fmtDate(leaseStart)} ועד ${leaseEnd ? fmtDate(leaseEnd) : "—"}, ודמי השכירות החודשיים בסך <strong>${fmtNum(monthlyRent)} ₪</strong>;</p>

    <p class="recital"><strong>והואיל</strong> ולהבטחת מילוי התחייבויות השוכר על פי הסכם השכירות, חתם השוכר על שטר חוב המצורף כנספח א' להסכם השכירות בסך של <strong>${fmtNum(promissoryNote)} ₪</strong>${amountWords ? ` (${amountWords} שקלים חדשים)` : ""} (להלן: <strong>"שטר החוב"</strong>);</p>

    <p class="recital"><strong>והואיל</strong> והערבים החתומים מטה הם בני משפחה ו/או מקורבים של השוכר, מבקשים לערוב באופן אישי וספציפי לכל התחייבויותיו של השוכר, וזאת לאחר שעיינו בעיון בהסכם השכירות ובשטר החוב והבינו את היקף ההתחייבות הנובעת מערבות זו;</p>

    <p style="text-align:center;margin-top:14pt;"><strong>אי לכך, הוצהר, הוסכם והותנה כדלקמן:</strong></p>

    <ol class="appendix-list">
        <li>הערבים החתומים מטה ערבים בערבות אוואל אישית, מלאה ובלתי חוזרת, ביחד ולחוד, להבטחת מילוי כל התחייבויות השוכר כלפי המשכיר על פי הסכם השכירות ועל פי שטר החוב, לרבות פירעון מלוא סכום שטר החוב, תשלום דמי שכירות, פיצויים מוסכמים, נזקים ופינוי הדירה.</li>
        <li>ערבות זו הינה ערבות עצמאית, נפרדת ובלתי תלויה לכל ערב — ולכל ערב מוסבת אחריות אישית מלאה לכלל סכום שטר החוב ולכלל התחייבויות השוכר, ללא קשר לחתימת ערב נוסף ולמעמדו של ערב נוסף. בטלות ערבות של ערב אחד לא תפגע בתוקף ערבותם של האחרים.</li>
        <li>ערבות זו ספציפית להסכם השכירות הנקוב בכתב זה ולא ניתנת להחלה על הסכם אחר. שינויים מהותיים בהסכם השכירות הנעשים ללא הסכמת הערבים בכתב — ולמעט ארכות והקלות זמניות לטובת השוכר — יביאו לפקיעת הערבות.</li>
        <li>הערבות תעמוד בתוקף מלא במשך כל תקופת השכירות, ולמשך 90 ימים נוספים לאחר תום תקופת השכירות או לאחר פינוי הדירה — לפי המאוחר — או עד למילוי מלא של כל התחייבויות השוכר.</li>
        <li>הערבים מוותרים מראש על כל זכות קדמה ועל הדרישה כי המשכיר ינקוט תחילה הליכים נגד השוכר. המשכיר רשאי לפנות לערבים — יחד או לחוד — ולדרוש את מלוא הסכום או כל חלק ממנו, אף בלא דרישה מוקדמת מהשוכר ובלא לפעול תחילה למימוש בטוחות אחרות.</li>
        <li>הערבים מצהירים כי כושרם המשפטי מלא, כי לא מצויים בחדלות פירעון או בהליך פש"ר, וכי בידיהם מלוא היכולת הכלכלית לעמוד בהתחייבות זו.</li>
        <li>חזרה, ביטול, פטור או שחרור הערבים — ולו חלקי — תקף אך ורק במסמך בכתב חתום על ידי המשכיר. שתיקה, אי דרישה או ארכות לשוכר אינן מהוות ויתור על זכויות המשכיר כלפי הערבים.</li>
        <li>סמכות השיפוט הבלעדית בכל סכסוך הנובע מערבות זו תהיה בבית המשפט המוסמך באזור הנכס.</li>
    </ol>

    <p style="margin-top:14pt;color:#5a3d20;"><strong>הצהרת הערבים:</strong> אנו, החתומים מטה, מצהירים כי קראנו והבנו את האמור בערבות זו, את הסכם השכירות ואת שטר החוב, וכי חתימתנו ניתנת מרצוננו החופשי וללא כל לחץ.</p>

    <div class="witness-row" style="margin-top:14pt;">
        <div class="signature-block">
            <div class="signature-line">ערב 1 (אישית וספציפית)</div>
            <div class="small">שם מלא: _______________________</div>
            <div class="small">ת.ז.: _______________________</div>
            <div class="small">כתובת: _____________________</div>
            <div class="small">טלפון: _____________________</div>
            <div class="small">חתימה: ____________________</div>
            <div class="small">תאריך: ${signDateStr}</div>
        </div>
        <div class="signature-block">
            <div class="signature-line">ערב 2 (אישית וספציפית)</div>
            <div class="small">שם מלא: _______________________</div>
            <div class="small">ת.ז.: _______________________</div>
            <div class="small">כתובת: _____________________</div>
            <div class="small">טלפון: _____________________</div>
            <div class="small">חתימה: ____________________</div>
            <div class="small">תאריך: ${signDateStr}</div>
        </div>
    </div>
</div>`;
}

function appendixFurnitureList(d, signDateStr, signCity) {
    if (d.has_furniture !== "yes" && d.has_furniture !== "on" && d.has_furniture !== true) return "";
    const tenantName = esc(d.tenant_name) || "—";
    const landlordName = esc(d.landlord_name) || "—";
    const list = (d.furniture_list || "").trim();
    // Split by newline first; if no newlines, split by comma.
    const items = list.includes("\n")
        ? list.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        : list.split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const minRows = 12;
    const allItems = items.slice();
    while (allItems.length < minRows) allItems.push("");
    const rows = allItems.map((item, i) => `
        <tr>
            <td class="num">${i + 1}</td>
            <td>${esc(item) || ""}</td>
            <td></td>
            <td></td>
        </tr>`).join("");

    return `
<div class="appendix">
    <div class="appendix-title">נספח ריהוט וציוד</div>
    <div class="appendix-subtitle">נספח ${d.has_guarantors === "yes" ? "ג'" : "ב'"} להסכם השכירות</div>
    <p class="appendix-meta">נחתם ביום ${signDateStr}, בעיר ${esc(signCity)}</p>

    <p>במעמד מסירת הדירה לשוכר, מסר המשכיר לידי השוכר את הריהוט והציוד המפורטים להלן (להלן: <strong>"הציוד"</strong>), המהווים חלק בלתי נפרד מהמושכר על פי הסכם השכירות. הצדדים בדקו ביחד את הפריטים ואישרו את מצבם כפי שצוין לצד כל פריט.</p>

    <table class="furniture-table">
        <thead>
            <tr>
                <th style="width:5%;">#</th>
                <th style="width:45%;">פריט / ציוד</th>
                <th style="width:25%;">מצב במועד מסירה</th>
                <th style="width:25%;">הערות</th>
            </tr>
        </thead>
        <tbody>${rows}
        </tbody>
    </table>

    <ol class="appendix-list" style="margin-top:14pt;">
        <li>השוכר מצהיר כי בדק את הציוד, מצא אותו במצב טוב ותקין כפי שצוין לעיל, ואחראי לשמירתו ולתחזוקתו במהלך כל תקופת השכירות.</li>
        <li>בתום תקופת השכירות, ימסור השוכר את הציוד למשכיר במצב טוב ותקין כפי שקיבל אותו, פרט לבלאי סביר משימוש ראוי. נזק או חוסר בפריט כלשהו ייחשב כנזק לדירה לכל דבר ועניין.</li>
        <li>נספח זה ישמש כפרוטוקול מסירה מחייב ויהווה את הבסיס להשוואה במועד החזרת המושכר.</li>
    </ol>

    <div class="signature-row" style="margin-top:18pt;">
        <div class="signature-block" style="text-align:center;">
            <div class="signature-line">חתימת המשכיר</div>
            <div class="small">${landlordName}</div>
            <div class="small">תאריך: ${signDateStr}</div>
        </div>
        <div class="signature-block" style="text-align:center;">
            <div class="signature-line">חתימת השוכר</div>
            <div class="small">${tenantName}</div>
            <div class="small">תאריך: ${signDateStr}</div>
        </div>
    </div>
</div>`;
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
            line-height: 1.5;
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
            font-size: 12.5pt;
            font-weight: 700;
            margin: 12pt 0 4pt;
            color: #5a3d20;
            text-align: center;
        }
        h2:not(.no-counter) {
            counter-increment: section;
        }
        h2:not(.no-counter)::before {
            content: counter(section, hebrew) ". ";
        }
        p { margin: 3pt 0; }
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
            margin: 4pt 0;
        }
        ol.clauses > li {
            counter-increment: clause;
            margin: 4pt 0;
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
            margin: 4pt 0;
            padding-right: 4.5em;
        }
        .recital > strong:first-child {
            display: inline-block;
            width: 4.5em;
            margin-right: -4.5em;
            vertical-align: baseline;
            color: #5a3d20;
            font-weight: 700;
        }
        .meta {
            text-align: center;
            font-size: 10pt;
            color: #555;
            margin-bottom: 14pt;
        }
        .party-block {
            margin: 4pt auto 6pt;
            max-width: 75%;
            padding: 6pt 14pt;
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
        .recital strong { color: #5a3d20; }
        .clause { margin: 6pt 0; }
        .signatures {
            margin-top: 18pt;
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
            margin: 24pt 8pt 4pt;
            padding-top: 3pt;
        }
        .sig-label {
            font-family: 'David Libre', 'David', serif;
            font-weight: 700;
            font-size: 11pt;
        }
        .sig-name { font-size: 10pt; color: #555; margin-top: 2pt; }
        .footer-note {
            margin-top: 12pt;
            font-size: 8.5pt;
            color: #777;
            text-align: center;
            border-top: 1px solid #e5dfd2;
            padding-top: 4pt;
        }
        .small { font-size: 9pt; color: #555; }

        /* ===== Appendices ===== */
        .appendix {
            page-break-before: always;
            counter-reset: appendix-clause;
        }
        .appendix-title {
            text-align: center;
            font-family: 'David Libre', 'David', serif;
            font-size: 17pt;
            font-weight: 700;
            color: #5a3d20;
            margin: 6pt 0 4pt;
            letter-spacing: 0.04em;
        }
        .appendix-subtitle {
            text-align: center;
            font-size: 10.5pt;
            color: #7a5c3e;
            margin-bottom: 2pt;
        }
        .appendix-meta {
            text-align: center;
            font-size: 9.5pt;
            color: #555;
            margin-bottom: 14pt;
        }
        .appendix-section-title {
            font-family: 'David Libre', 'David', serif;
            font-size: 11.5pt;
            font-weight: 700;
            color: #5a3d20;
            text-align: right;
            margin: 10pt 0 4pt;
        }
        .appendix p { margin: 4pt 0; }
        ol.appendix-list {
            list-style: none;
            padding-right: 0;
            margin: 4pt 0;
        }
        ol.appendix-list > li {
            counter-increment: appendix-clause;
            margin: 4pt 0;
            padding-right: 1.8em;
            text-indent: -1.8em;
        }
        ol.appendix-list > li::before {
            content: counter(appendix-clause) ". ";
            font-weight: 700;
            color: #5a3d20;
            margin-left: 4pt;
        }
        .signature-row {
            display: flex;
            justify-content: space-between;
            gap: 30pt;
            page-break-inside: avoid;
        }
        .signature-block {
            flex: 1;
        }
        .signature-line {
            border-top: 1px solid #1a1a1a;
            margin-top: 24pt;
            padding-top: 3pt;
            text-align: center;
            font-weight: 700;
        }
        .witness-row {
            display: flex;
            justify-content: space-between;
            gap: 30pt;
            page-break-inside: avoid;
        }
        table.furniture-table {
            width: 100%;
            border-collapse: collapse;
            margin: 12pt 0 14pt;
            font-size: 10pt;
        }
        table.furniture-table th, table.furniture-table td {
            border: 1px solid #c8b89a;
            padding: 6pt 8pt;
            text-align: right;
            vertical-align: top;
        }
        table.furniture-table th {
            background: #faf6f0;
            font-weight: 700;
            color: #5a3d20;
        }
        table.furniture-table td.num {
            text-align: center;
            color: #777;
        }
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

<p class="recital" style="margin-top:10pt;"><strong>והואיל</strong> והמשכיר הינו הבעלים של דירת מגורים הכוללת ${esc(d.property_bedrooms || "—")} חדרי שינה, ${esc(d.property_bathrooms || "—")} שירותים ו-${esc(d.property_showers || "—")} מקלחות, הנמצאת ברחוב ${esc(d.property_street || "—")}, ${esc(d.property_city || "—")}${d.property_neighborhood ? ", בשכונת " + esc(d.property_neighborhood) : ""}, והידועה כגוש: ${esc(d.property_block || "—")} חלקה: ${esc(d.property_parcel || "—")}${d.property_subparcel ? " ת״ח: " + esc(d.property_subparcel) : ""} (להלן: <strong>"הדירה"</strong> ו/או <strong>"המושכר"</strong>);</p>

<p class="recital"><strong>והואיל</strong> והשוכר מעוניין לשכור את הדירה מהמשכיר בהתאם לתנאים המפורטים בהסכם זה;</p>

<p class="recital"><strong>והואיל</strong> והשוכר מצהיר כי לא שילם למשכיר כל דמי מפתח עבור הדירה ולא כל תשלום אחר מלבד דמי השכירות הנקובים להלן, וכי לא יחזיק בדירה כדייר מוגן;</p>

<p class="recital"><strong>והואיל</strong> והמשכיר מעוניין להשכיר את הדירה והשוכר מעוניין לשכור את הדירה ובלבד שלא יהיה מוגן בה לפי חוק הגנת הדייר (נוסח משולב), תשל״ב-1972 או כל חוק דומה אשר יחוקק בעתיד;</p>
${furnitureRecital(d)}
<p class="recital"><strong>והואיל</strong> והמשכיר מצהיר כי המושכר ראוי למגורים ולמשכיר אין כל מניעה להתקשר בהסכם זה;</p>

<p class="recital"><strong>והואיל</strong> והשוכר מצהיר כי ישתמש במושכר למטרת מגורים בלבד והמשכיר הסכים להרשות לשוכר את השימוש בדירה למטרת מגורים בלבד;</p>
${additionalTenantsRecital(d)}

<p style="margin-top:10pt;text-align:center;"><strong>אי לכך הוסכם, הותנה והוצהר בין הצדדים כדלקמן:</strong></p>

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
    <li>השוכר אחראי לכל נזק, אובדן או קלקול שייגרמו לדירה ולכל הקשור והמחובר אליה כתוצאה מרשלנותו ו/או בזדון על ידו ו/או ע"י מי מטעמו ו/או מי מאורחיו ו/או מבקריו, ולמעט נזק, אובדן או קלקול הנגרמו עקב פגם נסתר או בלאי סביר משימוש ראוי.</li>
    <li>השוכר יתקן כל נזק, אובדן או קלקול כאמור על חשבונו בתוך זמן סביר ממועד קרותם או התגלותם, ויודיע למשכיר בכתב על כל נזק או תקלה בתוך 7 ימים ממועד התגלותם.</li>
    <li>השוכר יאפשר למשכיר לבצע כל פעולה ו/או תיקון ו/או טיפול במושכר, ולאפשר לבעלי מקצוע מטעם המשכיר להיכנס למושכר לצורך אחזקתו ו/או בדיקתו, תוך תיאום מראש עם השוכר ובמועדים ובשעות סבירות. בנסיבות חירום (כגון נזילה, דליפת גז או שריפה) שבהן לא יתאפשר ליצור קשר עם השוכר, יוכל המשכיר להיכנס לדירה ללא תיאום, ובלבד שיעדכן את השוכר מייד שניתן יהיה לעשות זאת.</li>
    <li>השוכר לא יערוך או יבצע כל שינוי, פנימי או חיצוני, בדירה או חלק הימנה (לרבות צביעה בצבע שאינו לבן, התקנת מתקנים, פתיחת קירות, שינוי תשתיות), ללא הסכמת המשכיר בכתב ומראש. כל שינוי או תוספת — אם יותרו — יהיו רכוש המשכיר, והשוכר לא יהיה רשאי לפרקם, להוציאם או לתבוע תמורה עבורם.</li>
    <li><strong>איסור העברה ושכירות משנה</strong>: השוכר לא יהא רשאי להעביר, להמחות, להסב או להשכיר את הדירה או חלק ממנה לצד שלישי כלשהו, ולא לאפשר לאחרים להחזיק בדירה או חלק ממנה, ללא הסכמת המשכיר בכתב ומראש. הפרת התחייבות זו תהווה הפרה יסודית של הסכם זה.</li>
    <li><strong>אורחים מזדמנים ושוהים מתמשכים</strong>: שהותם של אורחים מזדמנים בדירה לפרקי זמן קצרים מותרת. ואולם, שהות של אדם נוסף שאינו צד להסכם זה הנמשכת מעבר ל-30 ימים רצופים, מחייבת הודעה מראש למשכיר ואת הסכמתו בכתב.</li>
    <li><strong>בעלי חיים</strong>: השוכר לא יחזיק בדירה בעלי חיים מכל סוג, ללא הסכמת המשכיר בכתב ומראש. ניתנה הסכמה — אחראי השוכר לכל נזק שייגרם על ידי בעל החיים, ולניקיון יסודי של הדירה בתום השכירות.</li>
    <li><strong>איסור עישון</strong>: השוכר מתחייב כי לא יעשן בתוך הדירה ולא ירשה לאחרים לעשן בה. עישון על מרפסת או חלל פתוח של הדירה ייעשה תוך התחשבות בשכנים ובהוראות הדין.</li>
    <li>השוכר לא ישכפל את מפתחות הדירה ולא ימסור עותק לצד שלישי כלשהו, למעט בני משפחתו הגרים עמו דרך קבע. בתום השכירות יחזיר השוכר את כל המפתחות שנמסרו לו.</li>
    <li>השוכר ישמור על יחסי שכנות תקינים, ישמור על שקט, ולא יפריע בכל צורה שהיא לשכנים בבניין בו מצויה הדירה. השוכר יקפיד על כללי בית משותף ועל הוראות הדין בעניין רעש ושעות מנוחה.</li>
    <li>השוכר יקיים את כל הוראות החוק, התקנות וחוקי העזר העירוניים בקשר למטרת השימוש בדירה ולאחזקתה. השוכר יהיה אחראי לשפות ולפצות את המשכיר בגין כל נזק או הוצאה שייגרמו לו עקב הפרת התחייבות זו.</li>
</ol>

<h2>אחריות וביטוח</h2>
<p class="clause">המשכיר וכל הפועל בשמו או מטעמו לא יישאו בכל אחריות ובכל חבות לגבי כל נזק לרכוש ו/או לגוף שייגרם לשוכר ו/או לכל אדם שיימצא בדירה ובבניין, אשר ינבעו משימוש ו/או החזקה של השוכר במושכר, ובלבד שאין מדובר בנזק הנובע מפגם ו/או מום נסתר ו/או בשל המבנה עצמו. השוכר נוטל על עצמו את מלוא האחריות והסיכון בגין כל נזק כאמור, ומתחייב לפצות ולשפות את המשכיר בגין כל דמי נזק שיחויב בתשלומם וכנגד כל הוצאות שיוציא המשכיר בגין נזק כאמור. סעיף זה הינו יסודי בהסכם זה.</p>
<p class="clause">על אף כל האמור לעיל, האחריות והתשלום לתיקון נזקים או תקלות בתשתיות האינסטלציה, החשמל והגז, וכן לתיקון נזק ו/או תקלה הנובעת משימוש סביר ומבלאי סביר במושכר — שאינו ממעשה זדון או מחדל של השוכר — תחול על המשכיר, והוא מתחייב לתקנם תוך זמן סביר ולא יאוחר מ-14 ימים מקבלת הודעת השוכר על כך, ובמקרי חירום (דליפה, חוסר מים, חוסר חשמל) — תוך זמן סביר ובדחיפות המתחייבת מהנסיבות.</p>
<p class="clause">השוכר מתחייב לרכוש על חשבונו, בתוך 30 ימים ממסירת הדירה, פוליסת ביטוח תכולה וצדדי ג' (נזקים לגוף ולרכוש של צדדי ג'), בסכומי כיסוי סבירים ובכל מקרה לא פחות מ-50,000 ₪ לכיסוי תכולה ו-1,000,000 ₪ לכיסוי צד ג', ולהמציא למשכיר העתק מהפוליסה לפי דרישתו.</p>

<h2>תום תקופת השכירות ופינוי המושכר</h2>
<p class="clause">עם תום תקופת השכירות מתחייב השוכר להחזיר למשכיר את הדירה ותכולתה כשהיא נקיה, מסודרת, פנויה מכל אדם וחפץ, במצב טוב ותקין כפי שקיבלה — פרט לבלאי סביר. אחרת יהיה המשכיר רשאי לתקן ולנקות את הטעון ניקוי, סיוד או תיקון על חשבון השוכר.</p>
<p class="clause"><strong>פרוטוקול מסירה והחזרה</strong>: במעמד מסירת הדירה לשוכר ובמעמד החזרתה למשכיר ייערך פרוטוקול בכתב, חתום בידי שני הצדדים, המתעד את מצב הדירה ואת הציוד הקיים בה (ככל שמסופק ריהוט — בהתאם לנספח הריהוט המצורף). הפרוטוקול ישמש כבסיס להשוואה בעניין נזקים או חוסר בפריטים בתום השכירות.</p>
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

${appendixPromissoryNote(d, signDateStr, signCity, promissoryNote)}
${appendixAvalGuarantee(d, signDateStr, signCity, promissoryNote, leaseStart, leaseEnd, monthlyRent, leaseMonths)}
${appendixFurnitureList(d, signDateStr, signCity)}

</body>
</html>`;
}
