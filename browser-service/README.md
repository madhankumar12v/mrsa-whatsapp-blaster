# MrSa Online Puppeteer Service — Phase 1

A separate cloud service for launching and monitoring a **visible-to-the-user via a protected screenshot endpoint** headless browser session. It is not a message sender.

## Included endpoints

- `GET /health` — public service health check (no secrets returned).
- `GET /api/status` — authenticated browser status.
- `POST /api/browser/start` — authenticated launch of a headless Puppeteer session and navigation to WhatsApp Web.
- `GET /api/browser/qr` — authenticated PNG screenshot of the current browser viewport for manual QR sign-in.
- `POST /api/browser/stop` — authenticated browser shutdown.

All endpoints except `/health` require `Authorization: Bearer <BROWSER_SERVICE_TOKEN>`. Keep this token server-side. Do not put it in any `VITE_*` frontend variable or expose it to the browser. The website must call a same-origin Cloudflare Pages Function proxy; the proxy integration is a subsequent step.

## Render free deployment

This repository includes a root `render.yaml`. Create a Render Web Service from this repository and select the Blueprint if prompted. The service is configured for the free plan and uses `browser-service` as its root directory.

Set the secret environment variable `BROWSER_SERVICE_TOKEN` in Render to a long random value (at least 32 characters). Do not commit the value to GitHub or paste it into the frontend.

## Free-tier limitations

Render free web services spin down after 15 minutes without inbound traffic, take about a minute to wake, and have an ephemeral filesystem. A spin-down/restart/redeploy can erase the WhatsApp Web browser profile and require QR sign-in again. Free services can also restart at any time. This is a prototype/testing deployment, not a reliable 24/7 session host.

Headless Chromium is memory-intensive. The free instance may fail to launch or may be terminated under memory pressure. The service reports a safe error instead of attempting message delivery.

## Security and scope

- No message composition, sending, bulk automation, contact scraping, or automatic clicking.
- QR screenshots are private account-session material. Never share their URLs or images.
- The service has no public CORS allowance. Access it through a server-side authenticated proxy.
- Do not enable public debugging ports or remote DevTools endpoints.
- Stop the browser when finished.
- Use WhatsApp Web only through permitted, human-controlled interactions. Unauthorised automation can put the account at risk.
