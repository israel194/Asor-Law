# asor-digital-api

Backend Worker (Cloudflare) for the digital products platform at asor-law.com/digital/.

## One-time setup

```bash
cd worker
npm install
npx wrangler login            # opens browser to authorize against your Cloudflare account
```

### 1. Create the KV namespace for orders

```bash
npx wrangler kv namespace create ORDERS_KV
npx wrangler kv namespace create ORDERS_KV --preview
```

Each command prints an `id`. Paste them into `wrangler.toml` under `[[kv_namespaces]]`,
replacing `REPLACE_WITH_PRODUCTION_KV_ID` and `REPLACE_WITH_PREVIEW_KV_ID`.

### 2. Configure secrets

```bash
npx wrangler secret put SUMIT_COMPANY_ID
npx wrangler secret put SUMIT_API_KEY
npx wrangler secret put RESEND_API_KEY     # https://resend.com/api-keys
```

### 3. Verify your sending domain in Resend

Until `asor-law.com` is verified at https://resend.com/domains, outgoing email
will only deliver to the address that owns the Resend account. Add the DNS
records Resend supplies before going live.

## Deploy

```bash
npm run deploy
```

The worker will be live at `https://asor-digital-api.<your-cf-subdomain>.workers.dev`.
Custom domain (e.g. `api.asor-law.com`) can be wired in the Cloudflare dashboard later.

## Endpoints

- `POST /api/rental/create-payment` — body: full form payload (landlord/tenant/property/...).
  Persists to `ORDERS_KV` with status `pending_payment`, then returns
  `{ orderId, redirectUrl }` for the browser to redirect to SUMIT.

- `POST /api/rental/payment-callback?orderId=<id>` — called by `success.html`
  after SUMIT redirects back. Marks the order paid and emails office@asor-law.com.

- `GET /api/orders/:id` — minimal public lookup (status + customer name) for the
  success page.

- `GET /healthz` — liveness.

## Architecture

```
worker/src/
  index.js              Hono app + routes
  sumit.js              SUMIT API client (beginredirect → hosted payment page)
  email.js              Resend HTTP client
  products/
    index.js            Product registry
    rental-agreement.js Office-email formatter (PDF generation TBD per product)
```

Each new product registers itself in `products/index.js` and exports
`formatOfficeEmail(order)` and `generateCustomerDeliverable(order, env)` —
the latter is built per-product and may stay `NOT_IMPLEMENTED` while we build
the office-side flow first.

## Local dev

```bash
npx wrangler dev
```

Local URL: `http://localhost:8787`. The frontend (`form.js`, `success.html`)
auto-targets localhost when served from `localhost`/`127.0.0.1`. To override
the API base manually, run in DevTools:

```js
localStorage.setItem('asor-api-base', 'https://asor-digital-api.israel-486.workers.dev');
```
