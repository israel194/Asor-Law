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

// Projects 3D cylindrical carousel — drag/swipe to rotate, dots on a circle
(function() {
    const stage = document.getElementById('projectsTrack');
    const slider = document.getElementById('projectsSlider');
    if (!stage || !slider) return;

    const cards = Array.from(stage.children).filter(el => el.classList.contains('project-card'));
    const N = cards.length;
    if (N === 0) return;
    const STEP = 360 / N;            // angle each card occupies on the cylinder
    const VISIBLE_HALF = 110;        // cards rotated more than this from front are hidden

    cards.forEach(c => c.classList.add('visible'));

    // Place each card at its fixed angle around the cylinder.
    // RTL just means user's "next" feels rightward; the underlying geometry is the same.
    cards.forEach((card, i) => {
        card.style.setProperty('--angle', (i * STEP) + 'deg');
    });

    // current: integer index, can grow beyond [0,N) — modulo gives the visible slot.
    // The continuous unbounded value lets us spin in either direction without jumping.
    let current = 0;
    let dragRot = 0;       // current drag offset in degrees
    let isDragging = false;
    let startX = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;      // px/ms
    let dragMoved = false;

    const norm = n => ((n % N) + N) % N;

    function applyRotation() {
        const rot = -current * STEP + dragRot;
        stage.style.setProperty('--rotation', rot + 'deg');
    }

    function paintActive() {
        const activeIdx = norm(current);
        cards.forEach((card, i) => {
            // Relative angle of this card from front (0 = facing camera)
            const raw = i * STEP - (norm(current) * STEP - dragRot);
            // Wrap to [-180, 180]
            let rel = ((raw % 360) + 540) % 360 - 180;
            const abs = Math.abs(rel);
            const isActive = i === activeIdx && Math.abs(dragRot) < STEP / 2;
            card.classList.toggle('is-active', isActive);
            card.classList.toggle('is-hidden', abs > VISIBLE_HALF);
            card.setAttribute('aria-hidden', abs > 60 ? 'true' : 'false');
        });
        dots.forEach((d, i) => d.classList.toggle('is-active', i === activeIdx));
    }

    function render() {
        applyRotation();
        paintActive();
    }

    // ===== Pagination ring — dots arranged on a circle =====
    const dotsEl = document.getElementById('projectsDots');
    const dots = [];
    if (dotsEl) {
        // Layout depends on dot ring size; read it once. Fallback if zero.
        const layout = () => {
            const w = dotsEl.clientWidth || 140;
            const r = w / 2 - 8; // small padding from edge
            cards.forEach((_, i) => {
                const a = (-90 + i * STEP) * Math.PI / 180; // i=0 at top
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

    // Go to a specific card index using shortest path (so dot 0 → 8 spins backward)
    function goTo(target) {
        let delta = ((target - norm(current)) % N + N) % N;
        if (delta > N / 2) delta -= N;
        current += delta;
        dragRot = 0;
        render();
    }

    function step(sign) {
        current += sign;
        dragRot = 0;
        render();
    }

    // ===== Drag (mouse + touch) =====
    function getX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }

    function onDragStart(e) {
        if (e.target.closest('a, button')) return;
        isDragging = true;
        dragMoved = false;
        slider.classList.add('is-dragging');
        startX = lastX = getX(e);
        lastT = performance.now();
        velocity = 0;
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const x = getX(e);
        const now = performance.now();
        const dt = Math.max(1, now - lastT);
        velocity = (x - lastX) / dt;
        lastX = x;
        lastT = now;
        const dx = x - startX;
        if (Math.abs(dx) > 4) dragMoved = true;
        // Convert horizontal pixels to rotation degrees.
        // Drag width that equals one card-step = ~200px on desktop, 140px on mobile.
        const stepPx = window.matchMedia('(max-width: 600px)').matches ? 140 : 200;
        // Drag right (positive dx) → rotate forward → decrease index later.
        // RTL: drag right should still feel like "browse next" so we mirror sign.
        const rtl = document.documentElement.dir === 'rtl';
        dragRot = (dx / stepPx) * STEP * (rtl ? 1 : -1);
        render();
        if (e.cancelable) e.preventDefault();
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        slider.classList.remove('is-dragging');
        // Add momentum: a fast flick moves an extra card.
        const stepPx = window.matchMedia('(max-width: 600px)').matches ? 140 : 200;
        const rtl = document.documentElement.dir === 'rtl';
        const flickDeg = (velocity * 220 / stepPx) * STEP * (rtl ? 1 : -1);
        const totalDeg = dragRot + flickDeg;
        const stepsMoved = Math.round(-totalDeg / STEP);
        current += stepsMoved;
        dragRot = 0;
        render();
    }

    slider.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
    slider.addEventListener('mouseleave', () => { if (isDragging) onDragEnd(); });
    slider.addEventListener('touchstart', onDragStart, { passive: true });
    slider.addEventListener('touchmove', onDragMove, { passive: false });
    slider.addEventListener('touchend', onDragEnd);
    slider.addEventListener('touchcancel', onDragEnd);

    // ===== Click side card → bring to front =====
    cards.forEach((card, i) => {
        card.addEventListener('click', (e) => {
            if (dragMoved) return;
            if (e.target.closest('a, button')) return;
            if (i === norm(current)) return;
            goTo(i);
        });
    });

    // ===== Arrow buttons =====
    document.querySelectorAll('.projects-3d-controls .projects-slider-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            step(btn.dataset.dir === 'next' ? 1 : -1);
        });
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
        slider.addEventListener('mousedown', dismissHint, { once: true });
        slider.addEventListener('touchstart', dismissHint, { once: true, passive: true });
    }

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
