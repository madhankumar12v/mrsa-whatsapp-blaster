import { authenticate, errorResponse, graphRequest, missingEnv, reply, requireWorkspaceAdmin } from "../../_lib/whatsapp.js";

export async function onRequestGet({ request, env }) {
  try {
    const { user } = await authenticate(request, env);
    const missing = missingEnv(env, ["SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_BUSINESS_ACCOUNT_ID"]);
    if (missing.length) return reply({ error: "WhatsApp Cloud API is not configured. No credentials were exposed.", missing }, 503);
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    await requireWorkspaceAdmin(env, user.id, workspaceId);
    const response = await graphRequest(
      env,
      env.WHATSAPP_BUSINESS_ACCOUNT_ID + "/message_templates?fields=name,status,category,language,components,quality_score&limit=100"
    );
    const templates = (response.data || []).map(item => ({
      name: item.name,
      status: item.status,
      category: String(item.category || "").toLowerCase(),
      language: item.language,
      quality: item.quality_score || null,
      components: (item.components || []).map(component => ({
        type: component.type,
        format: component.format || null,
        text: component.text || null,
        buttons: (component.buttons || []).map(button => ({
          type: button.type,
          text: button.text || null,
          url: button.url || null
        }))
      }))
    }));
    return reply({
      templates,
      total: templates.length,
      approved: templates.filter(item => item.status === "APPROVED").length,
      hasMore: Boolean(response.paging?.next)
    });
  } catch (error) {
    if (error.message === "META_API_ERROR") {
      return reply({ error: error.meta || "Meta could not return message templates." }, 502);
    }
    return errorResponse(error);
  }
}
