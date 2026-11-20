import { authenticate, cleanPhone, db, errorResponse, graphRequest, reply, requireWorkspaceAdmin } from "../../_lib/whatsapp.js";

export async function onRequestPost({ request, env }) {
  try {
    const { user } = await authenticate(request, env);
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return reply({ error: "WhatsApp Cloud API is not configured yet. No messages were sent." }, 503);
    const body = await request.json();
    const workspaceId = body.workspaceId;
    const contactIds = Array.isArray(body.contactIds) ? [...new Set(body.contactIds)] : [];
    const templateName = String(body.templateName || "").trim().toLowerCase();
    const language = String(body.language || "en_US").trim();
    const parameters = Array.isArray(body.parameters) ? body.parameters.slice(0, 10).map(v => String(v).slice(0, 500)) : [];
    if (!/^[a-z0-9_]{1,128}$/.test(templateName)) return reply({ error: "Use the exact name of an approved WhatsApp template." }, 400);
    if (!/^[a-z]{2}_[A-Z]{2}$/.test(language)) return reply({ error: "Invalid template language code." }, 400);
    if (!contactIds.length || contactIds.length > 50 || contactIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) return reply({ error: "Select between 1 and 50 valid saved contacts." }, 400);
    await requireWorkspaceAdmin(env, user.id, workspaceId);

    const results = [];
    for (const contactId of contactIds) {
      const contacts = await db(env, "contacts?select=id,full_name,phone,consent_status,consent_at,consent_source,consent_evidence&workspace_id=eq." + encodeURIComponent(workspaceId) + "&id=eq." + encodeURIComponent(contactId) + "&limit=1");
      const contact = contacts?.[0];
      if (!contact || contact.consent_status !== "opted_in" || !contact.consent_at || !contact.consent_source || !contact.consent_evidence) {
        results.push({ contactId, sent: false, reason: "Valid recorded opt-in evidence is missing." });
        continue;
      }
      const to = cleanPhone(contact.phone);
      if (to.length < 8 || to.length > 15) {
        results.push({ contactId, sent: false, reason: "Contact phone number is invalid." });
        continue;
      }
      const components = parameters.length ? [{ type: "body", parameters: parameters.map(text => ({ type: "text", text })) }] : [];
      try {
        const sent = await graphRequest(env, env.WHATSAPP_PHONE_NUMBER_ID + "/messages", {
          method: "POST",
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "template",
            template: { name: templateName, language: { code: language }, ...(components.length ? { components } : {}) }
          })
        });
        const messageId = sent?.messages?.[0]?.id || null;
        await db(env, "whatsapp_message_logs", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ workspace_id: workspaceId, contact_id: contact.id, created_by: user.id, recipient_phone: to, template_name: templateName, meta_message_id: messageId, status: "accepted" })
        });
        results.push({ contactId, sent: true, messageId });
      } catch (error) {
        results.push({ contactId, sent: false, reason: error.meta || "Meta rejected this message." });
      }
    }
    return reply({ requested: contactIds.length, sent: results.filter(r => r.sent).length, failed: results.filter(r => !r.sent).length, results });
  } catch (error) { return errorResponse(error); }
}
