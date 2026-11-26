import { authenticate, db, reply } from "../../_lib/whatsapp.js";
export async function onRequestGet({request,env}) {
 try {
  const {user}=await authenticate(request,env);
  const url=new URL(request.url); const workspaceId=url.searchParams.get("workspaceId")||"";
  if(!workspaceId||!/^[0-9a-f-]{36}$/i.test(workspaceId)) return reply({error:"A valid workspace is required."},400);
  const member=await db(env,"workspace_memberships?select=role&workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
  if(!member?.length||member[0].role!=="admin") return reply({error:"Workspace administrator access is required."},403);
  const checks=[];
  const configured=!!(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY);
  const started=Date.now();
  try { await db(env,"workspace_subscriptions?select=workspace_id&workspace_id=eq."+encodeURIComponent(workspaceId)+"&limit=1"); checks.push({service:"Supabase",status:"healthy",latency_ms:Date.now()-started,details:{database:"reachable"}}); }
  catch(e){checks.push({service:"Supabase",status:"down",latency_ms:Date.now()-started,details:{error:e.message}});}
  const metaConfigured=!!(env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_NUMBER_ID&&env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  if(!metaConfigured) checks.push({service:"WhatsApp Cloud API",status:"not_configured",details:{message:"One or more WhatsApp credentials are missing."}});
  else {
   const t=Date.now();
   try {
    const response=await fetch("https://graph.facebook.com/"+(env.WHATSAPP_API_VERSION||"v27.0")+"/"+env.WHATSAPP_PHONE_NUMBER_ID+"?fields=id,display_phone_number,verified_name",{headers:{Authorization:"Bearer "+env.WHATSAPP_ACCESS_TOKEN}});
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result?.error?.message||"Meta API health request failed.");
    checks.push({service:"WhatsApp Cloud API",status:"healthy",latency_ms:Date.now()-t,details:{phone_number_id:result.id,display_phone_number:result.display_phone_number||null,verified_name:result.verified_name||null}});
   }catch(e){checks.push({service:"WhatsApp Cloud API",status:"degraded",latency_ms:Date.now()-t,details:{error:e.message}});}
  }
  const now=new Date().toISOString();
  for(const check of checks) await db(env,"integration_health_checks",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({workspace_id:workspaceId,service:check.service,status:check.status,latency_ms:check.latency_ms??null,details:check.details||{},checked_at:now})}).catch(()=>{});
  return reply({checks,checkedAt:now});
 }catch(e){const status=e.message==="AUTH_REQUIRED"?401:500;return reply({error:status===401?"Please sign in again.":"Health check could not be completed."},status);}
}
