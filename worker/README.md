# asor-digital-api

Backend Worker (Cloudflare) for the digital products platform at asor-law.com/digital/.

## Setup (one-time)

```bash
cd worker
npm install
npx wrangler login            # opens browser to authorize against your Cloudflare account
npx wrangler secret put SUMIT_COMPANY_ID
npx wrangler secret put SUMIT_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY     # for the AI intake agent
```

## Deploy

```bash
npm run deploy
```

The worker will be live at `https://asor-digital-api.<your-cf-subdomain>.workers.dev`.
Custom domain (e.g. `api.asor-law.com`) can be wired in the Cloudflare dashboard later.

## Endpoints

- `POST /api/rental/create-payment` — body: `{ tenant_name, tenant_email, tenant_phone, ... }`
  Returns: `{ orderId, redirectUrl }` — frontend redirects user to `redirectUrl` for payment.

- `POST /api/agent/chat` — body: `{ messages: [{ role: "user"|"assistant", content: string }, ...] }`
  Stateless multi-turn chat with an Anthropic-backed intake agent (`claude-sonnet-4-6`).
  Returns: `{ reply, case_summary, recommended_product, needs_more_info, refer_to_office, usage }`.
  See `src/agent.js` and `src/products.js`. Requires `ANTHROPIC_API_KEY` secret.

- `GET /healthz` — liveness.

## Local dev

```bash
npx wrangler dev
```

Local URL: `http://localhost:8787`. Needs the same secrets configured (`wrangler secret put`).
