# MrSa Browser Assistant — Phase 1

This is a **local desktop browser launcher**, not a bulk sender. It opens WhatsApp Web in a dedicated Chrome profile so the account owner can sign in and use the page manually.

## Requirements

- Node.js 20 or newer
- Windows, macOS, or Linux
- Internet access for the initial Puppeteer browser download and WhatsApp Web

## Install and run

From the repository root:

```bash
cd browser-assistant
npm install
npm start
```

On first launch, WhatsApp Web may show a QR code. Scan it with the WhatsApp account you intend to use. The dedicated browser profile is stored in:

- Windows: `%USERPROFILE%\\.mrsa-blaster\\whatsapp-profile`
- macOS/Linux: `~/.mrsa-blaster/whatsapp-profile`

Keep this profile private. It contains your logged-in browser session. Do not upload it to GitHub, share it, or include it in backups that other people can access.

## Phase 1 scope

- Launches a visible Chrome browser.
- Opens WhatsApp Web.
- Preserves the local browser profile between runs.
- Closes the browser when you press Ctrl+C.

## Explicit limitations

- No message sending, auto-clicking, contact scraping, unattended bulk messaging, or timing-based sending.
- Do not use this tool to bypass WhatsApp restrictions or messaging limits.
- For automated business messaging, use the official WhatsApp Business Platform with the required consent and approved templates.
- This local service is not deployed to Cloudflare Pages and does not expose a public network endpoint.

## Troubleshooting

If Chrome fails to launch, run `npm install` again from this directory. If WhatsApp Web asks you to sign in again, scan the QR code. Do not delete the profile folder unless you are comfortable signing in again.
