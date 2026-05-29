/**
 * ⚠️  אזהרה — אל תריצו את build.js ללא קריאת BUILD.md תחילה!
 *
 * נכון להיום, template.html + lang/*.json אינם מסונכרנים עם קבצי הפלט
 * he/en/ar/index.html. הקבצים הללו נערכו ידנית (כותרות אבטחה, SEO, schema,
 * ותוכן) מבלי לעדכן את ה-template ואת קבצי התרגום. הרצת הסקריפט כעת תדרוס
 * את התוכן החי ותגרום לאובדן מידע (וגם לדליפת עברית לעמוד האנגלי).
 *
 * קבצי he/en/ar/index.html הם כיום מקור-האמת ומתוחזקים ידנית.
 * ראו BUILD.md להסבר מלא ולתהליך הסנכרון הנכון.
 *
 * מנגנון בטיחות: הסקריפט יסרב לרוץ אלא אם הועבר הדגל --force.
 */
const fs = require('fs');
const path = require('path');

if (!process.argv.includes('--force')) {
    console.error('\n⛔  build.js חסום מטעמי בטיחות: template.html אינו מסונכרן עם');
    console.error('    he/en/ar/index.html, והרצה תדרוס תוכן חי. ראו BUILD.md.');
    console.error('    אם אתם בטוחים (ה-template סונכרן), הריצו: node build.js --force\n');
    process.exit(1);
}

const LANGUAGES = ['he', 'en', 'ar'];
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

LANGUAGES.forEach(lang => {
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, 'lang', `${lang}.json`), 'utf-8'));

    let html = template;

    // Replace lang switcher active states
    LANGUAGES.forEach(l => {
        html = html.replace(new RegExp(`\\{\\{lang_switcher_${l}_active\\}\\}`, 'g'), l === lang ? ' class="active"' : '');
    });

    // Replace all {{section.key}} placeholders
    html = html.replace(/\{\{(\w+)\.(\w+)\}\}/g, (match, section, key) => {
        if (translations[section] && translations[section][key] !== undefined) {
            const val = translations[section][key];
            return Array.isArray(val) ? JSON.stringify(val) : val;
        }
        console.warn(`Missing translation: ${section}.${key} for ${lang}`);
        return match;
    });

    // Replace top-level {{key}} placeholders
    html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (translations[key] !== undefined) {
            return translations[key];
        }
        return match;
    });

    const outDir = path.join(__dirname, lang);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    console.log(`Generated ${lang}/index.html`);
});

console.log('Build complete!');
