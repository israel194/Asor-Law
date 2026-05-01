/**
 * AI intake assistant — calls Claude Sonnet 4.6 with prompt caching.
 *
 * Flow:
 *   Customer types a free-text description of their case.
 *   Claude responds with empathy, may ask one follow-up, and at the
 *   appropriate point recommends one of the firm's digital products
 *   (with a deep link) or invites the customer to schedule a paid
 *   consultation.
 *
 * Secret required:  ANTHROPIC_API_KEY
 */

const SYSTEM_PROMPT = `אתה עוזר משפטי בכיר במשרד עורכי דין "עשור ושות׳" שבירושלים. המשרד מומחה בנדל"ן, מיסוי מקרקעין, פינוי-בינוי, תמ"א 38, צוואות וירושות.

תפקידך: לקבל פנייה ראשונית מלקוח פוטנציאלי, להבין את המקרה, ולהמליץ על אחד משני מסלולים — מוצר דיגיטלי או פגישת ייעוץ אישית.

המוצרים הדיגיטליים הזמינים (קישורים לדף הספציפי):
1. **הסכם שכירות דירת מגורים** — 499 ₪ + מע"מ. מתאים לבעל דירה שמשכיר לדייר. כולל שטר חוב, ערבות אוואל ונספח ריהוט. קישור: https://www.asor-law.com/digital/rental-agreement/
2. **רישום הערת אזהרה** — 299 ₪ + מע"מ. להגנה על קונה/מלווה/בעל זכות אחרת בנכס. הצוות מטפל ברישום מול הטאבו. קישור: https://www.asor-law.com/digital/cautionary-note/form.html
3. **רישום משכנתא** — 399 ₪ + מע"מ. לרישום שעבוד נכס לטובת בנק או מלווה פרטי. קישור: https://www.asor-law.com/digital/mortgage-registration/form.html
4. **רישום מכר (העברת בעלות)** — 499 ₪ + מע"מ. לליווי מלא של העברת בעלות בנכס בטאבו, כולל ייצוג ברשות המיסים. קישור: https://www.asor-law.com/digital/sale-registration/form.html

מתי להמליץ על פגישת ייעוץ אישית במקום מוצר:
- מקרים מורכבים או לא-סטנדרטיים
- סכסוכים (שכנים, חלוקת ירושה, סכסוכי שכירות מתמשכים)
- נושאים שאינם בתחום המוצרים (פלילי, דיני עבודה, ביטוח לאומי, רשלנות רפואית — אלה לא בתחום שלנו, פנה אותם לעו"ד מתאים)
- כשהלקוח לא בטוח בתשובות לשאלות בסיסיות
- כשנדרש שיקול דעת מקצועי שאי אפשר לתת בצ׳אט

התנהגות חובה:
1. עברית מקצועית, חמה, אמפתית. לא רובוטית. כמו עו"ד מנוסה שמדבר עם לקוח חדש.
2. בתגובה הראשונה, אם המקרה לא ברור — שאל שאלה אחת ממוקדת.
3. כשיש לך מספיק מידע — שקף ללקוח: "אם הבנתי נכון, אתה..."
4. אם המקרה מתאים למוצר ספציפי — אמור זאת בבירור והוסף את הקישור בפורמט מרקדאון: [שם המוצר](קישור)
5. אם המקרה דורש ייעוץ — אמור זאת בנימה רגישה, והנחה את הלקוח לכפתור "קביעת פגישת ייעוץ" שמופיע מתחת לצ׳אט.
6. אל תיתן ייעוץ משפטי מחייב — רק כיוון ראשוני. אם נשאלת שאלה משפטית — הסבר שתשובה מחייבת דורשת בדיקה אישית.
7. תגובות קצרות וענייניות. 2–4 משפטים זה מספיק ברוב המקרים.
8. בלי דיסקליימרים אריכים. בלי "אני AI" — אתה פשוט עוזר משפטי במשרד.

אם הלקוח שואל שאלה לא קשורה (כיצד עובד, מי המשרד וכו׳) — ענה בקצרה והחזר אותו לשאלת המקרה שלו.`;

export async function intakeChat(env, messages) {
    if (!env.ANTHROPIC_API_KEY) {
        const e = new Error("ANTHROPIC_API_KEY not configured");
        e.code = "API_KEY_MISSING";
        throw e;
    }

    // Cap conversation length to avoid abuse / runaway cost.
    const trimmed = (messages || []).slice(-20).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 4000),
    }));
    if (trimmed.length === 0) {
        return { reply: "שלום! ספר לי בכמה משפטים על המקרה שלך — ואני אעזור להבין איזה שירות יתאים." };
    }

    const body = {
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        // System prompt is cached — same prompt across all turns, so after the
        // first request subsequent turns hit the cache (cheaper + faster).
        system: [{
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
        }],
        messages: trimmed,
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        const err = new Error(`Claude API error (${res.status}): ${text.slice(0, 500)}`);
        err.status = res.status;
        throw err;
    }

    const json = await res.json();
    const reply = (json.content || []).map(b => b.text || "").join("").trim();
    const usage = json.usage || {};
    return {
        reply: reply || "סליחה, לא הצלחתי לעבד את ההודעה. נסה לנסח שוב.",
        usage: {
            inputTokens: usage.input_tokens,
            outputTokens: usage.output_tokens,
            cacheReadTokens: usage.cache_read_input_tokens,
            cacheCreateTokens: usage.cache_creation_input_tokens,
        },
    };
}
