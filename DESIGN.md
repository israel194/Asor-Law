# Asor Law - Website Design Document

## Firm Details
- **Name (HE):** ישראל עשור, משרד עורכי דין
- **Name (EN):** Israel Asor, Adv. (C.P.A.) / Asor & Co. – Attorneys at Law
- **Location:** נחום חפצדי 17 (קומה 11), מגדל רם, ירושלים
- **Mailing:** ת.ד. 34590, ירושלים 9134402
- **Mobile:** 054-6302880
- **Email:** office@asor-law.com
- **Fax:** 077-4448996
- **Website:** www.asor-law.com
- **Team size:** 8 attorneys

## Practice Areas
1. מס הכנסה (Income Tax)
2. מס ערך מוסף (VAT)
3. מיסוי מקרקעין (Real Estate Taxation)
4. התחדשות עירונית (Urban Renewal)

## Professional Roles
- יו"ר ועדת התחדשות עירונית בלשכת עו"ד בירושלים
- מ"מ וועדת מיסוי מקרקעין בלשכת עו"ד ירושלים
- חבר וועדת הקשר עם רשות התאגידים – לשכת רו"ח

## Brand Identity

### Colors (extracted from logo)
| Role       | Color     | Hex       | Usage                          |
|------------|-----------|-----------|--------------------------------|
| Primary    | Dark Navy | `#1B3A5C` | Headers, text, navbar, footer  |
| Accent     | Gold      | `#C5A55A` | Highlights, lines, hover, CTAs |
| Secondary  | Light Gray| `#B8B8B8` | Borders, subtle backgrounds    |
| Background | White     | `#FFFFFF` | Page background, cards         |
| Alt BG     | Off-white | `#F5F5F0` | Alternating sections           |

### Typography
- Sans-serif stack optimized for Hebrew
- Primary: system Hebrew fonts (Arial, Helvetica, sans-serif)
- Headings: Bold, large (36-48px)
- Body: Regular, 16-18px
- Direction: RTL

### Logo Files
- `icon.jpeg` — Hebrew version (עשור ושות' - עורכי דין)
- `icon_en.jpeg` — English version (Asor & Co. – Attorneys at Law)

## Site Structure (Single-Page Scrolling)

### 1. Header (Fixed)
- Logo (left in RTL = right side visually)
- Navigation links: אודות | תחומי התמחות | פרויקטים | התחייבויות | צור קשר
- Phone CTA button: 054-6302880
- Sticky on scroll with subtle shadow

### 2. Hero Section
- Full-width background (building/cityscape imagery or gradient)
- Bold headline: ישראל עשור, משרד עורכי דין
- Subtitle: מומחים בהתחדשות עירונית ומיסוי מקרקעין
- Gold accent underline
- CTA button: צור קשר

### 3. About Section
- Firm introduction paragraph
- 4 practice area cards in grid:
  - מס הכנסה
  - מס ערך מוסף
  - מיסוי מקרקעין
  - התחדשות עירונית
- Professional roles listed with gold checkmarks

### 4. Projects Section
- Section title: פרויקטים בטיפול
- Grid of 9 project cards, each containing:
  - Project image (sourced online)
  - Location name
  - Project type (תמ"א 38 / פינוי ובינוי)
  - Stats: existing units → new units
  - Status badge
- Projects:

| # | Location | Type | Existing | New | Area |
|---|----------|------|----------|-----|------|
| 1 | רש"י 62-64, מקור ברוך | תמ"א 38(2) | 16 | 36 + מסחר | ירושלים |
| 2 | משה סנה, נווה יעקב | פינוי ובינוי | 240 | ~800 + מסחר, ביה"ס, גנים | ירושלים |
| 3 | משטרת הישובים, פסגת זאב | פינוי ובינוי | 62 | ~245 + מסחר | ירושלים |
| 4 | מקסיקו 14, קריית מנחם | פינוי ובינוי | 79 | 316 + מסחר, פארק | ירושלים |
| 5 | רבי טרפון 4-12 | שינוי תב"ע | 30 | 96 + מסחר | בית שמש |
| 6 | מעפילי האגוז, חזון איש | פינוי ובינוי | 165 | 720 + 250 דיוריות + מסחר | בית שמש |
| 7 | חיל האוויר 45-47, פסגת זאב | פינוי ובינוי | 131 | ~524 + מסחר | ירושלים |
| 8 | ישא ברכה 43,45, הבוכרים | פינוי ובינוי | 38 | ~130 + מסחר | ירושלים |
| 9 | קמזון 1-23, רמות ב' | פינוי ובינוי | 76 | ~310 + מסחר | ירושלים |

**Totals:** 837 existing → ~3,177+ new units

### 5. Commitments Section
- Title: המחויבות שלנו לדיירים
- Checklist with gold checkmarks:
  - גובה הבינוי ומפרט טכני
  - מרפסות לרבות מרפסות סוכה
  - עיצוב ותכנון אדריכלי איכותי
  - מעליות ומשאבות מים בפיקוח הלכתי
  - חברת ניהול לאחר אכלוס
  - כל דרישה נוספת בהסכמת רוב בעלי הזכויות

### 6. Contact Section
- Contact form (name, phone, email, message, submit)
- Map embed (נחום חפצדי 17, ירושלים)
- Contact details: phone, email, address
- Office hours (TBD)

### 7. Footer
- Logo
- Quick nav links
- Contact info
- Copyright
- Accessibility statement link

### 8. Floating Elements
- WhatsApp button (054-6302880)
- Back-to-top button

## Design Patterns (from competitor research)

### Inspired By
- **barone-law.co.il** — Practice area card grid, trust badges, professional header
- **tasalaw.co.il** — Urban renewal focus, project showcase approach
- **lalum.co** — Clean typography, smooth transitions, modern feel
- **wblaw.co.il** — Bold hero tagline, client trust section, generous whitespace

### Key Principles
1. Restrained color use — navy + gold + white only
2. Typography-driven hierarchy — bold headings, clean body text
3. Generous whitespace — premium, sophisticated feel
4. Fixed navigation — always accessible
5. Consistent section rhythm — predictable content flow
6. Subtle animations — smooth scroll, fade-in on scroll
7. Mobile-first responsive design
8. Full RTL Hebrew support
9. Accessibility compliance (Israeli law requirement)

## Tech Stack
- Single HTML file with embedded CSS and JS
- No framework dependencies (vanilla)
- Responsive (mobile, tablet, desktop)
- RTL direction throughout
- Smooth scroll navigation
- Intersection Observer for scroll animations
- Google Maps embed for location

## Project Images (To Source)
Each project needs 3+ images showing:
- Aerial/street view of current location
- Architectural rendering of planned development (if available)
- Neighborhood context photo

## Status
- [x] Design document created
- [ ] Project images sourced
- [x] HTML/CSS/JS implementation
- [x] Responsive testing
- [x] Content review
- [x] Contact form (Web3Forms → office@asor-law.com)
- [x] Form validation (Hebrew error messages)
- [ ] Multi-language support (EN + AR)
- [ ] SEO optimization (meta tags, schema, sitemap)


## שכבת העיצוב הנוכחית (נובמבר 2026): `css/theme.css`

עמודי הבית (he / en / ar) טוענים שלושה גיליונות לפי הסדר: `style.css`, `premium.css`, `theme.css`.
`theme.css` הוא השכבה הקובעת. מערכת העיצוב הופקה בסקיל ui-ux-pro-max (סגנון Trust & Authority).

- **טוקנים סמנטיים** (`--t-*` ב-`:root`): משטחים (אבן ירושלמית `--t-stone`, דיו כחול `--t-ink`), טקסט, זהב, קווים, רדיוסים (8 / 14 / 22px) ושלוש דרגות הצללה. אין להוסיף צבעי hex ישירות ברכיבים.
- **ניגודיות**: טקסט לבן על זהב אסור (2.3:1). על משטח בהיר הכפתור הראשי בצבע דיו עם טקסט לבן, על משטח כהה הכפתור בזהב עם טקסט דיו. טקסט זהב על רקע בהיר רק ב-`--t-gold-ink`.
- **Hero**: מבנה מפוצל (`.home-hero`): טקסט לצד הדמיה ממוסגרת, ומתחתיו כרטיס נתונים. התמונות ב-WebP (`images/hero-renewal*.webp`).
- **נייד**: סרגל פעולות קבוע בתחתית (`.action-bar`: טלפון, WhatsApp, תיאום פגישה) עד רוחב 768px, וכפתור ה-WhatsApp הצף מוסתר שם. אזורי מגע 44px לפחות.
- **אודות**: בלי מצגת רקע של תמונות חיצוניות. תמונות הצוות ב-WebP.
- דפי המדריכים, המאמרים והשירות המקוון (`he/topics`, `he/articles`, `digital`) משתמשים בגיליונות משלהם ולא שונו.
