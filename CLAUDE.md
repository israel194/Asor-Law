# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

This repo is the public website and "digital products" platform for **Asor & Co. — Attorneys at Law** (עשור ושות׳), a Jerusalem law firm. It contains two distinct deployable units in the same git tree:

1. **Static multilingual marketing site** (root). Vanilla HTML/CSS/JS, RTL-first Hebrew, hosted on GitHub Pages at `www.asor-law.com` (see `CNAME`, `.nojekyll`).
2. **Cloudflare Worker backend** (`worker/`). Hono app that powers the paid products under `/digital/` — payment intake, document generation, email, and AI legal intake chat.

The static site and the Worker are deployed independently. Frontend pages under `/digital/` call the Worker over CORS.

## Common commands

### Static site (root)

```bash
node build.js          # Render template.html × lang/{he,en,ar}.json → {he,en,ar}/index.html
npx serve .            # Local preview (any static server works; site uses absolute paths from /)
```

There is no test suite, no linter, no package.json at the root — `build.js` is plain Node (no deps).

### Worker (`worker/`)

```bash
cd worker
npm install
npx wrangler dev       # Local dev on http://localhost:8787
npm run deploy         # = wrangler deploy
npm run tail           # = wrangler tail (live production logs)

# One-time setup:
npx wrangler login
npx wrangler kv namespace create ORDERS_KV
npx wrangler kv namespace create ORDERS_KV --preview   # paste IDs into wrangler.toml
npx wrangler secret put SUMIT_COMPANY_ID
npx wrangler secret put SUMIT_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY              # for /api/intake/chat
```

Worker has no test suite either. `worker/README.md` has the full setup walkthrough.

## Architecture

### Static-site build pipeline

The three localized homepages (`he/index.html`, `en/index.html`, `ar/index.html`) are **generated artifacts** — never edit them directly. The pipeline is:

```
template.html  +  lang/<locale>.json  →  build.js  →  <locale>/index.html
```

- `template.html` contains all markup with `{{section.key}}` and `{{key}}` placeholders.
- `lang/he.json`, `lang/en.json`, `lang/ar.json` provide the translations + per-locale meta/SEO/schema.org JSON-LD.
- `build.js` also rewrites the `{{lang_switcher_<lang>_active}}` markers so the correct language link gets the `active` class.
- Hebrew is the canonical/default language. The root `index.html` is a 0-second meta-refresh redirect to `/he/`.

When changing copy, layout, or SEO metadata: edit `template.html` and/or `lang/*.json`, then run `node build.js`. The `he/topics/`, `he/articles/`, and `digital/` HTML files are hand-authored and **not** templated.

### Site structure (URL → source)

| URL                          | Source                                                       |
|------------------------------|--------------------------------------------------------------|
| `/he/`, `/en/`, `/ar/`       | Generated from `template.html` + `lang/*.json`               |
| `/he/topics/*.html`          | Hand-authored Hebrew SEO landing pages (per practice topic)  |
| `/he/articles/*.html`        | Hand-authored Hebrew long-form articles                      |
| `/{he,en,ar}/{privacy,terms}.html` | Hand-authored legal pages                              |
| `/digital/`                  | Hand-authored marketing page for the paid products platform  |
| `/digital/<product>/form.html` | Multi-step intake form per product                         |
| `/digital/<product>/success.html` | Post-payment landing page (calls Worker)                |
| `/css/style.css`, `/js/main.js` | Shared site styles + interactivity                        |
| `/digital/styles.css`, `/digital/_chrome.js` | Digital platform styles + chrome             |

The brand spec (colors `#1B3A5C` navy / `#C5A55A` gold, typography, sections) lives in `DESIGN.md`. Practice-area copy and project list also live there.

### Worker (`worker/src/`)

Hono app exposing JSON endpoints under `/api/*` plus `/healthz`. Single binding to a KV namespace `ORDERS_KV` (orders + generated PDFs) and a `BROWSER` binding (Cloudflare Browser Rendering, Workers Paid plan required).

```
worker/src/
  index.js               Hono app + all routes
  sumit.js               SUMIT API client (beginredirect → hosted payment page)
  email.js               Resend HTTP client (with base64 attachment support)
  intake.js              Claude Sonnet 4.6 client for the AI legal intake chat
  products/
    index.js             Product registry (getProduct / listProducts)
    vat.js               VAT_RATE = 0.18 + withVat() helper
    rental-agreement.js          Type A — generates PDF via Browser Rendering
    rental-agreement-html.js     HTML template for the rental agreement PDF
    cautionary-note.js           Type B — attorney-handled, no deliverable
    mortgage-registration.js     Type B
    sale-registration.js         Type B
```

#### Order lifecycle (the central flow)

1. Browser POSTs form payload to `/api/rental/create-payment` (legacy alias) or the generic `/api/products/:productId/create-payment`.
2. Worker validates required fields per product, generates a UUID `orderId`, persists `{ status: "pending_payment", payload, ... }` to KV under that key, then calls SUMIT to create a hosted payment page. Returns `{ orderId, redirectUrl }`.
3. Browser redirects to SUMIT. After payment, SUMIT redirects to `/digital/<product>/success.html?orderId=<id>`.
4. The success page POSTs to `/api/rental/payment-callback?orderId=...` (or `/api/orders/:id/payment-callback`).
5. `processPaidOrder()` (in `index.js`):
   - Marks the order `paid` in KV.
   - For Type A products only: calls `product.generateCustomerDeliverable(order, env)` → produces a PDF via `@cloudflare/puppeteer` against the `BROWSER` binding, stores the bytes at KV key `pdf:<orderId>` with metadata.
   - Sends an office notification email to `OFFICE_EMAIL` (with PDF attached for Type A).
   - Sends a customer confirmation email (with PDF attached for Type A).
6. Customer can re-download via `GET /api/orders/:id/document` or re-send to a different address via `POST /api/orders/:id/share/email`.

KV layout: `<orderId>` → order JSON; `pdf:<orderId>` → PDF bytes + metadata; `consultation:<id>` → consultation lead.

#### Product registry conventions

Each product module in `worker/src/products/` exports:

- `id` (slug; **must match** the directory under `/digital/<id>/`)
- `name` (Hebrew display name)
- `priceBeforeVat` (the headline price — what the marketing UI shows)
- `priceIls` (actual charge — `withVat(priceBeforeVat)`, since VAT in Israel is 18%)
- `requiredFields` (array of payload keys the API validates)
- `formatOfficeEmail(order)` and `formatCustomerEmail(order)` → `{ subject, html, text }`
- **Type A only:** `generateCustomerDeliverable(order, env)` → `{ filename, content, contentType }`

Type B products (attorney-handled intake) intentionally omit `generateCustomerDeliverable`; `processPaidOrder` skips the PDF step when it is missing.

To add a new product: drop a module in `worker/src/products/`, add it to the `PRODUCTS` map in `products/index.js`, and create matching `/digital/<id>/form.html` + `/digital/<id>/success.html`. Use the generic `/api/products/:productId/create-payment` endpoint — only `rental-agreement` has the legacy `/api/rental/...` aliases.

#### AI intake chat

`POST /api/intake/chat` proxies a multi-turn conversation to Claude Sonnet 4.6 (`claude-sonnet-4-6`) using `ANTHROPIC_API_KEY`. The Hebrew system prompt in `intake.js` is sent with `cache_control: { type: "ephemeral" }` so subsequent turns hit the prompt cache. The endpoint caps history at 20 messages × 4000 chars each, and rejects more than 30 messages outright.

### Frontend ↔ Worker wiring

Each digital form (e.g. `digital/rental-agreement/form.js`) auto-detects the API base:

```js
location.hostname === 'localhost' || '127.0.0.1'
  ? 'http://localhost:8787'                                // matches `wrangler dev`
  : 'https://asor-digital-api.israel-486.workers.dev'      // production worker
```

Override at runtime via `localStorage.setItem('asor-api-base', '<url>')` in DevTools.

CORS is enforced server-side from `CORS_ORIGINS` in `wrangler.toml` (currently `asor-law.com`, `www.asor-law.com`, `localhost:8080`). Add new origins there if serving the static site from a new host.

Forms persist their multi-step state to `localStorage` under per-form keys (e.g. `asor-rental-form-v1`) so users can resume.

## Conventions and gotchas

- **Don't hand-edit `{he,en,ar}/index.html`.** They get overwritten by `node build.js`. Edit `template.html` + `lang/*.json` instead.
- **RTL is the default.** Hebrew (`dir="rtl"`) is canonical; English/Arabic mirror the same template. Layout/CSS must work in RTL first.
- **Israeli VAT = 18%.** Always price products via `withVat(priceBeforeVat)`. Headline marketing prices are pre-VAT (`499 ₪ + מע"מ`); the actual charge sent to SUMIT is the post-VAT figure.
- **Persist before redirecting to a payment provider.** The KV write must succeed before calling SUMIT — otherwise a paid customer can have no record. The current code does this; preserve it when refactoring.
- **PDF generation requires Workers Paid.** The `BROWSER` binding (Cloudflare Browser Rendering) is not on the free plan. Local `wrangler dev` will need `--remote` to use it.
- **Sending domain must be verified in Resend.** Until `asor-law.com` is verified at https://resend.com/domains, outgoing email only delivers to the Resend account owner.
- **Sitemap is hand-maintained** (`sitemap.xml`). Add new `/he/topics/*.html` or `/he/articles/*.html` entries when authoring new content.
- **Secrets:** never put SUMIT/Resend/Anthropic keys in `wrangler.toml` — only via `wrangler secret put`. `.env.example` at the root is a placeholder for any future root-level scripts; the live secrets all live in the Worker.
- **`/digital/` is currently `noindex, nofollow`** (search for `<meta name="robots"` in `digital/index.html`) — remove that meta tag before public launch.
- **`templates/` is gitignored.** Firm-internal contract templates are kept locally and must not be committed.
