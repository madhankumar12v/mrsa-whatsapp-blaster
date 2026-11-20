# MrSa WhatsApp Blaster

A consent-first WhatsApp campaign management platform by **MrSa Solutions**.

## Chosen production architecture

The production deployment target is **GitHub + Cloudflare + Supabase**. Render is not part of the deployment plan.

| Service | Responsibility |
| --- | --- |
| GitHub | Source control, main branch and deployment source |
| Cloudflare Pages | React/Vite frontend hosting and Git-connected deployments |
| Cloudflare | React/Vite frontend hosting and Git-connected deployments |
| Supabase | PostgreSQL database, Supabase Auth, user/workspace data, trial and subscription records, Row Level Security |
| UPI | Customer-initiated ₹299 payment; admin verifies the UTR before activation |
| WhatsApp Cloud API | Official WhatsApp Business messaging integration (separate credentials and approval required) |

### Request flow

```text
GitHub main
   | automatic build/deploy
   v
Cloudflare Pages (React frontend)
   | Supabase Auth + database requests
   v
Supabase Auth + PostgreSQL (RLS)
   |
   +---- Manual UPI UTR submission + admin review
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

Do not mark the application production-ready until the Pages build, authentication, RLS isolation, trial expiry, manual UPI approval workflow, and end-to-end payment flow have all been tested.

## Product requirements

- Platform Super Admin and workspace Admin/User roles.
- User registration and login.
- 30-day free trial per new workspace.
- Trial expiry and subscription access enforcement on the server.
- Starter subscription: **₹299/month**.
- Manual UPI payment submission, admin approval and payment history.
- User dashboard, workspace-scoped contact management, consent status, campaigns, templates and message history.
- Official WhatsApp Business Platform / Cloud API integration, with opt-in and opt-out enforcement.

## Subscription and payment notes

The first release uses a manual UPI payment process and grants 30 days of access after an admin verifies the bank credit and approves the submitted UTR. Automatic recurring debit is not enabled.

UPI payments are not verified automatically. A workspace admin must confirm the ₹299 credit in the bank account before approving a submitted UTR. Never activate a subscription based only on a screenshot or a customer-entered reference.

## Local development

Requirements: Node.js 20+.

```bash
npm install
npm run dev
npm run build
```

The current `npm run dev:server` and `npm start` scripts launch the legacy Express backend for local compatibility only. They are not the Cloudflare production API. The frontend currently still calls that legacy API until the Supabase/Cloudflare migration is completed.

## Security checklist

- Never commit `.env` files, database passwords, Supabase Secret/service_role keys, WhatsApp access tokens, or webhook secrets.
- Never expose privileged credentials in `VITE_` variables.
- Enable and test Supabase RLS for every private table.
- Verify authorization and workspace ownership in server-side code.
- Use HTTPS, rate limiting, input validation, audit logs and safe error messages.
- Verify each submitted UPI transaction against the bank account before approving it.
- Use only the official WhatsApp Business Platform / Cloud API and honor opt-outs and approved template rules.

## Supabase Auth migration (initial implementation)

The initial Supabase migration is now present in `supabase/migrations/202611200001_initial_workspace_auth.sql`. It creates profiles, workspaces, workspace memberships, workspace subscriptions and contacts; a trusted `auth.users` trigger creates a workspace Admin and a 30-day Starter trial for each new signup. RLS policies scope workspace and contact access to the signed-in member and block contact access after trial/subscription expiry. The frontend auth gate now uses Supabase Auth instead of the legacy Express login routes.

### Configure the frontend

Set these Cloudflare build environment variables (and the same variables locally in `.env.local`):

- `VITE_SUPABASE_URL` = your Supabase Project URL (without `/rest/v1/`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` = your Supabase Publishable key

Then apply the SQL migration in Supabase SQL Editor. In Supabase Authentication → URL Configuration, add the deployed Cloudflare URL to Site URL / Redirect URLs. If email confirmation is enabled, new users must confirm their email before signing in.

**Not yet migrated:** contacts UI still uses local demo storage; team-user invitation, full platform admin management, Cloudflare API functions and WhatsApp Cloud API are future milestones. Billing uses manual UPI submission and admin approval. Do not treat the app as production-ready until these are implemented and tested.

## Manual UPI billing

The Billing screen uses the UPI ID configured in `src/Billing.jsx`. Customers pay ₹299 through their preferred UPI app, then submit the UPI transaction reference (UTR). The app stores each submission in Supabase. A workspace admin must verify the actual bank credit and approve the request; the database function then extends the workspace subscription by 30 days. UTR submission alone never activates access.

Apply `supabase/migrations/202611200003_manual_upi_billing.sql` in Supabase SQL Editor. No Razorpay or Paytm credentials, webhook, billing Worker, or `VITE_BILLING_API_URL` are required for this manual flow.

After applying the migration, deploy the updated frontend. Test using a small real UPI payment and approve it only after confirming the bank credit. For testing the approval interface without a real customer, use a controlled test workspace and do not grant live subscription time without a verified payment.
