# MrSa WhatsApp Blaster

A consent-first WhatsApp campaign management platform by **MrSa Solutions**.

## Chosen production architecture

The production deployment target is **GitHub + Cloudflare + Supabase**. Render is not part of the deployment plan.

| Service | Responsibility |
| --- | --- |
| GitHub | Source control, main branch and deployment source |
| Cloudflare Pages | React/Vite frontend hosting and Git-connected deployments |
| Cloudflare Workers / Pages Functions | Server-side API, Razorpay order and webhook handling, protected secrets |
| Supabase | PostgreSQL database, Supabase Auth, user/workspace data, trial and subscription records, Row Level Security |
| Razorpay | ₹299/month subscription checkout and payment processing |
| WhatsApp Cloud API | Official WhatsApp Business messaging integration (separate credentials and approval required) |

### Request flow

```text
GitHub main
   | automatic build/deploy
   v
Cloudflare Pages (React frontend)
   | /api/* requests
   v
Cloudflare Pages Functions / Workers
   | Supabase client with user JWT / server-side secrets
   v
Supabase Auth + PostgreSQL (RLS)
   |
   +---- Razorpay API + signed webhook
   |
   +---- WhatsApp Cloud API (after integration)
```

## Important current implementation status

The current repository still contains a **legacy Express + Node.js + direct PostgreSQL (`pg`) backend** under `server/`. It is not yet migrated to Cloudflare Workers/Pages Functions. Do not deploy that Express server as if it were a Cloudflare Worker, and do not configure Render.

The existing React UI uses the legacy API routes in `src/AuthGate.jsx` and `src/Billing.jsx`. These need to be migrated to Supabase Auth and the new Cloudflare API endpoints. The existing contacts UI currently stores demo contacts in browser local storage; persistent workspace-scoped contacts and campaigns remain to be implemented.

The earlier Supabase Publishable Key and Project URL are not enough to connect the legacy `pg` backend. For the selected architecture, the browser may use the Supabase Project URL and Publishable Key with Supabase Auth and RLS enabled. Secret/service-role keys must remain server-side and must never be exposed in `VITE_` variables.

## Supabase project setup

1. In Supabase, open **Project Settings → API Keys** (or the API section shown in your dashboard) and use the **Project URL** and **Publishable key** for the browser Supabase client.
2. In Supabase **Authentication → URL Configuration**, configure the Cloudflare production URL and local development redirect URLs.
3. Create the application schema and enable Row Level Security on every user/workspace-owned table.
4. Create policies that scope data to the authenticated user's workspace. Never rely on frontend checks alone for authorization.
5. Keep the Supabase Secret key / legacy service_role key private. Use it only in Cloudflare server-side secrets when a privileged server operation genuinely requires it; prefer user-scoped Supabase clients and RLS.

The API URL ending in `/rest/v1/` is the REST endpoint, not the base Project URL. The base URL is `https://<project-ref>.supabase.co`.

## Cloudflare deployment target

For the React/Vite frontend, connect the GitHub repository to Cloudflare Pages with:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`

The API migration should use Cloudflare Pages Functions (the `functions/` directory) or a separate Cloudflare Worker. Store server-only credentials using Cloudflare secrets/environment bindings, not committed files. Add the API routes and configure Supabase Auth/RLS before directing production traffic to the new backend.

Do not mark the application production-ready until the Pages build, API routes, authentication, RLS isolation, trial expiry, Razorpay signature/webhook handling, and end-to-end payment flow have all been tested.

## Product requirements

- Platform Super Admin and workspace Admin/User roles.
- User registration and login.
- 30-day free trial per new workspace.
- Trial expiry and subscription access enforcement on the server.
- Starter subscription: **₹299/month**.
- Razorpay checkout, payment verification, webhook processing and payment history.
- User dashboard, workspace-scoped contact management, consent status, campaigns, templates and message history.
- Official WhatsApp Business Platform / Cloud API integration, with opt-in and opt-out enforcement.

## Subscription and payment notes

The existing legacy backend contains initial ₹299 order creation, signature verification and webhook code, but it is not yet migrated to Cloudflare. The intended first release uses a manual monthly checkout and 30-day entitlement after verified payment; automatic recurring debit is a separate Razorpay Subscriptions integration and must not be claimed as enabled.

Razorpay secrets and webhook secrets must be stored only as Cloudflare server-side secrets. Configure a webhook URL on the deployed Cloudflare API and verify the webhook signature against the raw request body. Test in Razorpay Test Mode before enabling Live Mode.

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run dev
npm run build
```

The current `npm run dev:server` and `npm start` scripts launch the legacy Express backend for local compatibility only. They are not the Cloudflare production API. The frontend currently still calls that legacy API until the Supabase/Cloudflare migration is completed.

## Security checklist

- Never commit `.env` files, database passwords, Supabase Secret/service_role keys, Razorpay secrets, WhatsApp access tokens, or webhook secrets.
- Never expose privileged credentials in `VITE_` variables.
- Enable and test Supabase RLS for every private table.
- Verify authorization and workspace ownership in server-side code.
- Use HTTPS, rate limiting, input validation, audit logs and safe error messages.
- Verify Razorpay payment signatures and webhook signatures server-side.
- Use only the official WhatsApp Business Platform / Cloud API and honor opt-outs and approved template rules.