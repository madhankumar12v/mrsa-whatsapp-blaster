import puppeteer from "puppeteer";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const profileDir = path.join(os.homedir(), ".mrsa-blaster", "whatsapp-profile");

console.log("MrSa Browser Assistant");
console.log("Launching a local Chrome window for WhatsApp Web...");
console.log("You remain in control of all WhatsApp actions.");
console.log("This assistant does not send messages, click Send, or automate bulk messaging.");

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: profileDir,
  defaultViewport: null,
  args: ["--no-first-run", "--no-default-browser-check"],
});

const page = await browser.newPage();
await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });

console.log("\nWhatsApp Web is open.");
console.log("Scan the QR code if requested. Use WhatsApp Web manually.");
console.log("Press Ctrl+C in this terminal to close the browser.");

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    await browser.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
