# WhatsApp Business Platform setup (Cloudflare Pages + Supabase)

This project integrates directly with Meta's WhatsApp Cloud API. It does not use an unofficial WhatsApp Web automation library.

## 1. Apply the Supabase migration

Open Supabase → SQL Editor → New query. Copy and run the complete SQL from:

`supabase/migrations/202611200005_whatsapp_cloud_api.sql`

This adds auditable opt-in fields and a message delivery log table. Do not mark old/demo contacts as opted in unless you have the original permission record.

## 2. Create and configure the Meta app

1. Open https://developers.facebook.com/ and create or select a Meta app for your business.
2. Add the WhatsApp product and complete the WhatsApp Business Account onboarding.
3. Add/verify the business phone number that will send messages.
4. Record the WhatsApp Phone Number ID and WhatsApp Business Account ID (WABA ID).
5. Create a long-lived System User access token for production. Grant the required WhatsApp permissions, including `whatsapp_business_messaging` and `whatsapp_business_management`.
6. Create and get approval for the message templates you intend to send. The campaign endpoint checks that the exact template name and language are approved by Meta before it sends.

Meta's temporary test token is suitable for initial testing only; it may expire.

## 3. Add Cloudflare Pages variables and secrets

Open Cloudflare → Workers & Pages → MrSa Blaster → Settings → Variables and Secrets. Add these for the **Production** environment:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Same project URL as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | Same publishable/anon key as `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — encrypted secret |
| `WHATSAPP_ACCESS_TOKEN` | Meta System User access token — encrypted secret |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Phone Number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta WhatsApp Business Account ID (WABA ID) |
| `WHATSAPP_VERIFY_TOKEN` | Your own long random string — encrypted secret |
| `META_APP_SECRET` | Meta app secret — encrypted secret |
| `WHATSAPP_API_VERSION` | `v27.0` |

Never put the service role key, Meta access token, verify token or Meta app secret in GitHub, frontend code, or a chat message. Keep them in Cloudflare's encrypted secrets store. The service role key bypasses Supabase RLS and must remain server-side.

## 4. Configure the Meta webhook

After the Cloudflare deployment is successful, open the app's **WhatsApp API** page and copy its callback URL. In Meta for Developers → WhatsApp → Configuration:

- Callback URL: the URL shown in MrSa Blaster, ending in `/api/whatsapp/webhook`
- Verify token: the exact value saved as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the `messages` webhook field

The webhook verifies Meta's SHA-256 signature using `META_APP_SECRET` and records message status updates.

## 5. Deploy and verify

1. Apply the Supabase SQL migration first.
2. Add all Cloudflare variables/secrets.
3. Push/deploy the latest `main` branch commit to Cloudflare Pages.
4. Open MrSa Blaster → WhatsApp API → Check connection.
5. Create a real contact with its original opt-in date, source, evidence reference, and consent category. Do not use demo contacts or guess consent.
6. Use a Meta-approved template in Campaigns. Start with one or a few opted-in test recipients.

## Safety built into this integration

- Live sends require a signed-in workspace Admin and a current trial/paid subscription.
- The backend re-reads contacts from Supabase; it does not trust browser-only contact data.
- Each recipient must have `opted_in`, the original consent date, source, evidence, and a matching consent category (`marketing`, `utility`, or `all`).
- Pending, opted-out, and browser-only sample contacts are rejected.
- Only Meta-approved templates are accepted for business-initiated campaigns.
- One send request is capped at 50 recipients.
- Meta tokens remain on the server, not in the browser.

The code does not create your Meta Business Account, verify your business/phone number, approve templates, add Cloudflare secrets, or publish the Cloudflare deployment. Those steps require your account access.
