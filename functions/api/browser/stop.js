import { authorizeBrowserAdmin, callBrowserService } from "../../_lib/browser.js";
import { reply } from "../../_lib/whatsapp.js";

export async function onRequestPost({ request, env }) {
  try {
    const config = await authorizeBrowserAdmin(request, env);
    if (config.response) return config.response;
    const upstream = await callBrowserService(config, "/api/browser/stop", "POST");
    const body = await upstream.json().catch(() => ({}));
    return reply(body, upstream.status);
  } catch {
    return reply({ error: "Browser service could not be stopped. Please retry." }, 503);
  }
}
