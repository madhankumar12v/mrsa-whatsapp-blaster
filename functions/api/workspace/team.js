import { authenticate, db, reply } from "../../_lib/whatsapp.js";

async function admin(request,env,workspaceId) {
 const {user}=await authenticate(request,env);
 if(!workspaceId||!/^[0-9a-f-]{36}$/i.test(workspaceId)) throw new Error("INVALID_WORKSPACE");
 const rows=await db(env,"workspace_memberships?select=role&workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(user.id)+"&limit=1");
 if(!rows?.length||rows[0].role!=="admin") throw new Error("ADMIN_REQUIRED");
 return user;
}
function err(e){const status=e.message==="AUTH_REQUIRED"?401:e.message==="ADMIN_REQUIRED"?403:e.message==="INVALID_WORKSPACE"?400:500;return reply({error:status===500?"Team operation failed.":e.message},status);}
export async function onRequestPost({request,env}) {
 try {
  const body=await request.json(); const workspaceId=String(body.workspaceId||"");
  const actor=await admin(request,env,workspaceId);
  const email=String(body.email||"").trim().toLowerCase(); const role=body.role==="admin"?"admin":"user";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({error:"Enter a valid team member email address."},400);
  const response=await fetch(env.SUPABASE_URL+"/auth/v1/invite",{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,data:{invited_workspace_id:workspaceId,invited_by:actor.id}})});
  const invited=await response.json().catch(()=>({}));
  if(!response.ok||!invited.id) return reply({error:invited.msg||invited.message||invited.error_description||"Invitation could not be sent. The email may already belong to an account."},400);
  await db(env,"workspace_memberships",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({workspace_id:workspaceId,user_id:invited.id,role})});
  await db(env,"security_audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({workspace_id:workspaceId,actor_user_id:actor.id,action:"team.member_invited",target_type:"workspace_member",target_id:invited.id,details:{email,role}})});
  return reply({ok:true,message:"Invitation sent to "+email+" with "+role+" role."});
 }catch(e){return err(e);}
}
export async function onRequestPatch({request,env}) {
 try {
  const body=await request.json(); const workspaceId=String(body.workspaceId||""); const userId=String(body.userId||""); const role=body.role;
  const actor=await admin(request,env,workspaceId);
  if(!/^[0-9a-f-]{36}$/i.test(userId)||!["admin","user"].includes(role)) return reply({error:"Choose a valid member and role."},400);
  if(userId===actor.id&&role!=="admin") return reply({error:"You cannot remove your own administrator role here."},400);
  await db(env,"workspace_memberships?workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(userId),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({role})});
  return reply({ok:true});
 }catch(e){return err(e);}
}
export async function onRequestDelete({request,env}) {
 try {
  const body=await request.json(); const workspaceId=String(body.workspaceId||""); const userId=String(body.userId||"");
  const actor=await admin(request,env,workspaceId);
  if(!/^[0-9a-f-]{36}$/i.test(userId)||userId===actor.id) return reply({error:"Choose another valid workspace member."},400);
  await db(env,"workspace_memberships?workspace_id=eq."+encodeURIComponent(workspaceId)+"&user_id=eq."+encodeURIComponent(userId),{method:"DELETE",headers:{Prefer:"return=minimal"}});
  return reply({ok:true});
 }catch(e){return err(e);}
}
