import { DurableObject } from "cloudflare:workers";
import puppeteer from "@cloudflare/puppeteer";

const MAX_DAILY_BROWSER_MS = 8 * 60 * 1000; // 2-minute safety margin under Cloudflare Free's 10-minute quota.
const HEARTBEAT_MS = 30 * 1000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" }
  });
}

async function tokenMatches(expected, supplied) {
  if (!expected || !supplied) return false;
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(expected)),
    crypto.subtle.digest("SHA-256", encode.encode(supplied))
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "mrsa-cloudflare-browser", sendingEnabled: false });
    }

    const supplied = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!(await tokenMatches(env.BROWSER_SERVICE_TOKEN, supplied))) {
      return json({ error: "Unauthorized." }, 401);
    }

    if (!["/api/status", "/api/browser/start", "/api/browser/qr", "/api/browser/stop"].includes(url.pathname)) {
      return json({ error: "Not found." }, 404);
    }
    const allowedMethod = url.pathname.endsWith("/start") || url.pathname.endsWith("/stop") ? "POST" : "GET";
    if (request.method !== allowedMethod) return json({ error: "Method not allowed." }, 405);

    const id = env.BROWSER_SESSIONS.idFromName("mrsa-whatsapp-web");
    return env.BROWSER_SESSIONS.get(id).fetch(request);
  }
};

export class BrowserSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.browser = null;
    this.page = null;
  }

  dayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  async usage() {
    const day = this.dayKey();
    let record = await this.ctx.storage.get("dailyUsage");
    if (!record || record.day !== day) {
      record = { day, usedMs: 0 };
      await this.ctx.storage.put("dailyUsage", record);
    }
    const activeSince = await this.ctx.storage.get("activeSince");
    return { ...record, activeMs: activeSince ? Math.max(0, Date.now() - activeSince) : 0 };
  }

  async connectExisting() {
    if (this.browser?.connected) return true;
    const sessionId = await this.ctx.storage.get("sessionId");
    if (!sessionId) return false;
    try {
      this.browser = await puppeteer.connect(this.env.BROWSER, sessionId);
      const pages = await this.browser.pages();
      this.page = pages.find(p => p.url().includes("web.whatsapp.com")) || pages[0] || null;
      return Boolean(this.page);
    } catch {
      this.browser = null;
      this.page = null;
      await this.ctx.storage.delete("sessionId");
      await this.ctx.storage.delete("activeSince");
      return false;
    }
  }

  async state() {
    await this.connectExisting();
    const usage = await this.usage();
    return {
      running: Boolean(this.browser?.connected && this.page && !this.page.isClosed()),
      pageOpen: Boolean(this.page && !this.page.isClosed()),
      startedAt: await this.ctx.storage.get("startedAt") || null,
      dailyBrowserMinutesUsed: Math.ceil((usage.usedMs + usage.activeMs) / 60000),
      dailyBrowserMinutesLimit: 8,
      dailyLimitReached: usage.usedMs + usage.activeMs >= MAX_DAILY_BROWSER_MS,
      mode: "manual-whatsapp-web-session",
      messageSendingEnabled: false,
      note: "Free-tier browser sessions are temporary. QR sign-in may be required again after a browser session ends."
    };
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/api/status") return json(await this.state());

    if (path === "/api/browser/start") {
      const usage = await this.usage();
      if (usage.usedMs + usage.activeMs >= MAX_DAILY_BROWSER_MS) {
        return json({ error: "MrSa's 8-minute daily safety cap has been reached. Try again after the UTC daily reset.", dailyLimitReached: true }, 429);
      }
      if (await this.connectExisting()) return json({ ...(await this.state()), alreadyRunning: true });

      try {
        this.browser = await puppeteer.launch(this.env.BROWSER);
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 900 });
        await this.page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded", timeout: 45000 });
        const sessionId = this.browser.sessionId();
        await this.ctx.storage.put("sessionId", sessionId);
        await this.ctx.storage.put("activeSince", Date.now());
        await this.ctx.storage.put("startedAt", new Date().toISOString());
        await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
        return json({ ...(await this.state()), note: "WhatsApp Web opened. Scan the private QR preview if requested. No messages are sent." });
      } catch (error) {
        try { await this.browser?.close(); } catch {}
        this.browser = null;
        this.page = null;
        return json({ error: "Cloudflare Browser Run could not start the WhatsApp Web session.", detail: String(error?.message || "").slice(0, 180) }, 503);
      }
    }

    if (path === "/api/browser/qr") {
      if (!(await this.connectExisting()) || !this.page || this.page.isClosed()) {
        return json({ error: "Browser session is not active. Start it first." }, 409);
      }
      try {
        const canvas = await this.page.$("canvas");
        if (!canvas) return json({ error: "No QR code is visible. WhatsApp may already be signed in or still loading." }, 409);
        const png = await canvas.screenshot({ type: "png" });
        return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
      } catch {
        return json({ error: "QR preview is temporarily unavailable." }, 503);
      }
    }

    if (path === "/api/browser/stop") {
      await this.finishSession();
      return json({ running: false, pageOpen: false, stopped: true, messageSendingEnabled: false });
    }

    return json({ error: "Not found." }, 404);
  }

  async finishSession() {
    const usage = await this.usage();
    const activeSince = await this.ctx.storage.get("activeSince");
    const usedMs = Math.min(MAX_DAILY_BROWSER_MS, usage.usedMs + (activeSince ? Math.max(0, Date.now() - activeSince) : 0));
    await this.ctx.storage.put("dailyUsage", { day: this.dayKey(), usedMs });
    await this.ctx.storage.delete("activeSince");
    await this.ctx.storage.delete("startedAt");
    await this.ctx.storage.delete("sessionId");
    await this.ctx.storage.deleteAlarm();
    try { await this.browser?.close(); } catch {}
    this.browser = null;
    this.page = null;
  }

  async alarm() {
    const usage = await this.usage();
    if (usage.usedMs + usage.activeMs >= MAX_DAILY_BROWSER_MS) {
      await this.finishSession();
      return;
    }
    if (await this.connectExisting()) {
      try { await this.browser.version(); } catch {}
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT_MS);
    } else {
      await this.finishSession();
    }
  }
}
