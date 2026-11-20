const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "";
  const headers = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400" };
  if (allowed.split(",").map(x => x.trim()).includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function hex(bytes) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function required(env, names) {
  const missing = names.filter(name => !env[name]);
  if (missing.length) throw new Error("Server billing configuration is incomplete.");
}
function supabaseHeaders(env, userToken) {
  return { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + (userToken || env.SUPABASE_SECRET_KEY), "Content-Type": "application/json" };
}
async function sb(env, path, options = {}, userToken) {
  const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, {
    ...options, headers: { ...supabaseHeaders(env, userToken), ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) throw new Error("Database request failed (" + response.status + ").");
  return body ? JSON.parse(body) : null;
}
async function identify(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: "Bearer " + match[1] }
  });
  if (!response.ok) return null;
  return { user: await response.json(), token: match[1] };
}
async function workspaceFor(user, env) {
  const q = new URLSearchParams({ select: "workspace_id,role", user_id: "eq." + user.id, limit: "1" });
  const memberships = await sb(env, "workspace_memberships?" + q.toString());
  const membership = memberships?.[0];
  if (!membership || membership.role !== "admin") return null;
  const s = new URLSearchParams({ select: "status,trial_ends_at,paid_through,monthly_price_paise", workspace_id: "eq." + membership.workspace_id, limit: "1" });
  const subscriptions = await sb(env, "workspace_subscriptions?" + s.toString());
  return { id: membership.workspace_id, subscription: subscriptions?.[0] || null };
}
async function razorpay(env, path, init = {}) {
  const response = await fetch("https://api.razorpay.com/v1/" + path, {
    ...init,
    headers: { Authorization: "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET), "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Razorpay could not complete the request.");
  return data;
}
async function activate(env, orderId, paymentId, amount, currency) {
  const result = await sb(env, "rpc/activate_mrsa_payment", {
    method: "POST",
    body: JSON.stringify({ p_order_id: orderId, p_payment_id: paymentId, p_amount_paise: amount, p_currency: currency })
  });
  return result === true;
}
async function handle(request, env) {
  required(env, ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]);
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api/, "");
  if (route === "/webhooks/razorpay" && request.method === "POST") {
    const raw = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";
    const expected = await hmac(env.RAZORPAY_WEBHOOK_SECRET, raw);
    if (!safeEqual(signature, expected)) return json({ error: "Invalid webhook signature." }, 401);
    const event = JSON.parse(raw);
    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        const ok = await activate(env, payment.order_id, payment.id, payment.amount, payment.currency);
        if (!ok) return json({ error: "Payment did not match a pending order." }, 400);
      }
    }
    return json({ received: true });
  }

  const identity = await identify(request, env);
  if (!identity) return json({ error: "Please sign in again." }, 401);
  const workspace = await workspaceFor(identity.user, env);
  if (!workspace) return json({ error: "Workspace administrator access is required for billing." }, 403);

  if (route === "/billing/order" && request.method === "POST") {
    const amount = 29900;
    const order = await razorpay(env, "orders", { method: "POST", body: JSON.stringify({
      amount, currency: "INR", receipt: "mrsa_" + crypto.randomUUID(),
      notes: { workspace_id: workspace.id, plan: "Starter Monthly" }
    }) });
    await sb(env, "payment_orders", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ workspace_id: workspace.id, created_by: identity.user.id, provider_order_id: order.id, amount_paise: amount, currency: "INR", status: "created" })
    });
    return json({ order: { id: order.id, amount: order.amount, currency: order.currency }, keyId: env.RAZORPAY_KEY_ID, plan: { name: "Starter", amount: 29900, currency: "INR", billingCycle: "Monthly" } }, 201);
  }

  if (route === "/billing/verify" && request.method === "POST") {
    const body = await request.json();
    const orderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) return json({ error: "Payment verification details are incomplete." }, 400);
    const expected = await hmac(env.RAZORPAY_KEY_SECRET, orderId + "|" + paymentId);
    if (!safeEqual(signature, expected)) return json({ error: "Payment signature is invalid." }, 400);
    const q = new URLSearchParams({ select: "amount_paise,currency,status", workspace_id: "eq." + workspace.id, provider_order_id: "eq." + orderId, limit: "1" });
    const rows = await sb(env, "payment_orders?" + q.toString());
    if (!rows?.length) return json({ error: "Payment order not found for this workspace." }, 404);
    const payment = await razorpay(env, "payments/" + encodeURIComponent(paymentId));
    if (payment.order_id !== orderId || payment.status !== "captured" || payment.amount !== rows[0].amount_paise || payment.currency !== rows[0].currency) {
      return json({ error: "Payment is not captured or does not match this order yet. Please retry shortly." }, 402);
    }
    if (!await activate(env, orderId, paymentId, payment.amount, payment.currency)) return json({ error: "Payment could not be activated. Contact support with your Razorpay payment ID." }, 409);
    return json({ verified: true, subscriptionStatus: "active" });
  }

  if (route === "/billing/history" && request.method === "GET") {
    const q = new URLSearchParams({ select: "provider_order_id,provider_payment_id,amount_paise,currency,status,created_at,paid_at", workspace_id: "eq." + workspace.id, order: "created_at.desc", limit: "25" });
    const payments = await sb(env, "payment_orders?" + q.toString());
    return json({ payments: payments || [] });
  }
  return json({ error: "Not found." }, 404);
}
export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const response = await handle(request, env);
      const merged = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(response.body, { status: response.status, headers: merged });
    } catch (error) {
      console.error("Billing API error:", error);
      const response = json({ error: error.message || "Billing service error." }, 500);
      const merged = new Headers(response.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(response.body, { status: 500, headers: merged });
    }
  }
};
