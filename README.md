# MrSa WhatsApp Blaster

A consent-first WhatsApp campaign management platform by **MrSa Solutions**.

## Database setup (Supabase PostgreSQL)

The existing backend uses the Node.js `pg` driver and its own API authentication. Supabase is used as the hosted PostgreSQL database; do not add the Supabase Publishable Key to the frontend for this architecture.

1. In Supabase, open the project and select **Connect**.
2. Choose **Session pooler** and copy the PostgreSQL connection string. Use the session pooler for a long-running Node.js server on Render; do not use the REST API URL ending in `/rest/v1/`.
3. In Render, open the MrSa WhatsApp Blaster web service and add these environment variables:
   - `DATABASE_URL`: the complete Session pooler connection string from Supabase. Replace its password placeholder with your database password.
   - `DATABASE_SSL`: `true`
   - `JWT_SECRET`: a unique random secret of at least 32 characters.
   - `CORS_ORIGIN`: the exact deployed frontend origin, including `https://`, if frontend and API are hosted separately.
4. Keep the database password and JWT secret server-side. Never put them in a `VITE_` variable or commit them to GitHub.
5. Deploy/restart the Render service. On startup, `server/db.js` runs `server/schema.sql` to create the required workspace, user and payment tables.

The Supabase Project URL and Publishable Key are not substitutes for `DATABASE_URL`. The Publishable Key is not a database credential. Do not share the database password or any secret key in chat.

For local development, use a local PostgreSQL connection in `server/.env` with `DATABASE_SSL=false`, or use the Supabase Session pooler URI with `DATABASE_SSL=true`. Copy `server/.env.example` to `server/.env` and keep that file untracked.

## Subscription configuration

- 30-day free trial for each newly registered workspace.
- Starter plan: **₹299 per month** (29,900 paise).
- Razorpay order creation, signature verification, webhook verification and payment history API are included.
- A verified successful payment activates the workspace for 30 days.
- This milestone implements a **manual monthly renewal checkout**, not an automatic recurring mandate. Auto-debit subscriptions, reminders, refunds, invoices and tax documents are not included yet.

## Payment setup (Razorpay)

1. Create or use a Razorpay account and obtain API credentials.
2. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and a separate `RAZORPAY_WEBHOOK_SECRET` in Render or `server/.env`. Keep all three server-side only.
3. In Razorpay Dashboard, configure a webhook pointing to `https://YOUR_API_HOST/api/webhooks/razorpay`, with the same webhook secret. Subscribe to `payment.captured`, `order.paid` and `payment.failed`.
4. Use Test Mode credentials and test payments first. Switch to Live Mode only after deployment uses HTTPS, webhook delivery is verified, and end-to-end tests pass.

The checkout UI must load Razorpay Checkout using the public Key ID returned by the server. Do not expose the Key Secret or webhook secret in frontend environment variables.

## Authentication and roles

- Email/password registration and login.
- Workspace Admin and Workspace User roles, plus platform Super Admin.
- Passwords are bcrypt-hashed; API sessions use signed JWTs.
- Super Admin bootstrap: `npm run create:superadmin`.

## Important deployment status

The backend requires PostgreSQL and server environment variables. Supabase database hosting is not connected until the Session pooler URI and database password are added to the Render service environment. This repository change does not configure Render, the Supabase dashboard, or the Razorpay dashboard/webhook, and does not prove a live payment. Payment activation is therefore **not live until those deployment and Razorpay setup steps are completed**.

The existing contacts UI still uses browser-local demo storage; workspace-scoped contacts, campaigns, official WhatsApp Cloud API integration, and enforcement of subscription access across every paid feature remain future work. Do not use this app to message people without valid WhatsApp opt-in.

## Local development

Requirements: Node.js 20+ and PostgreSQL 14+ (local PostgreSQL or a Supabase Session pooler connection).

```bash
npm install
cp server/.env.example server/.env
npm run dev:server
npm run create:superadmin
npm run dev
```

Set `VITE_API_BASE_URL=http://localhost:4000/api` in the root `.env` file. The API defaults to port 4000 and Vite to 5173.

## Security checklist

- Never commit `.env` files or expose private keys in `VITE_` variables.
- Use HTTPS, unique production secrets, database backups and restricted database access.
- Configure Razorpay webhooks and verify their signatures.
- Add password reset, email verification, MFA option, audit logs and session revocation before broad production use.
- Use only the official WhatsApp Business Platform / Cloud API and honor opt-outs and approved template rules.
