# MrSa Cloudflare WhatsApp Web browser prototype

This Worker replaces the Render browser service. It uses Cloudflare Browser Run (Puppeteer) and a Durable Object to coordinate one manual WhatsApp Web session. It does not send messages, scrape contacts, or run unattended campaigns.

## Free-tier safety

Cloudflare Workers Free currently includes 10 Browser Run minutes per day. This Worker applies an 8-minute daily cap, leaving a 2-minute safety margin. The cap is tracked in Durable Object storage and resets at 00:00 UTC. Browser sessions can time out or be terminated by Cloudflare; this is not a 24/7 service.

The remote browser profile is not a durable disk. Do not assume WhatsApp Web login cookies or IndexedDB survive a browser shutdown, Cloudflare release, or session loss. A new QR scan may be required. This prototype is for short manual sessions and technical validation only.

## Deploy

1. From the repository root, run `cd browser-worker && npm install`.
2. In Cloudflare, create a Workers API token with the minimum permissions needed to deploy the Worker and configure Browser Run.
3. Run `npx wrangler secret put BROWSER_SERVICE_TOKEN` inside `browser-worker/` and enter a long random secret. Use the same value as the encrypted `BROWSER_SERVICE_TOKEN` secret in Cloudflare Pages.
4. Run `npx wrangler deploy`.
5. Copy the deployed Worker HTTPS URL into the Pages encrypted secret `BROWSER_SERVICE_URL`.
6. Keep both secrets server-side. Never use a `VITE_` variable for them.

## Routes

- `GET /health` — minimal health response.
- `GET /api/status` — session status and daily usage.
- `POST /api/browser/start` — start WhatsApp Web in a remote browser.
- `GET /api/browser/qr` — private QR PNG, if WhatsApp requests sign-in.
- `POST /api/browser/stop` — close the browser and account usage.

Every route except `/health` requires the shared bearer token. The existing Cloudflare Pages Functions must remain the only browser-facing proxy; they authenticate the Supabase user and verify workspace Admin membership before forwarding requests.

## Safety

- The Worker contains no WhatsApp send implementation.
- The app's existing server-side `ZERO_COST_BUDGET_BLOCKED` guard is not changed.
- QR images are account-session credentials: keep them private and never log or cache them.
- Use only manual, permitted interactions. WhatsApp may restrict accounts for unauthorised automation.
