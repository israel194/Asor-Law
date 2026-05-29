# מדיניות אבטחה — asor-law.com

מסמך זה מתעד את שכבות ההגנה של האתר ואת ההגדרות שיש להחיל **ידנית** ברמת
התשתית (Cloudflare + DNS), שאי-אפשר לקבע בקוד של אתר סטטי.

## 1. הגנות שכבר מיושמות בקוד

### עמודי האתר (סטטי, GitHub Pages)
- **Content-Security-Policy** (meta) — מגביל מקורות סקריפט/סגנון/תמונה/iframe, חוסם
  `object-src`, ומונע clickjacking דרך `frame-ancestors 'none'`.
- **Referrer-Policy**: `strict-origin-when-cross-origin`.
- **X-Content-Type-Options**: `nosniff`.
- **Permissions-Policy** — משבית גישה למצלמה/מיקרופון/מיקום/תשלום שאינם בשימוש.
- כל הקישורים החיצוניים (`target="_blank"`) כוללים `rel="noopener noreferrer"` —
  מונע reverse-tabnabbing (וקטור פישינג נפוץ).

### ה-Cloudflare Worker (asor-digital-api)
- **CORS** מוגבל לדומיינים שלנו בלבד (`CORS_ORIGINS`).
- **כותרות אבטחה** על כל תגובה (`worker/src/security.js`): nosniff, HSTS,
  X-Frame-Options, CSP מינימלי, Permissions-Policy, Cross-Origin-Resource-Policy.
- **Rate-limiting** לפי IP על נקודות קצה רגישות (יצירת תשלום, בקשת ייעוץ,
  צ׳אט ה-AI, שיתוף מסמך) — הגנה מפני spam, abuse ועלויות.
- ולידציית קלט על כל endpoint; אין דליפת payload מלא בשליפת הזמנה ציבורית.

## 2. הגדרות להחלה ידנית ב-Cloudflare (HTTP headers אמיתיים)

כותרות meta בעמוד מוגבלות (למשל HSTS ו-X-Frame-Options אינן נאכפות דרך meta).
אם הדומיין מוגש דרך Cloudflare proxy (ענן כתום), הוסיפו **Transform Rule → Modify
Response Header** עם הכותרות הבאות לכל ה-Responses:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()
Cross-Origin-Opener-Policy: same-origin
```

### WAF / Rate-limiting ברמת Cloudflare
- הפעילו **Managed WAF Rules** (חבילת Cloudflare OWASP Core).
- הוסיפו **Rate Limiting Rule**: עד ~60 בקשות/דקה לכל IP לנתיב `/api/*`
  (גיבוי לשכבת ה-Worter שכבר קיימת).
- הפעילו **Bot Fight Mode** ו-**Always Use HTTPS**.

## 3. אנטי-פישינג למייל (DNS) — קריטי למשרד עו״ד

כדי שתוקפים לא יוכלו לשלוח מיילי פישינג בשם `@asor-law.com`, ודאו שקיימות
רשומות ה-DNS הבאות (הערכים המדויקים תלויים בספק הדואר — Google Workspace/Microsoft):

- **SPF** (TXT) — לדוגמה Google Workspace:
  `v=spf1 include:_spf.google.com ~all`
- **DKIM** (TXT) — מפתח החתימה מספק הדואר (selector ייחודי).
- **DMARC** (TXT, בשם `_dmarc.asor-law.com`):
  `v=DMARC1; p=quarantine; rua=mailto:office@asor-law.com; fo=1`
  לאחר תקופת ניטור, שדרגו ל-`p=reject` לאכיפה מלאה.

## 4. דיווח על פגיעות
ראו `/.well-known/security.txt`. דיווחים: **office@asor-law.com**.
