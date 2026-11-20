import { authenticate, db, errorResponse, graphRequest, missingEnv, reply } from "../../_lib/whatsapp.js";

export async function onRequestGet({ request, env }) {
  try {
    const { user } = await authenticate(request, env);
    const missing = missingEnv(env, ["SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"]);
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) return reply({ configured: false, connected: false, missing, error: "Workspace is required." }, 400);
    const memberships = await db(env, "workspace_memberships?select=role&workspace_id=eq." + encodeURIComponent(workspaceId) + "&user_id=eq." + encodeURIComponent(user.id) + "&limit=1");
    if (!memberships?.length || memberships[0].role !== "admin") return reply({ error: "Only workspace Admins can view this setup." }, 403);
    if (missing.length) return reply({ configured: false, connected: false, missing });
    try {
      const phone = await graphRequest(env, env.WHATSAPP_PHONE_NUMBER_ID + "?fields=display_phone_number,verified_name,quality_rating");
      return reply({ configured: true, connected: true, phone: phone.display_phone_number || "", verifiedName: phone.verified_name || "", quality: phone.quality_rating || "unknown", missing: [] });
    } catch (error) {
      return reply({ configured: true, connected: false, error: error.meta || "Meta connection could not be verified.", missing: [] }, 502);
    }
  } catch (error) { return errorResponse(error); }
}
