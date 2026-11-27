import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import puppeteer from "puppeteer";
import { timingSafeEqual } from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 10000);
const serviceToken = process.env.BROWSER_SERVICE_TOKEN || "";
const profileDir = process.env.BROWSER_PROFILE_DIR || "/tmp/mrsa-whatsapp-profile";

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));

let browser = null;
let page = null;
let startedAt = null;
let lastError = null;

const controlLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many browser control requests. Try again later." }
});

function authorized(req, res, next) {
  const supplied = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!serviceToken) return res.status(503).json({ error: "Browser service is not configured." });
  const a = Buffer.from(supplied);
  const b = Buffer.from(serviceToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

function browserState() {
  return {
    running: Boolean(browser && browser.connected),
    pageOpen: Boolean(page && !page.isClosed()),
    startedAt,
    lastError,
    mode: "manual-browser-session-only",
    messageSendingEnabled: false
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mrsa-puppeteer-browser-service", timestamp: new Date().toISOString() });
});

app.get("/api/status", authorized, (_req, res) => res.json(browserState()));

app.post("/api/browser/start", authorized, controlLimiter, async (_req, res) => {
  if (browser?.connected && page && !page.isClosed()) return res.json({ ...browserState(), alreadyRunning: true });
  try {
    lastError = null;
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: profileDir,
      defaultViewport: { width: 1280, height: 900 },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote"
      ],
      timeout: 60000
    });
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded", timeout: 60000 });
    startedAt = new Date().toISOString();
    browser.on("disconnected", () => {
      browser = null;
      page = null;
    });
    return res.status(200).json({
      ...browserState(),
      note: "WhatsApp Web opened in a cloud browser. Use the approved dashboard QR viewer to sign in. No messages are sent."
    });
  } catch (error) {
    lastError = String(error?.message || "Browser launch failed").slice(0, 300);
    try { await browser?.close(); } catch {}
    browser = null;
    page = null;
    return res.status(503).json({ ...browserState(), error: "Could not start cloud browser." });
  }
});

app.get("/api/browser/qr", authorized, async (_req, res) => {
  if (!browser?.connected || !page || page.isClosed()) {
    return res.status(409).json({ error: "Browser is not running. Start it first." });
  }
  try {
    const qrCanvas = await page.$("canvas");
    if (!qrCanvas) return res.status(409).json({ error: "A QR code is not currently visible. WhatsApp Web may already be signed in or still loading." });
    const image = await qrCanvas.screenshot({ type: "png" });
    res.set("Cache-Control", "no-store, private");
    res.type("png").send(image);
  } catch {
    res.status(503).json({ error: "Could not capture the current browser view." });
  }
});

app.post("/api/browser/stop", authorized, controlLimiter, async (_req, res) => {
  try { await browser?.close(); } catch {}
  browser = null;
  page = null;
  startedAt = null;
  res.json({ ...browserState(), stopped: true });
});

app.use((_req, res) => res.status(404).json({ error: "Not found." }));

app.listen(port, "0.0.0.0", () => {
  console.log(`MrSa Puppeteer service listening on port ${port}`);
});
