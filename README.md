# MrSa WhatsApp Blaster

A consent-first WhatsApp campaign management platform by **MrSa Solutions**.

## Subscription configuration

- 30-day free trial for each newly registered workspace.
- Starter plan: **₹299 per month** (29,900 paise).
- Razorpay order creation, signature verification, webhook verification and payment history API are included.
- A verified successful payment activates the workspace for 30 days.
- This milestone implements a **manual monthly renewal checkout**, not an automatic recurring mandate. Auto-debit subscriptions, reminders, refunds, invoices and tax documents are not included yet.

## Payment setup (Razorpay)

1. Create or use a Razorpay account and obtain API credentials.
2. Copy `server/.env.example` to `server/.env`.
3. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and a separate `RAZORPAY_WEBHOOK_SECRET`. Keep all three server-side only.
4. In Razorpay Dashboard, configure a webhook pointing to `https://YOUR_API_HOST/api/webhooks/razorpay`, with the same webhook secret. Subscribe to `payment.captured`, `order.paid` and `payment.failed`.
5. Use Test Mode credentials and test payments first. Switch to Live Mode only after deployment uses HTTPS, webhook delivery is verified, and end-to-end tests pass.

The checkout UI must load Razorpay Checkout using the public Key ID returned by the server. Do not expose the Key Secret or webhook secret in frontend environment variables.

## Authentication and roles

- Email/password registration and login.
- Workspace Admin and Workspace User roles, plus platform Super Admin.
- Passwords are bcrypt-hashed; API sessions use signed JWTs.
- Super Admin bootstrap: `npm run create:superadmin`.

## Important deployment status

The backend requires PostgreSQL and server environment variables. This repository change does not deploy the API, configure a database, configure the Razorpay dashboard/webhook, or prove a live payment. Payment activation is therefore **not live until the deployment and Razorpay setup steps above are completed**.

The existing contacts UI still uses browser-local demo storage; workspace-scoped contacts, campaigns, official WhatsApp Cloud API integration, and enforcement of subscription access across every paid feature remain future work. Do not use this app to message people without valid WhatsApp opt-in.

## Local development

Requirements: Node.js 20+ and PostgreSQL 14+.

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
