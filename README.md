# MrSa WhatsApp Blaster

A consent-first WhatsApp Business campaign workspace by **MrSa Solutions**.

## Production architecture

| Service | Responsibility |
| --- | --- |
| GitHub | Source control and deployment source |
| Cloudflare Pages | React/Vite frontend and Pages Functions API |
| Supabase | Authentication, PostgreSQL workspace data, contacts, consent and message logs |
| Meta WhatsApp Cloud API | Approved-template messaging and delivery-status webhooks (currently blocked by the ₹0 sending lock) |
| Render (free web service) | Separate Puppeteer browser-session prototype for manual browser monitoring |
| UPI | Manual ₹299 subscription payment; access is extended only after bank-credit verification |

Production deployment target: **Cloudflare Pages**, with the GitHub `main` branch, build command `npm run build`, and output directory `dist`. The legacy Express files/scripts remain in the repository for local compatibility; they are not the production Pages Functions API.

## Current workspace features

- Supabase Auth and workspace-scoped access.
- Contact creation, editing, search, group filters, CSV import/export and selected-contact export.
- Consent evidence fields: original opt-in date, source, evidence and scope (Marketing, Utility or All).
- Opt-out recording; pending and opted-out contacts are excluded from sending.
- Live sync of approved WhatsApp templates from Meta. Meta remains the source of truth for template creation and approval; there is no duplicate standalone template editor.
- Campaign draft creation (drafts are stored in the current browser only).
- Live approved-template sending, with server-side workspace-admin, subscription, template-category and per-contact consent checks. A send request is limited to 50 recipients.
- Recipient-level send results, webhook-backed Accepted / Delivered / Read / Failed status, Meta error details and CSV export.
- Manual retry of failed recipients from the latest send. The same template is reused and the server checks current consent and subscription again before retrying.
- Reports for consent and WhatsApp message delivery; report totals are limited to the latest 1,000 stored message records.
- Manual UPI billing and admin payment review.

**Status wording matters:** “Accepted by Meta” means Meta accepted the API request; it does not prove delivery. Delivered and Read require the corresponding Meta webhook status.

## Cloudflare Pages build settings

- Framework preset: Vite
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: 20+

GitHub Actions is configured to run `npm install` and `npm run build` for pull requests and pushes to `main`.

## Environment variables and secrets

### Cloudflare Pages build variables

- `VITE_SUPABASE_URL` — Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable/anon key.

### Cloudflare Pages server-side secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `BROWSER_SERVICE_URL` — HTTPS base URL of the separately deployed Puppeteer service.
- `BROWSER_SERVICE_TOKEN` — secret bearer token shared only between Cloudflare Pages Functions and the Puppeteer service.
- `WHATSAPP_API_VERSION` (optional; defaults to `v27.0`)

Keep service-role keys, Meta access tokens, App Secrets and webhook verify tokens as encrypted server-side secrets. Never put them in frontend code, `VITE_` variables, Git commits, screenshots or chat messages.

## WhatsApp API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/whatsapp/status?workspaceId=...` | Verify server configuration and Meta phone-number connection |
| GET | `/api/whatsapp/templates?workspaceId=...` | Retrieve templates from the configured WABA |
| POST | `/api/whatsapp/send` | Send an approved template to up to 50 eligible contacts |
| GET | `/api/whatsapp/webhook` | Meta webhook verification |
| POST | `/api/whatsapp/webhook` | Verify Meta signature and persist message status updates |

Configure the Meta callback URL as:

```
https://<your-cloudflare-pages-domain>/api/whatsapp/webhook
```

Use the same value for the Meta verify token and `WHATSAPP_VERIFY_TOKEN`. Subscribe the Meta app to the WhatsApp `messages` webhook field. Production webhook events require the Meta app to be published and correctly subscribed. A browser-side send result alone cannot provide Delivered or Read confirmation.

## Online Puppeteer browser service (development branch)

The separate `browser-service/` Node.js service can be deployed as a Render free web service using the root `render.yaml` Blueprint. The existing website exposes a **Browser Service** workspace page and same-origin authenticated proxy routes:

- `GET /api/browser/status?workspaceId=...`
- `POST /api/browser/start?workspaceId=...`
- `GET /api/browser/qr?workspaceId=...`
- `POST /api/browser/stop?workspaceId=...`

Only workspace admins can access these routes. The Cloudflare Functions keep `BROWSER_SERVICE_TOKEN` server-side and proxy to the HTTPS Render service. The QR endpoint returns only the QR canvas image, not a screenshot of the user's chats.

**Free-tier warning:** Render free web services spin down after 15 minutes without inbound traffic, take about a minute to wake, and have ephemeral filesystems. A sleep/restart/redeploy can erase the browser profile and require QR sign-in again. Cloud Chromium may also exceed free memory limits. This is a best-effort test setup, not 24/7 hosting.

This service is limited to starting, monitoring and stopping a browser session for manual use. It does not send messages, scrape contacts, or automate bulk messaging. The existing server-side ₹0 outbound-message lock remains unchanged. See [browser-service/README.md](browser-service/README.md) for deployment steps.

## Supabase migrations

The current app expects the existing schema migrations below. Apply them in filename order in Supabase SQL Editor if they have not already been applied:

1. `supabase/migrations/202611200001_initial_workspace_auth.sql`
2. `supabase/migrations/202611200003_manual_upi_billing.sql`
3. `supabase/migrations/202611200004_super_admin_dashboard_rls.sql`
4. `supabase/migrations/202611200005_whatsapp_cloud_api.sql`
5. `supabase/migrations/202611250001_service_role_table_privileges.sql`
6. `supabase/migrations/202611260001_whatsapp_delivery_details.sql`

The full-workspace functionality upgrade in this branch adds **no new database migration**. It uses the existing `whatsapp_message_logs` table and its delivery-detail columns. Do not re-run migrations blindly; first check the Supabase migration history and apply only missing migrations.

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run dev
npm run build
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` for local frontend development. Configure server-side bindings separately when testing Pages Functions with the appropriate Cloudflare development workflow.

## Zero-cost sending lock

Outbound WhatsApp sending is currently **hard-disabled** in `functions/api/whatsapp/send.js` with a server-side ₹0 budget lock. The endpoint returns `ZERO_COST_BUDGET_BLOCKED` before Meta template lookup, monthly quota reservation, or any outbound message request. This is deliberately fail-closed: Meta conversation/template pricing and recipient-country/category rules can change, so the application does not claim that any outbound send is guaranteed free.

The current production architecture documents one outbound send route (`POST /api/whatsapp/send`). Campaign drafts are browser-local and there is no scheduled campaign worker documented in this repository. If a scheduled sender is added later, it must use the same server-side zero-cost guard before it can dispatch messages. This lock does not change Meta billing settings or prevent charges from other applications using the same Meta business account.

## Important limitations

- Campaign drafts are browser-local; they are not shared across devices or team members.
- Campaign send batches are limited to 50 recipients per request.
- Campaign and report screens show the latest 100 and 1,000 message logs respectively, not unlimited lifetime totals.
- Failed-recipient retry is offered for the latest send report stored in the current browser. The server revalidates consent, role and subscription before sending.
- Delivery and read receipts depend on correct Meta webhook configuration and event delivery.
- UPI payment references are not automatically verified. An admin must confirm the actual bank credit before approving a subscription.

## Security and compliance

- Keep Supabase RLS enabled for workspace-owned tables.
- Server-side endpoints verify the signed-in user, workspace Admin role and active trial/subscription before sending.
- Each recipient is checked again for active opt-in, original consent date, source, evidence and matching category.
- Never fabricate or broaden consent evidence. Record opt-outs promptly.
- Use only templates approved by Meta and honor WhatsApp policies and customer preferences.
- Verify a UPI credit in the bank account before approving the submitted UTR.
