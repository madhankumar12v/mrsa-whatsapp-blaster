const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const digits = value => String(value || "").replace(/[^0-9]/g,"");
function normalizePhone(value) {
  let phone=digits(value);
  if(phone.length===10) phone="91"+phone;
  if(phone.startsWith("0")&&phone.length===11) phone="91"+phone.slice(1);
  if(phone.startsWith("0091")&&phone.length===14) phone=phone.slice(2);
  return phone.length>=8&&phone.length<=15&&!phone.startsWith("0")?phone:null;
}
async function db(env,path,init={}) {
  const response=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",...(init.headers||{})}});
  const raw=await response.text(); let data=null; try{data=raw?JSON.parse(raw):null;}catch{data=raw;}
  if(!response.ok) throw new Error("Supabase "+response.status+": "+(data?.message||raw||"database error"));
  return data;
}
async function graph(env,path,init={}) {
  const response=await fetch("https://graph.facebook.com/"+(env.WHATSAPP_API_VERSION||"v27.0")+"/"+path,{...init,headers:{Authorization:"Bearer "+env.WHATSAPP_ACCESS_TOKEN,"Content-Type":"application/json",...(init.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error?.message||"Meta API request failed");
  return data;
}
async function processDraft(env,draft) {
  const workspaceId=draft.workspace_id;
  const runBase={workspace_id:workspaceId,campaign_draft_id:draft.id,campaign_name:draft.name,template_name:draft.template_name,category:draft.category,language:draft.template_language||"en_US",parameters:draft.template_parameters||[],audience_count:(draft.contact_ids||[]).length,status:"processing",scheduled_at:draft.scheduled_at,started_at:new Date().toISOString(),created_by:draft.created_by};
  let run;
  try {
    const members=await db(env,"workspace_memberships?select=role&workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(draft.created_by)+"&limit=1");
    if(!members?.length||members[0].role!=="admin") throw new Error("The campaign creator is no longer a workspace admin.");
    const subs=await db(env,"workspace_subscriptions?select=status,trial_ends_at,paid_through&workspace_id=eq."+encodeURIComponent(workspaceId)+"&limit=1");
    const sub=subs?.[0], now=Date.now();
    if(!sub||!((sub.status==="trialing"&&Date.parse(sub.trial_ends_at)>now)||(sub.status==="active"&&Date.parse(sub.paid_through)>now))) throw new Error("Workspace subscription is not active.");
    if(!draft.template_name||!["marketing","utility"].includes(draft.category)) throw new Error("Approved template details are missing.");
    const templates=await graph(env,env.WHATSAPP_BUSINESS_ACCOUNT_ID+"/message_templates?name="+encodeURIComponent(draft.template_name));
    const template=(templates.data||[]).find(t=>t.name===draft.template_name&&t.language===(draft.template_language||"en_US")&&t.status==="APPROVED"&&String(t.category||"").toLowerCase()===draft.category);
    if(!template) throw new Error("The scheduled template is no longer approved or its category changed.");
    const ids=(draft.contact_ids||[]).slice(0,50);
    if(!ids.length) throw new Error("The scheduled audience is empty.");
    const contacts=await db(env,"contacts?select=id,full_name,phone,consent_status,consent_at,consent_source,consent_evidence,consent_scope&workspace_id=eq."+encodeURIComponent(workspaceId)+"&id=in.("+ids.join(",")+")");
    run=await db(env,"campaign_runs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(runBase)});
    run=Array.isArray(run)?run[0]:run;
    let accepted=0,failed=0;
    for(const id of ids) {
      const c=contacts.find(item=>item.id===id);
      let status="failed",errorMessage=null,messageId=null,to=null;
      if(!c) errorMessage="Contact no longer exists in this workspace.";
      else if(c.consent_status!=="opted_in"||!c.consent_at||!c.consent_source||!c.consent_evidence||!["marketing","utility","all"].includes(c.consent_scope)||(c.consent_scope!=="all"&&c.consent_scope!==draft.category)) errorMessage="Current consent is missing, revoked, incomplete or does not cover this template category.";
      else if(!(to=normalizePhone(c.phone))) errorMessage="Contact phone number is invalid.";
      else {
        try {
          const parameters=Array.isArray(draft.template_parameters)?draft.template_parameters:[];
          const components=parameters.length?[{type:"body",parameters:parameters.map(text=>({type:"text",text:String(text)}))}]:[];
          const sent=await graph(env,env.WHATSAPP_PHONE_NUMBER_ID+"/messages",{method:"POST",body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"template",template:{name:draft.template_name,language:{code:draft.template_language||"en_US"},...(components.length?{components}:{})}})});
          messageId=sent?.messages?.[0]?.id||null; status="accepted"; accepted++;
        } catch(e) { errorMessage=e.message; }
      }
      if(status==="failed") failed++;
      await db(env,"whatsapp_message_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({workspace_id:workspaceId,contact_id:c?.id||id,created_by:draft.created_by,recipient_phone:to||digits(c?.phone),template_name:draft.template_name,meta_message_id:messageId,status,status_updated_at:new Date().toISOString(),error_message:errorMessage})});
    }
    const finalStatus=failed===0?"completed":accepted===0?"failed":"partial";
    await db(env,"campaign_runs?id=eq."+encodeURIComponent(run.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({accepted_count:accepted,failed_count:failed,status:finalStatus,completed_at:new Date().toISOString()})});
    await db(env,"campaign_drafts?id=eq."+encodeURIComponent(draft.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:accepted?"sent":"failed"})});
  } catch(error) {
    console.error("Scheduled campaign failed",draft.id,error);
    if(run?.id) await db(env,"campaign_runs?id=eq."+encodeURIComponent(run.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"failed",failed_count:runBase.audience_count,completed_at:new Date().toISOString()})}).catch(()=>{});
    await db(env,"campaign_drafts?id=eq."+encodeURIComponent(draft.id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status:"failed"})}).catch(()=>{});
  }
}
async function dispatch(env) {
  const due=await db(env,"campaign_drafts?select=id,workspace_id,name,category,template_name,template_language,template_parameters,contact_ids,scheduled_at,created_by&status=eq.scheduled&scheduled_at=lte."+encodeURIComponent(new Date().toISOString())+"&order=scheduled_at.asc&limit=20");
  for(const draft of due||[]) {
    const claimed=await db(env,"campaign_drafts?id=eq."+encodeURIComponent(draft.id)+"&status=eq.scheduled",{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({status:"processing"})});
    if(Array.isArray(claimed)&&claimed.length) await processDraft(env,draft);
  }
}
export default {
  async scheduled(_controller,env,ctx) {
    if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.WHATSAPP_ACCESS_TOKEN||!env.WHATSAPP_PHONE_NUMBER_ID||!env.WHATSAPP_BUSINESS_ACCOUNT_ID) throw new Error("Scheduler Worker secrets are not configured.");
    ctx.waitUntil(dispatch(env));
  },
  async fetch(request,env) {
    if(request.method!=="POST") return json({error:"Method not allowed"},405);
    if(!env.SCHEDULER_MANUAL_SECRET||request.headers.get("Authorization")!=="Bearer "+env.SCHEDULER_MANUAL_SECRET) return json({error:"Unauthorized"},401);
    try { await dispatch(env); return json({ok:true}); } catch(e) { return json({error:e.message||"Scheduler failed"},500); }
  }
};
