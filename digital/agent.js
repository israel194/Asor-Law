/**
 * Frontend module for the AI intake agent.
 * Stateless multi-turn chat — full message history is POSTed to the Worker
 * on each turn (kept short by MAX_HISTORY in worker/src/agent.js).
 */
(function() {
    'use strict';

    const root = document.getElementById('agentChat');
    if (!root) return;

    // Worker base URL is read from data-api on the chat root.
    // Falls back to localhost for `wrangler dev` previews.
    const API_BASE = root.dataset.api || 'http://localhost:8787';
    const ENDPOINT = API_BASE.replace(/\/+$/, '') + '/api/agent/chat';

    const thread = root.querySelector('.agent-thread');
    const form = root.querySelector('.agent-form');
    const input = root.querySelector('.agent-input');
    const sendBtn = root.querySelector('.agent-send');
    const intro = root.querySelector('.agent-intro');

    // ===== State =====
    /** @type {Array<{role: 'user'|'assistant', content: string}>} */
    const history = [];
    let busy = false;

    // ===== Rendering =====
    function appendBubble(role, text) {
        const bubble = document.createElement('div');
        bubble.className = 'agent-bubble agent-bubble-' + role;
        bubble.textContent = text;
        thread.appendChild(bubble);
        thread.scrollTop = thread.scrollHeight;
        return bubble;
    }

    function appendTyping() {
        const el = document.createElement('div');
        el.className = 'agent-bubble agent-bubble-assistant agent-typing';
        el.innerHTML = '<span></span><span></span><span></span>';
        thread.appendChild(el);
        thread.scrollTop = thread.scrollHeight;
        return el;
    }

    function appendRecommendation(product, referToOffice) {
        const card = document.createElement('div');
        card.className = 'agent-rec';

        if (referToOffice && !product) {
            card.innerHTML = `
                <div class="agent-rec-eyebrow">המקרה שלך מצריך טיפול אישי</div>
                <h4>צרו קשר ישיר עם המשרד</h4>
                <p>המקרה שתיארת מורכב יותר ממה שמתאים למוצר דיגיטלי סטנדרטי. עורכי הדין שלנו יוכלו לעזור.</p>
                <div class="agent-rec-cta">
                    <a href="tel:0546302880" class="agent-rec-btn primary">חייגו 054-6302880</a>
                    <a href="mailto:office@asor-law.com" class="agent-rec-btn ghost">שלחו מייל</a>
                </div>`;
            thread.appendChild(card);
            thread.scrollTop = thread.scrollHeight;
            return;
        }

        if (!product) return;

        const isActive = product.status === 'active';
        const priceLine = isActive
            ? `<div class="agent-rec-price">₪${product.price_ils}<small> כולל מע״מ</small></div>`
            : `<div class="agent-rec-price agent-rec-soon">בקרוב</div>`;
        const ctaLabel = isActive ? 'פרטים והתחלה' : 'יצירת קשר עם המשרד';
        const ctaHref = isActive ? product.url : 'mailto:office@asor-law.com?subject=' + encodeURIComponent('פנייה: ' + product.title);

        card.innerHTML = `
            <div class="agent-rec-eyebrow">המוצר שמתאים לך</div>
            <span class="agent-rec-tag">${product.category}</span>
            <h4>${product.title}</h4>
            <p>${product.description}</p>
            <div class="agent-rec-footer">
                ${priceLine}
                <a href="${ctaHref}" class="agent-rec-btn primary">${ctaLabel}</a>
            </div>`;
        thread.appendChild(card);
        thread.scrollTop = thread.scrollHeight;
    }

    function showError(msg) {
        const el = document.createElement('div');
        el.className = 'agent-error';
        el.textContent = msg;
        thread.appendChild(el);
        thread.scrollTop = thread.scrollHeight;
    }

    // ===== Network =====
    async function callAgent(messages) {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
    }

    // ===== Send flow =====
    async function send(text) {
        if (busy || !text) return;
        busy = true;
        sendBtn.disabled = true;
        input.disabled = true;

        if (intro) intro.classList.add('agent-intro-hidden');

        appendBubble('user', text);
        history.push({ role: 'user', content: text });

        const typing = appendTyping();

        try {
            const data = await callAgent(history);
            typing.remove();

            appendBubble('assistant', data.reply);
            history.push({ role: 'assistant', content: data.reply });

            if (data.recommended_product || data.refer_to_office) {
                appendRecommendation(data.recommended_product, data.refer_to_office);
                // GA4: track that the agent surfaced a product (or referred to office)
                if (typeof window.gtag === 'function') {
                    if (data.recommended_product) {
                        window.gtag('event', 'view_item', {
                            item_id: data.recommended_product.id,
                            item_name: data.recommended_product.title,
                            item_category: data.recommended_product.category,
                            recommendation_source: 'ai_agent'
                        });
                    } else if (data.refer_to_office) {
                        window.gtag('event', 'agent_referral', { destination: 'office' });
                    }
                }
            }
        } catch (err) {
            typing.remove();
            showError('לא הצלחנו לקבל תגובה. נסו שוב, או צרו קשר ישירות: 054-6302880.');
            // Rewind: drop the user message we just pushed so retry works on the same turn
            history.pop();
            console.error(err);
        } finally {
            busy = false;
            sendBtn.disabled = false;
            input.disabled = false;
            input.value = '';
            input.style.height = 'auto';
            input.focus();
        }
    }

    // ===== Wire up =====
    form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim();
        send(text);
    });

    // Submit on Enter; newline on Shift+Enter
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            form.requestSubmit();
        }
    });

    // Auto-grow textarea
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });

    // Suggestion chips fill the input
    root.querySelectorAll('[data-suggest]').forEach(btn => {
        btn.addEventListener('click', () => {
            input.value = btn.dataset.suggest;
            input.focus();
            input.dispatchEvent(new Event('input'));
        });
    });
})();
