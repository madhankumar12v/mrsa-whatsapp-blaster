const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export function reply(body, status = 200) { return json(body, status); }
export function missingEnv(env, names) { return names.filter(name => !env[name]); }

export async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error("AUTH_REQUIRED");
  }
  const userResponse = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: "Bearer " + token }
  });
  if (!userResponse.ok) throw new Error("AUTH_REQUIRED");
  const user = await userResponse.json();
  if (!user?.id) throw new Error("AUTH_REQUIRED");
  return { user, token };
}

export async function db(env, path, options = {}) {
  const response = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    console.error("Supabase DB error:", {
      status: response.status,
      message: data?.message || data?.msg || "Unknown database error",
      code: data?.code || null,
      hint: data?.hint || null
    });
    const diagnostic = {
      status: response.status,
      message: data?.message || data?.msg || "Unknown database error",
      code: data?.code || null,
      hint: data?.hint || null
    };
    const error = new Error("DATABASE_ERROR");
    error.dbDiagnostic = diagnostic;
    throw error;
  }
  return data;
}

export async function requireWorkspaceAdmin(env, userId, workspaceId) {
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error("INVALID_WORKSPACE");
  const memberships = await db(env, "workspace_memberships?select=role&workspace_id=eq." + encodeURIComponent(workspaceId) + "&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  if (!memberships?.length || memberships[0].role !== "admin") throw new Error("ADMIN_REQUIRED");
  const subscriptions = await db(env, "workspace_subscriptions?select=status,trial_ends_at,paid_through&workspace_id=eq." + encodeURIComponent(workspaceId) + "&limit=1");
  const sub = subscriptions?.[0];
  const now = Date.now();
  const allowed = sub && ((sub.status === "trialing" && Date.parse(sub.trial_ends_at) > now) || (sub.status === "active" && Date.parse(sub.paid_through) > now));
  if (!allowed) throw new Error("SUBSCRIPTION_REQUIRED");
}

export function errorResponse(error) {
  const map = {
    AUTH_REQUIRED: [401, "Please sign in again."],
    INVALID_WORKSPACE: [400, "A valid workspace is required."],
    ADMIN_REQUIRED: [403, "Only the workspace Admin can manage WhatsApp sending."],
    SUBSCRIPTION_REQUIRED: [402, "An active subscription or valid free trial is required."],
    DATABASE_ERROR: [503, "Workspace data could not be checked. No messages were sent."]
  };
  const [status, message] = map[error.message] || [500, "The request could not be completed."];
  const body = { error: message };
  if (error.message === "DATABASE_ERROR" && error.dbDiagnostic) {
    body.diagnostic = error.dbDiagnostic;
  }
  return reply(body, status);
}

export function cleanPhone(value) { return String(value || "").replace(/[^0-9]/g, ""); }
export function normalizeWhatsAppPhone(value) {
  let phone = cleanPhone(value);
  if (phone.length === 10) phone = "91" + phone;
  if (phone.startsWith("0") && phone.length === 11) phone = "91" + phone.slice(1);
  if (phone.startsWith("0091") && phone.length === 14) phone = phone.slice(2);
  if (phone.length < 8 || phone.length > 15 || phone.startsWith("0")) return null;
  return phone;
}

export async function graphRequest(env, path, init = {}) {
  const version = env.WHATSAPP_API_VERSION || "v27.0";
  const url = "https://graph.facebook.com/" + version + "/" + path;
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + env.WHATSAPP_ACCESS_TOKEN, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("META_API_ERROR");
    error.meta = data?.error?.message || "Meta API request failed";
    error.code = data?.error?.code || response.status;
    error.subcode = data?.error?.error_subcode || null;
    error.type = data?.error?.type || null;
    error.fbtraceId = data?.error?.fbtrace_id || null;
    error.details = data?.error?.error_data?.details || null;
    throw error;
  }
  return data;
}
