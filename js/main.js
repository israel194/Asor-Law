// Page load time for time-on-page tracking
const pageLoadTime = Date.now();

// Header scroll effect
const header = document.getElementById('header');
const backToTop = document.getElementById('backToTop');
const scrollProgressBar = document.getElementById('scrollProgressBar');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }

    if (window.scrollY > 500) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }

    // Scroll progress bar
    if (scrollProgressBar) {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
        scrollProgressBar.style.width = pct + '%';
    }

    // Active nav link
    const sections = document.querySelectorAll('section[id]');
    const scrollPos = window.scrollY + 100;

    sections.forEach(section => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        const id = section.getAttribute('id');
        const link = document.querySelector(`.nav-links a[href="#${id}"]`);

        if (link) {
            if (scrollPos >= top && scrollPos < top + height) {
                document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
                link.classList.add('active');
            }
        }
    });
});

// Projects 3D cylindrical carousel — mouse position drives a running wheel.
// Mouse on the right half advances the wheel forward, left half rewinds it,
// center pauses. Mouse off the slider also pauses. Touch keeps tap-to-focus.
(function() {
    const stage = document.getElementById('projectsTrack');
    const slider = document.getElementById('projectsSlider');
    if (!stage || !slider) return;

    const cards = Array.from(stage.children).filter(el => el.classList.contains('project-card'));
    const N = cards.length;
    if (N === 0) return;
    const STEP_DEG = 360 / N;
    const VISIBLE_HALF = 110;

    cards.forEach(c => c.classList.add('visible'));
    cards.forEach((card, i) => {
        card.style.setProperty('--angle', (i * STEP_DEG) + 'deg');
    });

    let current = 0;       // unbounded; modulo gives visible card
    let direction = 0;     // -1 / 0 / +1, set by pointer position
    let timer = null;

    const norm = n => ((n % N) + N) % N;

    function applyRotation() {
        stage.style.setProperty('--rotation', (-current * STEP_DEG) + 'deg');
    }

    function paintActive() {
        const activeIdx = norm(current);
        cards.forEach((card, i) => {
            const raw = i * STEP_DEG - activeIdx * STEP_DEG;
            let rel = ((raw % 360) + 540) % 360 - 180;
            const abs = Math.abs(rel);
            card.classList.toggle('is-active', i === activeIdx);
            card.classList.toggle('is-hidden', abs > VISIBLE_HALF);
            card.setAttribute('aria-hidden', abs > 60 ? 'true' : 'false');
        });
        dots.forEach((d, i) => d.classList.toggle('is-active', i === activeIdx));
    }

    function render() {
        applyRotation();
        paintActive();
    }

    // ===== Pagination ring =====
    const dotsEl = document.getElementById('projectsDots');
    const dots = [];
    if (dotsEl) {
        const layout = () => {
            const w = dotsEl.clientWidth || 140;
            const r = w / 2 - 8;
            cards.forEach((_, i) => {
                const a = (-90 + i * STEP_DEG) * Math.PI / 180;
                const x = Math.cos(a) * r;
                const y = Math.sin(a) * r;
                if (dots[i]) {
                    dots[i].style.setProperty('--dot-x', x.toFixed(1) + 'px');
                    dots[i].style.setProperty('--dot-y', y.toFixed(1) + 'px');
                }
            });
        };
        cards.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'projects-3d-dot';
            dot.setAttribute('aria-label', `פרויקט ${i + 1}`);
            dot.addEventListener('click', () => goTo(i));
            dotsEl.appendChild(dot);
            dots.push(dot);
        });
        layout();
        window.addEventListener('resize', layout);
    }

    function goTo(target) {
        let delta = ((target - norm(current)) % N + N) % N;
        if (delta > N / 2) delta -= N;
        current += delta;
        render();
    }

    function step(sign) {
        current += sign;
        render();
    }

    // ===== Mouse-position auto-advance =====
    // Tick interval: long enough that one card transition (~700ms CSS) finishes
    // before the next step starts, but short enough for the wheel to feel alive.
    const TICK_MS = 1100;
    const DEADZONE = 0.18; // fraction of slider width around center where we pause

    function setDirection(d) {
        if (d === direction) return;
        direction = d;
        if (timer) { clearInterval(timer); timer = null; }
        if (direction !== 0) {
            // Take an immediate step so motion starts the moment the cursor enters a side
            step(direction);
            timer = setInterval(() => step(direction), TICK_MS);
        }
    }

    function directionFromX(clientX) {
        const rect = slider.getBoundingClientRect();
        const relX = (clientX - rect.left) / rect.width; // 0..1
        const offset = relX - 0.5;                       // -0.5..0.5
        if (Math.abs(offset) < DEADZONE) return 0;
        return offset > 0 ? 1 : -1;
    }

    slider.addEventListener('mousemove', e => setDirection(directionFromX(e.clientX)));
    slider.addEventListener('mouseenter', e => setDirection(directionFromX(e.clientX)));
    slider.addEventListener('mouseleave', () => setDirection(0));

    // ===== Card click → bring to front =====
    cards.forEach((card, i) => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('a, button')) return;
            if (i === norm(current)) return;
            goTo(i);
        });
    });

    // ===== Touch: tap on left/right half to step ±1 =====
    let touchStartX = null;
    slider.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    slider.addEventListener('touchend', e => {
        if (touchStartX == null) return;
        const endX = (e.changedTouches[0] || {}).clientX;
        if (endX == null) { touchStartX = null; return; }
        const dx = endX - touchStartX;
        // Treat short distance as tap, long horizontal as swipe.
        if (Math.abs(dx) < 30) {
            // Tap: use position relative to slider center
            const rect = slider.getBoundingClientRect();
            const relX = (endX - rect.left) / rect.width;
            if (Math.abs(relX - 0.5) > DEADZONE) {
                step(relX > 0.5 ? 1 : -1);
            }
        } else {
            // Swipe: each ~140px = one step
            const stepsMoved = -Math.round(dx / 140);
            if (stepsMoved !== 0) current += stepsMoved, render();
        }
        touchStartX = null;
    });

    // ===== Keyboard =====
    slider.addEventListener('keydown', (e) => {
        const rtl = document.documentElement.dir === 'rtl';
        if (e.key === 'ArrowLeft')  step(rtl ? 1 : -1);
        else if (e.key === 'ArrowRight') step(rtl ? -1 : 1);
    });

    // ===== Hide hint after first interaction =====
    const hint = document.querySelector('.projects-3d-hint');
    if (hint) {
        const dismissHint = () => {
            hint.style.opacity = '0';
            setTimeout(() => { hint.style.display = 'none'; }, 600);
        };
        slider.addEventListener('mouseenter', dismissHint, { once: true });
        slider.addEventListener('touchstart', dismissHint, { once: true, passive: true });
    }

    // Pause when the document is hidden (saves CPU on background tabs)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) setDirection(0);
    });

    render();
})();

// About section photo slideshow
(function() {
    const slides = document.querySelectorAll('.about-slide');
    const dots = document.querySelectorAll('.about-dot');
    if (slides.length < 2) return;

    let current = 0;
    let timer = null;

    function show(index) {
        slides.forEach((s, i) => s.classList.toggle('active', i === index));
        dots.forEach((d, i) => d.classList.toggle('active', i === index));
        current = index;
    }

    function next() {
        show((current + 1) % slides.length);
    }

    function start() {
        stop();
        timer = setInterval(next, 5500);
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    dots.forEach((d, i) => {
        d.addEventListener('click', () => {
            show(i);
            start();
        });
    });

    start();
})();

// Back to top
backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Mobile menu
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
});

// Close mobile menu on link click
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
    });
});

// Scroll animations (Intersection Observer)
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// Instant field validation
function validateField(field) {
    const val = field.value.trim();
    field.classList.remove('invalid', 'valid');

    // Skip validation on empty optional fields
    if (!field.required && val === '') return true;

    // Skip if never touched
    if (!field.dataset.touched) return true;

    if (field.checkValidity() && (val !== '' || !field.required)) {
        if (val !== '') field.classList.add('valid');
        return true;
    } else {
        field.classList.add('invalid');
        return false;
    }
}

// Attach instant validation: validate on blur, update on input
document.querySelectorAll('#contactForm input:not([type=hidden]), #contactForm textarea').forEach(f => {
    f.addEventListener('blur', () => {
        f.dataset.touched = 'true';
        validateField(f);
    });
    f.addEventListener('input', () => {
        if (f.dataset.touched) validateField(f);
    });
});

// Form submit handler
async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fields = form.querySelectorAll('input:not([type=hidden]), textarea');
    let valid = true;

    fields.forEach(f => {
        f.dataset.touched = 'true';
        if (!validateField(f)) valid = false;
    });

    if (!valid) {
        form.querySelector('.invalid')?.focus();
        return;
    }

    const btn = form.querySelector('.form-submit');
    const originalText = btn.textContent;
    btn.textContent = btn.dataset.sending || 'שולח...';
    btn.disabled = true;

    try {
        const rtl = '\u200F';
        const now = new Date();
        const timestamp = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        const device = /Mobi|Android/i.test(navigator.userAgent) ? 'נייד' : 'מחשב';
        const referrer = document.referrer || 'ישיר';
        const lang = navigator.language || navigator.userLanguage || 'לא ידוע';
        const params = new URLSearchParams(window.location.search);
        const utmSource = params.get('utm_source') || '';
        const utmMedium = params.get('utm_medium') || '';
        const utmCampaign = params.get('utm_campaign') || '';
        const utmStr = [utmSource, utmMedium, utmCampaign].filter(Boolean).join(' / ') || 'ללא';
        const seconds = Math.round((Date.now() - pageLoadTime) / 1000);
        const minutes = Math.floor(seconds / 60);
        const timeOnPage = minutes > 0 ? minutes + ' דקות ו-' + (seconds % 60) + ' שניות' : seconds + ' שניות';

        const browser = (function() {
            const ua = navigator.userAgent;
            if (ua.includes('Edg/')) return 'Edge';
            if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
            if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome';
            if (ua.includes('Firefox/')) return 'Firefox';
            if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
            return 'אחר';
        })();

        const pageLang = document.documentElement.lang || 'he';
        const langLabel = { he: 'עברית', en: 'English', ar: 'العربية' }[pageLang] || pageLang;

        const meta = [
            'נשלח בתאריך: ' + timestamp,
            'שפת העמוד: ' + langLabel,
            'סוג מכשיר: ' + device,
            'דפדפן: ' + browser,
            'שפת דפדפן: ' + lang,
            'רזולוציית מסך: ' + screen.width + 'x' + screen.height,
            'עמוד מקור: ' + window.location.href,
            'הגיע מ: ' + referrer,
            'קמפיין (UTM): ' + utmStr,
            'זמן שהייה בעמוד: ' + timeOnPage
        ].join('\n');

        const subjectSuffix = pageLang !== 'he' ? ' (' + langLabel + ')' : '';

        const payload = {
            access_key: '50c491ee-83db-4906-bb6f-3b3a287cbbab',
            subject: 'פנייה חדשה מהאתר - עשור ושות׳' + subjectSuffix,
            from_name: 'אתר עשור ושות׳',
            replyto: form.querySelector('#email').value || undefined,
            [rtl + 'שם מלא']: rtl + form.querySelector('#name').value,
            [rtl + 'טלפון']: rtl + form.querySelector('#phone').value,
            [rtl + 'דואל']: rtl + form.querySelector('#email').value,
            [rtl + 'הודעה']: rtl + form.querySelector('#message').value,
            [rtl + 'פרטים טכניים']: rtl + meta,
        };
        const res = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            btn.textContent = btn.dataset.success || 'הפנייה נשלחה בהצלחה!';
            btn.style.background = '#27ae60';
            form.reset();
            fields.forEach(f => {
                f.classList.remove('invalid', 'valid');
                delete f.dataset.touched;
            });
        } else {
            btn.textContent = btn.dataset.error || 'שגיאה בשליחה, נסו שוב';
            btn.style.background = '#e74c3c';
        }
    } catch {
        btn.textContent = btn.dataset.error || 'שגיאה בשליחה, נסו שוב';
        btn.style.background = '#e74c3c';
    }

    setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '';
        btn.disabled = false;
    }, 3000);
}

// Counter animation for hero stats
function animateCounters() {
    const counters = document.querySelectorAll('.hero-stat-number');
    counters.forEach(counter => {
        const text = counter.textContent;
        const hasPlus = text.includes('+');
        const hasTilde = text.includes('~');
        const hasComma = text.includes(',');
        const num = parseInt(text.replace(/[^0-9]/g, ''));

        if (isNaN(num)) return;

        let current = 0;
        const step = Math.ceil(num / 60);
        const timer = setInterval(() => {
            current += step;
            if (current >= num) {
                current = num;
                clearInterval(timer);
            }
            let display = hasComma
                ? current.toLocaleString()
                : current.toString();
            if (hasTilde) display = '~' + display;
            if (hasPlus) display += '+';
            counter.textContent = display;
        }, 20);
    });
}

// Run counter animation when hero is visible
const heroObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        animateCounters();
        heroObserver.disconnect();
    }
});
heroObserver.observe(document.querySelector('.hero'));

// Cookie consent
(function() {
    const banner = document.getElementById('cookieConsent');
    const acceptBtn = document.getElementById('cookieAccept');
    if (!banner || !acceptBtn) return;

    if (!localStorage.getItem('cookieConsent')) {
        setTimeout(() => banner.classList.add('visible'), 1000);
    }

    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'accepted');
        banner.classList.remove('visible');
    });
})();

// ===== Accessibility Widget =====
(function() {
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
        'grayscale': 'a11y-grayscale',
        'high-contrast': 'a11y-high-contrast',
        'invert-colors': 'a11y-invert',
        'highlight-links': 'a11y-highlight-links',
        'readable-font': 'a11y-readable-font',
        'stop-animations': 'a11y-stop-animations',
        'big-cursor': 'a11y-big-cursor'
    };

    // State tracking
    const state = {};
    Object.keys(toggleClasses).forEach(k => state[k] = false);

    function savePrefs() {
        const prefs = { ...state, fontLevel };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
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
                if (FONT_LEVELS[fontLevel]) {
                    document.documentElement.classList.add(FONT_LEVELS[fontLevel]);
                }
                updateFontButtons();
            }
        } catch (e) { /* ignore corrupt data */ }
    }

    function updateFontButtons() {
        const incBtn = a11yPanel.querySelector('[data-action="font-increase"]');
        const decBtn = a11yPanel.querySelector('[data-action="font-decrease"]');
        if (incBtn) incBtn.classList.toggle('active', fontLevel > 0);
        if (decBtn) decBtn.classList.toggle('active', fontLevel > 0);
    }

    // Panel open/close
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

    a11yBtn.addEventListener('click', () => {
        if (a11yPanel.classList.contains('open')) {
            closePanel();
        } else {
            openPanel();
        }
    });

    a11yClose.addEventListener('click', closePanel);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (a11yStatementOverlay && a11yStatementOverlay.classList.contains('open')) {
                closeStatement();
            } else if (a11yPanel.classList.contains('open')) {
                closePanel();
            }
        }
    });

    // Handle option clicks
    a11yPanel.querySelectorAll('.a11y-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;

            if (action === 'font-increase') {
                if (fontLevel < FONT_LEVELS.length - 1) {
                    FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
                    fontLevel++;
                    if (FONT_LEVELS[fontLevel]) {
                        document.documentElement.classList.add(FONT_LEVELS[fontLevel]);
                    }
                }
                updateFontButtons();
                savePrefs();
                return;
            }

            if (action === 'font-decrease') {
                if (fontLevel > 0) {
                    FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
                    fontLevel--;
                    if (FONT_LEVELS[fontLevel]) {
                        document.documentElement.classList.add(FONT_LEVELS[fontLevel]);
                    }
                }
                updateFontButtons();
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

            // Toggle actions
            if (toggleClasses[action] !== undefined) {
                state[action] = !state[action];
                document.body.classList.toggle(toggleClasses[action]);
                btn.classList.toggle('active');
                savePrefs();
            }
        });
    });

    // Reset
    a11yPanel.querySelector('[data-action="reset"]').addEventListener('click', () => {
        // Remove all body classes
        Object.values(toggleClasses).forEach(c => document.body.classList.remove(c));
        Object.keys(state).forEach(k => state[k] = false);

        // Reset font
        FONT_LEVELS.forEach(c => { if (c) document.documentElement.classList.remove(c); });
        fontLevel = 0;

        // Reset active buttons
        a11yPanel.querySelectorAll('.a11y-option.active').forEach(b => b.classList.remove('active'));

        // Hide keyboard info
        if (a11yKeyboardInfo) a11yKeyboardInfo.style.display = 'none';

        localStorage.removeItem(STORAGE_KEY);
    });

    // Accessibility Statement modal
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

    if (a11yStatementLink) {
        a11yStatementLink.addEventListener('click', (e) => {
            e.preventDefault();
            openStatement();
        });
    }

    if (footerA11yLink) {
        footerA11yLink.addEventListener('click', (e) => {
            e.preventDefault();
            openStatement();
        });
    }

    if (a11yStatementClose) {
        a11yStatementClose.addEventListener('click', closeStatement);
    }

    if (a11yStatementOverlay) {
        a11yStatementOverlay.addEventListener('click', (e) => {
            if (e.target === a11yStatementOverlay) closeStatement();
        });
    }

    // Load saved preferences on page load
    loadPrefs();
})();
