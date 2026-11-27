import { authorizeBrowserAdmin, callBrowserService } from "../../_lib/browser.js";
import { reply, errorResponse } from "../../_lib/whatsapp.js";

export async function onRequestGet({ request, env }) {
  try {
    const config = await authorizeBrowserAdmin(request, env);
    if (config.response) return config.response;
    const upstream = await callBrowserService(config, "/api/status");
    const body = await upstream.json().catch(() => ({}));
    return reply(body, upstream.status);
  } catch (error) {
    if (["AUTH_REQUIRED", "INVALID_WORKSPACE", "ADMIN_REQUIRED", "DATABASE_ERROR"].includes(error?.message)) return errorResponse(error);
    return reply({ error: "Browser service is waking up or unavailable. Please retry shortly." }, 503);
  }
}
