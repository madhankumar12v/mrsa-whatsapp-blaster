import { db, reply } from "../../_lib/whatsapp.js";

async function verifySignature(request, env, rawBody) {
  const secret = env.META_APP_SECRET;
  const signature = request.headers.get("X-Hub-Signature-256") || "";
  if (!secret || !signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
  const expected = "sha256=" + hex;
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return reply({ error: "Webhook verification failed." }, 403);
}

export async function onRequestPost({ request, env }) {
  const rawBody = await request.text();
  if (!(await verifySignature(request, env, rawBody))) return reply({ error: "Invalid webhook signature." }, 401);
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return reply({ error: "Invalid JSON." }, 400); }
  if (payload.object === "whatsapp_business_account") {
    for (const entry of payload.entry || []) for (const change of entry.changes || []) {
      const statuses = change.value?.statuses || [];
      for (const status of statuses) {
        if (!status.id) continue;
        try {
          await db(env, "whatsapp_message_logs?meta_message_id=eq." + encodeURIComponent(status.id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: status.status || "unknown", status_updated_at: new Date(Number(status.timestamp || 0) * 1000).toISOString() })
          });
        } catch { /* Meta retries failed webhook deliveries; message sending remains unaffected. */ }
      }
    }
  }
  return reply({ received: true });
}
