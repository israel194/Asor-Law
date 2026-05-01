/**
 * Shared "page chrome" for /digital/ pages — injects:
 *   - cookie consent banner (with localStorage persistence)
 *   - accessibility widget (button + panel + statement modal)
 *   - legal footer links (privacy / terms / a11y statement)
 *
 * The styling lives in /css/style.css (already loaded on these pages).
 * This script is loaded by every page under /digital/ so it runs idempotently
 * — if any of the elements already exist on the page, we skip them.
 */
(function() {
    'use strict';

    function injectMarkup() {
        // === Cookie consent banner (only if not yet accepted) ===
        if (!document.getElementById('cookieConsent') && !localStorage.getItem('cookieConsent')) {
            const cookie = document.createElement('div');
            cookie.className = 'cookie-consent';
            cookie.id = 'cookieConsent';
            cookie.innerHTML = `
                <div class="cookie-consent-inner">
                    <p><strong>אנו מכבדים את פרטיותכם.</strong> אתר זה משתמש בעוגיות (cookies) ובטכנולוגיות דומות לצורך שיפור חוויית הגלישה, ניתוח שימוש ושמירת העדפות. במהלך השימוש באתר ייתכן איסוף של מידע אנונימי וכן של מידע שאתם מוסרים בטפסים. המידע נשמר באבטחה ומשמש למתן השירות בלבד, ולא יועבר לצד שלישי שלא לצורך זה. המשך השימוש באתר מהווה הסכמה לאיסוף ולעיבוד המידע. לפרטים מלאים: <a href="/he/privacy.html">מדיניות פרטיות</a> · <a href="/he/terms.html">תנאי שימוש</a></p>
                    <button class="cookie-consent-btn" id="cookieAccept">הבנתי ואני מסכים/ה</button>
                </div>`;
            document.body.appendChild(cookie);
        }

        // === Accessibility button ===
        if (!document.getElementById('accessibilityBtn')) {
            const a11yBtn = document.createElement('button');
            a11yBtn.className = 'a11y-btn';
            a11yBtn.id = 'accessibilityBtn';
            a11yBtn.setAttribute('aria-label', 'תפריט נגישות');
            a11yBtn.setAttribute('aria-expanded', 'false');
            a11yBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="4" r="2"/><path d="M19 13v-2c-1.54.02-3.09-.75-4.07-1.83l-1.29-1.43c-.17-.19-.38-.34-.61-.45-.01 0-.01-.01-.02-.01H13c-.35-.2-.75-.3-1.19-.26C10.76 7.11 10 8.04 10 9.09V15c0 1.1.9 2 2 2h5v5h2v-5.5c0-1.1-.9-2-2-2h-3v-3.45c1.29 1.07 3.25 1.94 5 1.95zm-6.17 5c-.41 1.16-1.52 2-2.83 2-1.66 0-3-1.34-3-3 0-1.31.84-2.41 2-2.83V12.1c-2.28.46-4 2.48-4 4.9 0 2.76 2.24 5 5 5 2.42 0 4.44-1.72 4.9-4h-2.07z"/></svg>';
            document.body.appendChild(a11yBtn);
        }

        // === Accessibility panel ===
        if (!document.getElementById('accessibilityPanel')) {
            const panel = document.createElement('div');
            panel.className = 'a11y-panel';
            panel.id = 'accessibilityPanel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', 'נגישות');
            panel.setAttribute('aria-hidden', 'true');
            panel.innerHTML = `
                <div class="a11y-panel-header">
                    <h2>נגישות</h2>
                    <button class="a11y-panel-close" id="a11yClose" aria-label="סגירה">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="a11y-panel-body">
                    <div class="a11y-options">
                        <button class="a11y-option" data-action="font-increase" aria-label="הגדלת טקסט"><span class="a11y-option-icon">A+</span><span>הגדלת טקסט</span></button>
                        <button class="a11y-option" data-action="font-decrease" aria-label="הקטנת טקסט"><span class="a11y-option-icon">A-</span><span>הקטנת טקסט</span></button>
                        <button class="a11y-option" data-action="grayscale" aria-label="גווני אפור"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2a10 10 0 0 1 0 20V2z"/></svg></span><span>גווני אפור</span></button>
                        <button class="a11y-option" data-action="high-contrast" aria-label="ניגודיות גבוהה"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><circle cx="12" cy="12" r="10"/></svg></span><span>ניגודיות גבוהה</span></button>
                        <button class="a11y-option" data-action="invert-colors" aria-label="היפוך צבעים"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/></svg></span><span>היפוך צבעים</span></button>
                        <button class="a11y-option" data-action="highlight-links" aria-label="הדגשת קישורים"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span><span>הדגשת קישורים</span></button>
                        <button class="a11y-option" data-action="readable-font" aria-label="פונט קריא"><span class="a11y-option-icon">Aa</span><span>פונט קריא</span></button>
                        <button class="a11y-option" data-action="stop-animations" aria-label="הפסקת אנימציות"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></span><span>הפסקת אנימציות</span></button>
                        <button class="a11y-option" data-action="big-cursor" aria-label="סמן גדול"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 8-6.5 1.5L11 19z"/></svg></span><span>סמן גדול</span></button>
                        <button class="a11y-option" data-action="keyboard-nav" aria-label="ניווט מקלדת"><span class="a11y-option-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/></svg></span><span>ניווט מקלדת</span></button>
                    </div>
                    <div class="a11y-keyboard-info" id="a11yKeyboardInfo" style="display:none;">
                        <strong>ניווט מקלדת:</strong><br>Tab - מעבר בין אלמנטים<br>Shift+Tab - חזרה<br>Enter - הפעלה<br>Escape - סגירה
                    </div>
                    <button class="a11y-reset" data-action="reset" aria-label="איפוס">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> איפוס
                    </button>
                    <a href="#" class="a11y-statement-link" id="a11yStatementLink">הצהרת נגישות</a>
                </div>`;
            document.body.appendChild(panel);
        }

        // === Accessibility statement modal ===
        if (!document.getElementById('a11yStatementOverlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'a11y-statement-overlay';
            overlay.id = 'a11yStatementOverlay';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = `
                <div class="a11y-statement-modal" role="dialog" aria-label="הצהרת נגישות">
                    <button class="a11y-statement-close" id="a11yStatementClose" aria-label="סגירה">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <div class="a11y-statement-content">
                        <h3>הצהרת נגישות</h3>
                        <p><strong>עשור ושות׳ - עורכי דין</strong> מחויבים לאפשר לכל אדם, כולל אנשים עם מוגבלות, להשתמש באתר בצורה שוויונית, מלאה ובכבוד.</p>
                        <h4>תקן הנגישות</h4>
                        <p>אתר זה עומד בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ובהתאם לתקן הישראלי ת"י 5568 ברמת AA של הנחיות WCAG 2.0.</p>
                        <h4>אמצעי הנגישות באתר</h4>
                        <ul><li>התאמת גודל הטקסט</li><li>שינוי ניגודיות צבעים</li><li>הדגשת קישורים</li><li>הפסקת אנימציות</li><li>פונט קריא</li><li>סמן גדול</li><li>ניווט מלא באמצעות מקלדת</li><li>תמיכה בתוכנות קורא מסך</li></ul>
                        <h4>פניות בנושא נגישות</h4>
                        <p>אם נתקלתם בבעיית נגישות באתר, אנא פנו אלינו:</p>
                        <p>טלפון: 02-5000275<br>דוא"ל: office@asor-law.com<br>כתובת: רח' נחום חפצדי 17, מגדל רם - קומה 11, ירושלים</p>
                        <p><strong>תאריך עדכון ההצהרה:</strong> מאי 2026</p>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
        }

        // === Legal footer links ===
        // Add to existing .form-footer if there is one and it doesn't yet have legal links.
        document.querySelectorAll('.form-footer .container').forEach(c => {
            if (c.querySelector('.footer-legal-links')) return;
            const span = document.createElement('p');
            span.className = 'form-footer-legal';
            span.innerHTML = `<span class="footer-legal-links"><a href="/he/privacy.html">מדיניות פרטיות</a> · <a href="/he/terms.html">תנאי שימוש</a> · <a href="#" id="footerA11yLink">הצהרת נגישות</a></span>`;
            c.appendChild(span);
        });
    }

    // === Cookie consent handler ===
    function wireCookieConsent() {
        const banner = document.getElementById('cookieConsent');
        const accept = document.getElementById('cookieAccept');
        if (!banner || !accept) return;
        setTimeout(() => banner.classList.add('visible'), 800);
        accept.addEventListener('click', () => {
            localStorage.setItem('cookieConsent', 'accepted');
            banner.classList.remove('visible');
        });
    }

    // === Accessibility widget handler — same logic as js/main.js ===
    function wireA11y() {
        const a11yBtn = document.getElementById('accessibilityBtn');
        const a11yPanel = document.getElementById('accessibilityPanel');
        const a11yClose = document.getElementById('a11yClose');
        const a11yStatementLink = document.getElementById('a11yStatementLink');
        const a11yStatementOverlay = document.getElementById('a11yStatementOverlay');
        const a11yStatementClose = document.getElementById('a11yStatementClose');
        const footerA11yLink = document.getElementById('footerA11yLink');
        const a11yKeyboardInfo = document.getElementById('a11yKeyboardInfo');
        if (!a11yBtn || !a11yPanel) return;

        const STORAGE_KEY = 'a11y-prefs';
        const FONT_LEVELS = [null, 'a11y-font-120', 'a11y-font-140'];
        let fontLevel = 0;
        const toggleClasses = {
            'grayscale': 'a11y-grayscale', 'high-contrast': 'a11y-high-contrast',
            'invert-colors': 'a11y-invert', 'highlight-links': 'a11y-highlight-links',
            'readable-font': 'a11y-readable-font', 'stop-animations': 'a11y-stop-animations',
            'big-cursor': 'a11y-big-cursor'
        };
        const state = {};
        Object.keys(toggleClasses).forEach(k => state[k] = false);

        function savePrefs() {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, fontLevel }));
        }
        function loadPrefs() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (!saved) return;
                Object.keys(toggleClasses).forEach(key => {
                    if (saved[key]) {
                        state[key] = true;
                        document.body.classList.add(toggleClasses[key]);
                        const btn = a11yPanel.querySelector('[data-action="' + key + '"]');
                        if (btn) btn.classList.add('active');
                    }
                });
                if (saved.fontLevel) {
                    fontLevel = saved.fontLevel;
                    FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
                    if (FONT_LEVELS[fontLevel]) document.documentElement.classList.add(FONT_LEVELS[fontLevel]);
                }
            } catch (e) { /* ignore */ }
        }

        function openPanel() {
            a11yPanel.classList.add('open');
            a11yPanel.setAttribute('aria-hidden', 'false');
            a11yBtn.setAttribute('aria-expanded', 'true');
            a11yClose.focus();
        }
        function closePanel() {
            a11yPanel.classList.remove('open');
            a11yPanel.setAttribute('aria-hidden', 'true');
            a11yBtn.setAttribute('aria-expanded', 'false');
            a11yBtn.focus();
        }
        function openStatement() {
            if (a11yStatementOverlay) {
                a11yStatementOverlay.classList.add('open');
                a11yStatementOverlay.setAttribute('aria-hidden', 'false');
            }
        }
        function closeStatement() {
            if (a11yStatementOverlay) {
                a11yStatementOverlay.classList.remove('open');
                a11yStatementOverlay.setAttribute('aria-hidden', 'true');
            }
        }

        a11yBtn.addEventListener('click', () => a11yPanel.classList.contains('open') ? closePanel() : openPanel());
        a11yClose.addEventListener('click', closePanel);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (a11yStatementOverlay && a11yStatementOverlay.classList.contains('open')) closeStatement();
                else if (a11yPanel.classList.contains('open')) closePanel();
            }
        });

        a11yPanel.querySelectorAll('.a11y-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'font-increase') {
                    if (fontLevel < FONT_LEVELS.length - 1) {
                        FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
                        fontLevel++;
                        if (FONT_LEVELS[fontLevel]) document.documentElement.classList.add(FONT_LEVELS[fontLevel]);
                    }
                    savePrefs();
                    return;
                }
                if (action === 'font-decrease') {
                    if (fontLevel > 0) {
                        FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
                        fontLevel--;
                        if (FONT_LEVELS[fontLevel]) document.documentElement.classList.add(FONT_LEVELS[fontLevel]);
                    }
                    savePrefs();
                    return;
                }
                if (action === 'keyboard-nav') {
                    if (a11yKeyboardInfo) {
                        const visible = a11yKeyboardInfo.style.display !== 'none';
                        a11yKeyboardInfo.style.display = visible ? 'none' : 'block';
                        btn.classList.toggle('active', !visible);
                    }
                    return;
                }
                if (toggleClasses[action] !== undefined) {
                    state[action] = !state[action];
                    document.body.classList.toggle(toggleClasses[action]);
                    btn.classList.toggle('active');
                    savePrefs();
                }
            });
        });

        const resetBtn = a11yPanel.querySelector('[data-action="reset"]');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            Object.values(toggleClasses).forEach(c => document.body.classList.remove(c));
            Object.keys(state).forEach(k => state[k] = false);
            FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
            fontLevel = 0;
            a11yPanel.querySelectorAll('.a11y-option.active').forEach(b => b.classList.remove('active'));
            if (a11yKeyboardInfo) a11yKeyboardInfo.style.display = 'none';
            localStorage.removeItem(STORAGE_KEY);
        });

        if (a11yStatementLink) a11yStatementLink.addEventListener('click', e => { e.preventDefault(); openStatement(); });
        if (a11yStatementClose) a11yStatementClose.addEventListener('click', closeStatement);
        if (a11yStatementOverlay) a11yStatementOverlay.addEventListener('click', e => { if (e.target === a11yStatementOverlay) closeStatement(); });
        if (footerA11yLink) footerA11yLink.addEventListener('click', e => { e.preventDefault(); openStatement(); });

        loadPrefs();
    }

    function init() {
        injectMarkup();
        wireCookieConsent();
        wireA11y();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
