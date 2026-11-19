# MrSa API — authentication and trial milestone

## Requirements
- Node.js 20+
- PostgreSQL 14+

## Setup
1. Create a PostgreSQL database, for example `mrsa_blaster`.
2. Copy `server/.env.example` to `server/.env` and set DATABASE_URL, a unique JWT_SECRET (32+ random characters), CORS_ORIGIN and the Super Admin credentials.
3. From the repository root run `npm install`.
4. Run the SQL schema once with `psql "$DATABASE_URL" -f server/schema.sql`, or start the API (it applies the schema automatically).
5. Run `npm run create:superadmin` to create the platform Super Admin account.
6. Run `npm run dev:server` and, in another terminal, `npm run dev`.

Never commit .env files. Use HTTPS and a strong unique secret in production.

## API
- `POST /api/auth/register` — creates a workspace and its first Admin; trial starts immediately and lasts 30 days.
- `POST /api/auth/login` — email/password login.
- `GET /api/auth/me` — authenticated user and workspace/trial details.
- `POST /api/users` — workspace Admin creates an Admin or User.
- `GET /api/admin/workspaces` — Super Admin lists all workspaces.

Passwords are bcrypt-hashed. Sessions are signed JWTs (12-hour expiry). Auth endpoints are rate-limited. User records are scoped to a workspace. The Super Admin is bootstrapped from server environment variables.

## Trial and billing rules
- New workspaces receive a 30-day trial, calculated by PostgreSQL server time.
- Starter plan price is stored as 29,900 paise (₹299/month).
- Expired trials are marked expired at login and surfaced by the dashboard.
- This milestone does **not** collect payments or activate paid subscriptions. Do not manually mark an account paid until a payment provider webhook has verified the payment. Add Razorpay/another provider, signed webhook verification, invoice records and renewal/cancellation handling before taking payments.
- The current contacts screen still uses browser-local demo data. Contact persistence and workspace isolation for contacts/campaigns are a separate backend migration.
