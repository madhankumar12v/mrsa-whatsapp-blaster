import { authenticate, db, reply } from "./whatsapp.js";

export async function authorizeBrowserAdmin(request, env) {
  const { user } = await authenticate(request, env);
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return { response: reply({ error: "A valid workspace is required." }, 400) };
  }
  const memberships = await db(env,
    "workspace_memberships?select=role&workspace_id=eq." + encodeURIComponent(workspaceId) +
    "&user_id=eq." + encodeURIComponent(user.id) + "&limit=1"
  );
  if (!memberships?.length || memberships[0].role !== "admin") {
    return { response: reply({ error: "Only workspace Admins can manage the browser service." }, 403) };
  }
  if (!env.BROWSER_SERVICE_URL || !env.BROWSER_SERVICE_TOKEN) {
    return { response: reply({ error: "Online browser service is not configured yet." }, 503) };
  }
  let base;
  try { base = new URL(env.BROWSER_SERVICE_URL); } catch {
    return { response: reply({ error: "Browser service URL is invalid." }, 503) };
  }
  if (base.protocol !== "https:") {
    return { response: reply({ error: "Browser service must use HTTPS." }, 503) };
  }
  return { base, token: env.BROWSER_SERVICE_TOKEN };
}

export async function callBrowserService(config, path, method = "GET") {
  const url = new URL(path, config.base);
  return fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + config.token,
      Accept: path.endsWith("/qr") ? "image/png" : "application/json"
    },
    signal: AbortSignal.timeout(path.endsWith("/qr") ? 60000 : 30000)
  });
}
