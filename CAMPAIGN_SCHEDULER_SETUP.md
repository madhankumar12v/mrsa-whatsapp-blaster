# MrSa Campaign Scheduler Setup

Campaign drafts and campaign history are stored in Supabase. The scheduled dispatcher is a separate Cloudflare Worker because the existing site is deployed as Cloudflare Pages and Pages does not run Cron Triggers.

## 1. Apply the Supabase migration

Open the Supabase project SQL Editor and run the contents of:

`supabase/migrations/202611260003_campaign_scheduling_history.sql`

This adds scheduling fields to `campaign_drafts` and creates the workspace-protected `campaign_runs` history table. Keep the existing `campaign_drafts` migration applied first.

## 2. Deploy the scheduled Worker

From the repository root:

```bash
cd workers/campaign-scheduler
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npx wrangler secret put WHATSAPP_BUSINESS_ACCOUNT_ID
npx wrangler deploy
```

For each prompt, enter the corresponding value already used by the MrSa WhatsApp Cloud API / Supabase project. Do not put secret values in source control. The Worker uses a one-minute Cron Trigger from `wrangler.toml`. Optional: set `WHATSAPP_API_VERSION` if the project uses a version other than the Worker default.

## 3. Schedule a campaign

In MrSa Blaster > Campaigns:
1. Sync Meta templates and select an approved template.
2. Enter a campaign name and message draft.
3. Select a future local date and time.
4. Choose **Schedule campaign**.

The schedule saves the selected template and the current eligible contact IDs. At execution time the Worker checks the creator's admin membership, workspace subscription, template approval, and each recipient's current opt-in and category. Only up to 50 recipients are supported per scheduled campaign, matching the existing live-send limit.

## Notes

- Apply the Supabase migration before using campaign scheduling or history.
- The Worker is a separate deployment; deploying the Pages site alone does not activate automatic sending.
- A campaign draft's free-text message is retained for editing/reference. WhatsApp delivery uses the selected approved Meta template and its parameters.
- Campaign history records campaign-level accepted/failed totals. Per-recipient delivery confirmation remains in `whatsapp_message_logs` and Meta webhook updates.
- A schedule may be marked failed if the workspace subscription is inactive, the creator is no longer an admin, the template is no longer approved, or consent is no longer valid.
