# Campaign Protection & Monthly Usage Setup

## 1. Apply the Supabase migration

Open the Supabase SQL Editor for the MrSa WhatsApp Blaster project and run:

`supabase/migrations/202611260005_campaign_protection_usage.sql`

This creates the monthly usage ledger, secure atomic quota reservation functions, and optional plan-limit fields.

## 2. Existing plan behaviour

- Existing UPI billing remains ₹299 for 30 days.
- Razorpay checkout is not enabled or changed.
- Existing workspaces have no monthly message cap by default (`monthly_message_limit = NULL`).
- Usage is still recorded, and the Campaigns page displays monthly attempts, accepted messages and failed attempts.
- No existing customer is blocked until a monthly cap is explicitly configured.

## 3. Configure a monthly cap when plan limits are finalized

After deciding the included monthly message allowance, an administrator can set it for a workspace in the Supabase SQL Editor:

```sql
update public.workspace_subscriptions
set monthly_message_limit = 1000,
    updated_at = now()
where workspace_id = '<WORKSPACE_UUID>';
```

Replace `1000` with the agreed plan allowance and `<WORKSPACE_UUID>` with the workspace UUID. This example is not applied automatically.

To return a workspace to uncapped usage:

```sql
update public.workspace_subscriptions
set monthly_message_limit = null,
    updated_at = now()
where workspace_id = '<WORKSPACE_UUID>';
```

## 4. Protection included

- Normalizes phone numbers before sending and excludes duplicate recipients.
- Checks the current recorded opt-in, consent evidence and Meta-approved template before sending.
- Enforces the existing 1–50 unique-recipient campaign limit.
- Reserves monthly quota atomically before live or scheduled sends, preventing concurrent campaigns from exceeding a configured cap.
- Records accepted and failed attempts in a workspace-scoped UTC calendar-month ledger.
- If the quota check is unavailable, live sending fails closed: no messages are sent.

## 5. Validation

GitHub Actions runs JavaScript syntax checks for the send API and scheduler Worker, followed by the production Vite build.
