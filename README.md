# MrSa WhatsApp Blaster

A consent-first WhatsApp campaign management platform by **MrSa Solutions**.

## Current milestone — login and trial foundation

- Email/password registration and login screens.
- Workspace creation with the registering customer as Workspace Admin.
- 30-day free trial tracked using PostgreSQL server time.
- Monthly Starter subscription price configured as **₹299/month**.
- Roles: platform Super Admin, Workspace Admin and Workspace User.
- Admin can create additional Admin/User accounts in their workspace.
- JWT sessions, bcrypt password hashing, login rate limiting, security headers and role checks.
- Super Admin bootstrap script and workspace overview endpoint.
- Existing contacts UI remains available after login.

## Important status

This is an implementation foundation, not a production-ready paid SaaS yet. The login and trial API require a configured PostgreSQL database and server environment. The trial expiry is displayed and the workspace is marked expired at login, but payment collection, payment webhook verification, automated renewal, invoice handling and subscription activation are **not implemented**. No customer should be charged until those are completed and tested.

The contacts module still uses browser-local demo storage and is not yet isolated per workspace in the database. Campaign sending and WhatsApp Cloud API integration are not implemented.

## Run locally

Requirements: Node.js 20+ and PostgreSQL 14+.

1. Create a PostgreSQL database named `mrsa_blaster`.
2. Copy `server/.env.example` to `server/.env`. Set `DATABASE_URL`, a unique random `JWT_SECRET` (32+ characters), `CORS_ORIGIN`, and private Super Admin credentials.
3. From the repository root:

```bash
npm install
npm run dev:server
```

4. In another terminal, create the platform Super Admin:

```bash
npm run create:superadmin
```

5. Start the frontend:

```bash
npm run dev
```

The API listens on port 4000 by default; Vite runs on port 5173. The frontend reads `VITE_API_BASE_URL` from the root `.env` file (copy the root `.env.example` to `.env` if needed).

## Roles

- **Super Admin:** MrSa Solutions platform operator; can list all workspaces.
- **Workspace Admin:** customer account owner; can create additional Admin and User accounts in their workspace.
- **Workspace User:** team member; login role is available, while fine-grained feature permissions will be added with the next modules.

## Trial and pricing

- Each newly registered workspace gets a 30-day trial from registration.
- Starter list price: **₹299 per month** (stored as 29,900 paise).
- Trial expiry is calculated on the server, not from the customer's browser clock.
- Expired trial status is shown after login. Payment is not currently collected.
- Before taking payments, implement a payment provider such as Razorpay, verify signed server-to-server webhooks, record payment IDs/invoices, handle failed payments and renewals, and only then activate paid subscriptions.

## Security and WhatsApp compliance

- Never commit `.env` files or expose JWT/database/payment/WhatsApp secrets in frontend variables.
- Use HTTPS, strong unique production secrets, backups and database access restrictions.
- Add password reset, email verification, MFA option, audit logs, session revocation and account recovery before broad production use.
- Use only the official WhatsApp Business Platform / Cloud API.
- Importing a phone number is not WhatsApp consent. Respect opt-ins, opt-outs and approved template rules.

## Project structure

```text
server/
  auth.js
  db.js
  index.js
  schema.sql
  create-super-admin.js
src/
  App.jsx
  AuthGate.jsx
  auth.css
  main.jsx
  styles.css
```

## License

Proprietary project for MrSa Solutions.
