/**
 * Canonical product catalog used by the AI intake agent.
 * Mirror of the cards rendered in digital/index.html — keep in sync when adding products.
 *
 * status:
 *   "active"      — product flow exists and customer can buy it now
 *   "coming-soon" — listed publicly but no automated flow yet; sales handled via the office
 */

export const PRODUCTS = [
    // ===== מקרקעין =====
    {
        id: "rental-agreement",
        title: "הסכם שכירות דירת מגורים",
        category: "מקרקעין",
        price_ils: 500,
        status: "active",
        url: "/digital/rental-agreement/",
        description: "הסכם מלא ומקיף לשכירות דירת מגורים, כולל ערבויות, מנגנון הצמדה ותנאי סיום."
    },
    {
        id: "commercial-lease",
        title: "הסכם שכירות מסחרית",
        category: "מקרקעין",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הסכם לשכירות נכס מסחרי או משרד, כולל סעיפי שימוש, שיפוצים, תחזוקה ופינוי."
    },
    {
        id: "apartment-purchase-review",
        title: "בדיקת חוזה רכישת דירה",
        category: "מקרקעין",
        status: "coming-soon",
        url: "/digital/#products",
        description: "חוות דעת על חוזה רכישה — איתור סיכונים, סעיפים בעייתיים, והמלצות לתיקון לפני חתימה."
    },
    {
        id: "tabu-poa",
        title: "ייפוי כוח לרישום בטאבו",
        category: "מקרקעין",
        status: "coming-soon",
        url: "/digital/#products",
        description: "ייפוי כוח לרישום זכויות, העברת בעלות, וביצוע פעולות מול לשכת רישום מקרקעין."
    },
    {
        id: "urban-renewal-consult",
        title: "ייעוץ ראשוני - תמ״א 38 / פינוי בינוי",
        category: "התחדשות עירונית",
        status: "coming-soon",
        url: "/digital/#products",
        description: "פגישת ייעוץ אונליין עם עו״ד מומחה — בדיקת זכויות, ניתוח ההצעה ומפת דרכים."
    },

    // ===== חוזים והסכמים =====
    {
        id: "nda",
        title: "הסכם סודיות (NDA)",
        category: "חוזים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הסכם סודיות חד-צדדי או הדדי, מותאם להגנה על מידע עסקי."
    },
    {
        id: "service-agreement",
        title: "הסכם שירותים / יועץ עצמאי",
        category: "חוזים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הסכם בין ספק שירות (פרילנסר/יועץ) ללקוח — תחומי אחריות, תשלום, קניין רוחני וסיום."
    },
    {
        id: "founders-agreement",
        title: "הסכם מייסדים",
        category: "חוזים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הסכם בין שותפים מייסדי חברה — הקצאת מניות, vesting, אחריות, יציאה ומחלוקות."
    },
    {
        id: "contract-review",
        title: "בדיקת חוזה ע״י עו״ד",
        category: "חוזים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "חוות דעת משפטית על חוזה קיים תוך 48 שעות, כולל הערות והמלצות לתיקון."
    },

    // ===== ירושות וצוואות =====
    {
        id: "personal-will",
        title: "צוואה אישית",
        category: "ירושות וצוואות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "צוואה בעדים מותאמת לפי החוק הישראלי — חלוקת רכוש, מינוי מבצע צוואה, והוראות מיוחדות."
    },
    {
        id: "mutual-will",
        title: "צוואה הדדית בני זוג",
        category: "ירושות וצוואות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "צוואה הדדית בין בני זוג — תניות הגנה ומנגנון לאחר פטירת השני."
    },
    {
        id: "inheritance-order",
        title: "בקשה לצו ירושה",
        category: "ירושות וצוואות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הכנה והגשה של בקשה לצו ירושה לרשם הירושה — מטופל ע״י עו״ד מהמשרד."
    },
    {
        id: "probate",
        title: "בקשה לצו קיום צוואה",
        category: "ירושות וצוואות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הליך משפטי לקיום צוואת הנפטר — הכנה, הגשה ומעקב עד אישור."
    },
    {
        id: "continuing-poa",
        title: "ייפוי כוח מתמשך",
        category: "ירושות וצוואות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "תכנון מקדים — מינוי אדם מהימן שיקבל החלטות עבורכם בעתיד (רכוש, רפואה, אישי)."
    },

    // ===== חברות ועסקים =====
    {
        id: "company-registration",
        title: "רישום חברה בע״מ",
        category: "חברות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "רישום חברה אונליין תוך 24 שעות — תקנון, אימות חתימה, הגשה לרשם החברות וקבלת תעודת התאגדות."
    },
    {
        id: "voluntary-liquidation",
        title: "פירוק חברה מרצון",
        category: "חברות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הליך פירוק מלא של חברה לא פעילה — כולל בקשת פטור מאגרה והגשת מסמכים."
    },
    {
        id: "annual-report",
        title: "דיווח שנתי לרשם החברות",
        category: "חברות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הגשת דוח שנתי אונליין כולל תשלום אגרה, והסרת הגבלת חברה מפרת חוק."
    },
    {
        id: "trademark",
        title: "רישום סימן מסחר",
        category: "חברות",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הגנה על המותג — בדיקת זמינות, הגשת בקשה לרשות הפטנטים, ומעקב עד רישום."
    },

    // ===== משפחה וזוגיות =====
    {
        id: "prenup",
        title: "הסכם ממון",
        category: "משפחה",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הסכם ממון בין בני זוג לפני נישואין או במהלכם — חלוקת רכוש וחיסכון מצרכי גירושין עתידיים."
    },
    {
        id: "cohabitation",
        title: "הסכם חיים משותפים",
        category: "משפחה",
        status: "coming-soon",
        url: "/digital/#products",
        description: "הסכם לבני זוג ידועים בציבור — הסדרת זכויות וחובות, רכוש משותף, ירושה ופרידה."
    },

    // ===== אימותים ותרגומים =====
    {
        id: "signature-verification",
        title: "אימות חתימה ע״י עו״ד",
        category: "אימותים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "אימות חתימה דיגיטלי בשיחת וידאו — לחשבונות בנק, הסכמי מייסדים, הקצאת מניות."
    },
    {
        id: "notarial-translation",
        title: "תרגום נוטריוני",
        category: "תרגומים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "תרגום מסמכים רשמיים בין עברית לאנגלית, כולל אישור נוטריון — תוך 24 שעות."
    },
    {
        id: "certified-copy",
        title: "אימות העתק מקור",
        category: "אימותים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "אישור עו״ד שהעתק מסמך זהה למקור — לתאגידים, רשויות, ושימוש בחו״ל."
    },
    {
        id: "general-poa",
        title: "ייפוי כוח כללי",
        category: "אימותים",
        status: "coming-soon",
        url: "/digital/#products",
        description: "ייפוי כוח רחב לפעולות כלליות, מקרקעין, או ייצוג מול רשויות — מאומת על ידי עו״ד."
    },
];

export function getProductById(id) {
    return PRODUCTS.find(p => p.id === id) || null;
}

/**
 * Compact catalog string for inclusion in the system prompt.
 * Cached server-side; kept short to limit token cost.
 */
export function catalogForPrompt() {
    const byCategory = {};
    for (const p of PRODUCTS) {
        (byCategory[p.category] ||= []).push(p);
    }
    const lines = [];
    for (const [cat, items] of Object.entries(byCategory)) {
        lines.push(`\n## ${cat}`);
        for (const p of items) {
            const status = p.status === "active" ? `פעיל · ₪${p.price_ils}` : "בקרוב";
            lines.push(`- ${p.id} (${status}) — ${p.title}: ${p.description}`);
        }
    }
    return lines.join("\n");
}
