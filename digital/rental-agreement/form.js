(function() {
    'use strict';

    const STORAGE_KEY = 'asor-rental-form-v1';
    const TOTAL_STEPS = 6;
    let currentStep = 1;
    // Fire GA4 begin_checkout exactly once per session, on the first 1→2 transition
    let beginCheckoutSent = false;

    const form = document.getElementById('rentalForm');
    const steps = form.querySelectorAll('.form-step');
    const stepLabels = document.querySelectorAll('.form-progress-steps .step');
    const progressFill = document.getElementById('progressFill');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');

    // ===== Persistence =====
    function saveState() {
        const data = serialize();
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: currentStep, data }));
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const { step, data } = JSON.parse(raw);
            if (data) populate(data);
            if (step && step >= 1 && step <= TOTAL_STEPS) goToStep(step);
        } catch (e) { /* ignore */ }
    }

    function serialize() {
        const data = {};
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(el => {
            if (el.type === 'checkbox') data[el.name] = el.checked;
            else if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
            else data[el.name] = el.value;
        });
        return data;
    }

    function populate(data) {
        Object.entries(data).forEach(([name, val]) => {
            const els = form.querySelectorAll(`[name="${name}"]`);
            els.forEach(el => {
                if (el.type === 'checkbox') el.checked = !!val;
                else if (el.type === 'radio') { if (el.value === val) el.checked = true; }
                else el.value = val || '';
            });
        });
    }

    // ===== Step Navigation =====
    function goToStep(n) {
        if (n < 1 || n > TOTAL_STEPS) return;

        // GA4 conversion intent — user crossed step 1 = serious intent to buy
        if (n >= 2 && !beginCheckoutSent && typeof window.gtag === 'function') {
            window.gtag('event', 'begin_checkout', {
                currency: 'ILS',
                value: 500,
                items: [{
                    item_id: 'rental-agreement',
                    item_name: 'הסכם שכירות דירת מגורים',
                    price: 500,
                    quantity: 1
                }]
            });
            beginCheckoutSent = true;
        }

        currentStep = n;

        steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === currentStep));
        stepLabels.forEach(l => {
            const sn = Number(l.dataset.step);
            l.classList.toggle('active', sn === currentStep);
            l.classList.toggle('completed', sn < currentStep);
        });

        progressFill.style.width = ((currentStep / TOTAL_STEPS) * 100) + '%';

        prevBtn.disabled = currentStep === 1;
        if (currentStep === TOTAL_STEPS) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-flex';
        } else {
            nextBtn.style.display = 'inline-flex';
            submitBtn.style.display = 'none';
        }

        // Scroll smoothly to top of form
        document.querySelector('.form-main').scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Special handling per step
        if (currentStep === 4) updateLeaseEnd();
        if (currentStep === 5) updateDeposit();
        if (currentStep === 6) buildReview();

        saveState();
    }

    prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
    nextBtn.addEventListener('click', () => {
        if (validateStep(currentStep)) goToStep(currentStep + 1);
    });

    // Allow clicking step labels to jump (only to completed steps)
    stepLabels.forEach(l => {
        l.addEventListener('click', () => {
            const n = Number(l.dataset.step);
            if (n < currentStep) goToStep(n);
        });
        l.style.cursor = 'pointer';
    });

    // ===== Validation =====
    function validateStep(stepNum) {
        const stepEl = form.querySelector(`.form-step[data-step="${stepNum}"]`);
        if (!stepEl) return true;
        const inputs = stepEl.querySelectorAll('input[required], textarea[required], select[required]');
        let allValid = true;
        let firstInvalid = null;

        inputs.forEach(input => {
            const valid = validateField(input);
            if (!valid && !firstInvalid) firstInvalid = input;
            if (!valid) allValid = false;
        });

        // Israeli ID check on step 1 and 2
        if (stepNum === 1 || stepNum === 2) {
            const idField = stepEl.querySelector('[name$="_id"]');
            if (idField && idField.value && !validateIsraeliId(idField.value)) {
                showError(idField, 'תעודת זהות לא תקינה');
                if (!firstInvalid) firstInvalid = idField;
                allValid = false;
            }
        }

        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return allValid;
    }

    function validateField(input) {
        clearError(input);
        const val = input.value.trim();

        if (input.required && val === '') {
            showError(input, 'שדה חובה');
            return false;
        }

        if (input.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
            showError(input, 'כתובת אימייל לא תקינה');
            return false;
        }

        if (input.pattern && val && !new RegExp('^' + input.pattern + '$').test(val)) {
            showError(input, input.title || 'ערך לא תקין');
            return false;
        }

        if (input.type === 'number' && val) {
            const num = Number(val);
            if (isNaN(num)) { showError(input, 'יש להזין מספר'); return false; }
            if (input.min !== '' && num < Number(input.min)) { showError(input, `מינימום ${input.min}`); return false; }
            if (input.max !== '' && num > Number(input.max)) { showError(input, `מקסימום ${input.max}`); return false; }
        }

        return true;
    }

    function showError(input, msg) {
        input.classList.add('invalid');
        let err = input.parentElement.querySelector('.err-msg');
        if (!err) {
            err = document.createElement('small');
            err.className = 'err-msg';
            input.parentElement.appendChild(err);
        }
        err.textContent = msg;
        err.style.display = 'block';
    }

    function clearError(input) {
        input.classList.remove('invalid');
        const err = input.parentElement.querySelector('.err-msg');
        if (err) err.style.display = 'none';
    }

    // Israeli ID validation (Luhn-like checksum)
    function validateIsraeliId(id) {
        id = String(id).trim().padStart(9, '0');
        if (!/^\d{9}$/.test(id)) return false;
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            let digit = Number(id[i]) * ((i % 2) + 1);
            if (digit > 9) digit -= 9;
            sum += digit;
        }
        return sum % 10 === 0;
    }

    // ===== Live validation on blur =====
    form.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('blur', () => {
            if (input.dataset.touched) validateField(input);
        });
        input.addEventListener('input', () => {
            input.dataset.touched = 'true';
            if (input.classList.contains('invalid')) validateField(input);
            saveState();
            // Live derived updates
            if (['lease_start', 'lease_months'].includes(input.name)) updateLeaseEnd();
            if (input.name === 'monthly_rent') updateDeposit();
        });
    });

    // ===== Conditional fields =====
    const hasFurniture = document.getElementById('has_furniture');
    const furnitureField = document.getElementById('furniture_field');
    hasFurniture.addEventListener('change', () => {
        furnitureField.style.display = hasFurniture.checked ? '' : 'none';
        saveState();
    });

    const guarantorRadios = form.querySelectorAll('[name="has_guarantors"]');
    const guarantorsField = document.getElementById('guarantors_field');
    guarantorRadios.forEach(r => r.addEventListener('change', () => {
        const val = form.querySelector('[name="has_guarantors"]:checked').value;
        guarantorsField.style.display = val === 'yes' ? '' : 'none';
        saveState();
    }));

    // ===== Derived fields =====
    function updateLeaseEnd() {
        const startEl = document.getElementById('lease_start');
        const monthsEl = document.getElementById('lease_months');
        const display = document.getElementById('leaseEndValue');
        if (!startEl.value || !monthsEl.value) { display.textContent = '—'; return; }
        const start = new Date(startEl.value);
        const months = Number(monthsEl.value);
        if (isNaN(start.getTime()) || !months) { display.textContent = '—'; return; }
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);
        end.setDate(end.getDate() - 1);
        display.textContent = formatDateHe(end);
    }

    function updateDeposit() {
        const rentEl = document.getElementById('monthly_rent');
        const display = document.getElementById('depositValue');
        if (!rentEl || !display) return;
        const rent = Number(rentEl.value);
        if (!rent) { display.textContent = '—'; return; }
        display.textContent = formatNumber(rent * 3) + ' ₪';
    }

    function formatDateHe(d) {
        return [String(d.getDate()).padStart(2,'0'), String(d.getMonth()+1).padStart(2,'0'), d.getFullYear()].join('/');
    }

    function formatNumber(n) {
        return Number(n).toLocaleString('he-IL');
    }

    // ===== Build Review =====
    function buildReview() {
        const data = serialize();
        const review = document.getElementById('reviewContent');

        const sections = [
            {
                title: 'פרטי המשכיר',
                step: 1,
                fields: [
                    ['שם מלא', data.landlord_name],
                    ['ת.ז.', data.landlord_id],
                    ['כתובת', `${data.landlord_street || ''}, ${data.landlord_city || ''}`.replace(/^, |, $/g,'')],
                    ['טלפון', data.landlord_phone],
                    ['דוא"ל', data.landlord_email],
                ]
            },
            {
                title: 'פרטי השוכר',
                step: 2,
                fields: [
                    ['שם מלא', data.tenant_name],
                    ['ת.ז.', data.tenant_id],
                    ['כתובת קודמת', `${data.tenant_street || ''}, ${data.tenant_city || ''}`.replace(/^, |, $/g,'')],
                    ['טלפון', data.tenant_phone],
                    ['דוא"ל', data.tenant_email],
                    data.additional_tenants ? ['שוכרים נוספים', data.additional_tenants] : null,
                ].filter(Boolean)
            },
            {
                title: 'פרטי הנכס',
                step: 3,
                fields: [
                    ['כתובת', `${data.property_street || ''}, ${data.property_city || ''}${data.property_neighborhood ? ', ' + data.property_neighborhood : ''}`],
                    ['חדרים', `${data.property_bedrooms} שינה, ${data.property_bathrooms} שירותים, ${data.property_showers} מקלחות`],
                    ['גוש/חלקה', `גוש ${data.property_block}, חלקה ${data.property_parcel}${data.property_subparcel ? ', ת"ח ' + data.property_subparcel : ''}`],
                    data.has_furniture ? ['ריהוט', data.furniture_list || 'נכלל'] : ['ריהוט', 'הדירה ללא ריהוט'],
                ]
            },
            {
                title: 'תנאי השכירות',
                step: 4,
                fields: [
                    ['תקופה', `${formatDate(data.lease_start)} עד ${getEndDate(data.lease_start, data.lease_months)} (${data.lease_months} חודשים)`],
                    ['דמי שכירות', `${formatNumber(data.monthly_rent)} ₪ לחודש`],
                    ['יום תשלום', `ה-${data.payment_day} לכל חודש`],
                    ['אופן תשלום', paymentMethodLabel(data.payment_method)],
                ]
            },
            {
                title: 'ערבויות',
                step: 5,
                fields: [
                    ['ערבון בנקאי', formatNumber(Number(data.monthly_rent) * 3) + ' ₪ (3 חודשי שכירות)'],
                    ['שטר חוב', formatNumber(data.promissory_note) + ' ₪'],
                    ['פיצוי איחור פינוי יומי', formatNumber(data.late_penalty) + ' ₪'],
                    ['ערבים אישיים', data.has_guarantors === 'yes' ? (data.guarantors_details || 'נדרשים') : 'ללא ערבים'],
                ]
            },
        ];

        review.innerHTML = sections.map(s => `
            <div class="form-review-section">
                <h3>${s.title}<a class="edit-link" data-step="${s.step}">ערוך ←</a></h3>
                <dl>
                    ${s.fields.map(([k, v]) => `<dt>${k}</dt><dd${!v ? ' class="muted"' : ''}>${v || '—'}</dd>`).join('')}
                </dl>
            </div>
        `).join('');

        review.querySelectorAll('.edit-link').forEach(a => {
            a.addEventListener('click', e => {
                e.preventDefault();
                goToStep(Number(a.dataset.step));
            });
        });
    }

    function formatDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return formatDateHe(d);
    }

    function getEndDate(startIso, months) {
        if (!startIso || !months) return '—';
        const d = new Date(startIso);
        if (isNaN(d.getTime())) return '—';
        d.setMonth(d.getMonth() + Number(months));
        d.setDate(d.getDate() - 1);
        return formatDateHe(d);
    }

    function paymentMethodLabel(v) {
        return ({
            checks: 'המחאות דחויות',
            bank_transfer: 'הוראת קבע / העברה בנקאית',
            cash: 'מזומן / אחר'
        })[v] || '—';
    }

    // ===== Submit =====
    form.addEventListener('submit', e => {
        e.preventDefault();

        // Validate ALL steps before submission
        let allValid = true;
        for (let i = 1; i <= TOTAL_STEPS; i++) {
            if (!validateStep(i)) {
                goToStep(i);
                allValid = false;
                break;
            }
        }

        const termsAgree = document.getElementById('terms_agree');
        if (!termsAgree.checked) {
            showError(termsAgree.parentElement, 'יש לאשר את התקנון להמשך');
            termsAgree.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (!allValid) return;

        // TODO: in next step, this will:
        // 1. POST data to backend (Cloudflare Worker)
        // 2. Backend creates SUMIT payment link with order ID
        // 3. Redirect user to SUMIT
        // 4. After payment, backend generates DOCX and emails it
        const data = serialize();
        console.log('Form submission (placeholder):', data);

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>טוען מערכת תשלום...</span>';

        // Placeholder: in real flow we'll redirect to SUMIT
        alert('פרטים נשמרו. בשלב הבא נחבר את מערכת התשלום SUMIT.\n\nהמסמך הסופי יישלח אליך במייל לאחר תשלום מוצלח.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'המשך לתשלום <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
    });

    // ===== Init =====
    loadState();
    goToStep(currentStep); // re-apply step display
})();
