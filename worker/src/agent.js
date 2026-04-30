/**
 * AI intake agent — wraps Anthropic's Messages API with a tool-use call
 * that forces structured output: a Hebrew reply plus an optional product
 * recommendation drawn from our catalog.
 *
 * Model: claude-sonnet-4-6 (latest Sonnet — quality/cost balance for triage).
 * Prompt caching is applied to system+tool blocks so multi-turn conversations
 * only pay full price on the first turn.
 */

import { PRODUCTS, getProductById, catalogForPrompt } from "./products.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const MAX_HISTORY = 20; // hard cap on turns to prevent runaway context

const SYSTEM_PROMPT = `אתה הסוכן הדיגיטלי של "האזור הדיגיטלי" של משרד עורכי הדין עשור ושות׳ בירושלים.

# תפקידך
1. להקשיב למקרה של הלקוח באוזן אנושית, חמה ומקצועית.
2. לשאול שאלות הבהרה ממוקדות (שאלה אחת בכל פעם — לא רשימה).
3. לשקף את המקרה במילים שלך כדי לוודא שהבנת.
4. להמליץ על מוצר ספציפי מהקטלוג שמתאים למקרה — או להפנות לפנייה אישית למשרד אם אין מוצר מתאים.

# סגנון
- עברית, גוף שני (אתה/את), טון אמפתי ומקצועי, לא רשמי מדי, ללא קלישאות.
- תגובות קצרות (2-4 משפטים בכל הודעה). שאלה אחת בכל פעם.
- אל תיתן ייעוץ משפטי ספציפי. אתה ממליץ על מוצרים, לא מייעץ.
- אל תמציא פרטים על מוצרים שלא קיימים בקטלוג.

# מתי להמליץ
- כשהבנת את המקרה והוא תואם מוצר אחד מהקטלוג — סכם ב-case_summary והחזר recommended_product_id.
- אם המוצר בסטטוס "בקרוב" — תציין שהמוצר עדיין לא זמין דיגיטלית, אבל המשרד יכול לטפל בו דרך פנייה ישירה (office@asor-law.com / 054-6302880).
- אם המקרה מורכב, רגיש (פלילי, גירושין סוערים, חוב גדול), או אין מוצר תואם — אל תמליץ על מוצר. הפנה לפנייה אישית למשרד והשאר recommended_product_id ריק.
- אל תמליץ אם עדיין חסרות לך עובדות בסיסיות — שאל קודם, החזר needs_more_info=true.

# קטלוג המוצרים
${catalogForPrompt()}

# פרטי המשרד (לפניות אישיות)
- אימייל: office@asor-law.com
- טלפון: 054-6302880
- כתובת: נחום חפצדי 17, מגדל רם קומה 11, ירושלים
- תחומי מומחיות: התחדשות עירונית, מיסוי מקרקעין, מס הכנסה, מע״מ.

תמיד השתמש בכלי respond_to_user. אל תכתוב טקסט מחוץ לכלי.`;

const TOOL_RESPOND = {
    name: "respond_to_user",
    description: "שלח תגובה ללקוח ובאופן אופציונלי המלץ על מוצר מהקטלוג.",
    input_schema: {
        type: "object",
        properties: {
            reply: {
                type: "string",
                description: "התגובה ללקוח בעברית — קצרה, אנושית. שאלה אחת או משפט שיקוף."
            },
            case_summary: {
                type: "string",
                description: "סיכום המקרה כפי שהבנת אותו, במילים שלך. ריק אם עדיין לא הגעת לסיכום."
            },
            recommended_product_id: {
                type: "string",
                description: "id של מוצר מהקטלוג, או מחרוזת ריקה אם אין המלצה כעת."
            },
            needs_more_info: {
                type: "boolean",
                description: "true אם אתה צריך מידע נוסף לפני שתוכל להמליץ."
            },
            refer_to_office: {
                type: "boolean",
                description: "true אם המקרה מצריך פנייה אישית למשרד במקום מוצר דיגיטלי."
            }
        },
        required: ["reply", "needs_more_info", "refer_to_office"]
    }
};

/**
 * Run one chat turn.
 * @param {Object} env - Worker env (must contain ANTHROPIC_API_KEY)
 * @param {Array<{role: "user"|"assistant", content: string}>} messages
 * @returns {Promise<{reply: string, case_summary?: string, recommended_product?: object|null, needs_more_info: boolean, refer_to_office: boolean}>}
 */
export async function runAgent(env, messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("messages must be a non-empty array");
    }
    if (messages.length > MAX_HISTORY) {
        // Keep the most recent turns only — trims runaway sessions
        messages = messages.slice(-MAX_HISTORY);
    }
    if (messages[messages.length - 1].role !== "user") {
        throw new Error("last message must be from user");
    }

    const body = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Cache the static system prompt + tool definition — they're identical across turns
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: [TOOL_RESPOND],
        tool_choice: { type: "tool", name: "respond_to_user" },
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: {
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errText = await res.text();
        const err = new Error("Anthropic API error: " + errText);
        err.status = res.status;
        throw err;
    }

    const json = await res.json();
    const toolUse = (json.content || []).find(c => c.type === "tool_use");
    if (!toolUse) {
        throw new Error("Agent response missing tool_use block");
    }
    const out = toolUse.input;

    const recommendedId = (out.recommended_product_id || "").trim();
    const product = recommendedId ? getProductById(recommendedId) : null;

    return {
        reply: out.reply,
        case_summary: out.case_summary || "",
        recommended_product: product,
        needs_more_info: !!out.needs_more_info,
        refer_to_office: !!out.refer_to_office,
        usage: json.usage, // surface token usage for monitoring
    };
}
