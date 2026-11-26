import React,{useEffect,useState} from 'react';
import {supabase} from './lib/supabase.js';
import {Activity,AlertCircle,CheckCircle2,Clock3,KeyRound,RefreshCw,ShieldCheck,UserPlus,Users,Wifi} from 'lucide-react';

function Header({eyebrow,title,description,action}){return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;}
function State({status}){const good=status==='healthy'||status==='processed';const bad=status==='down'||status==='failed';return <span className={'status '+(good?'active':bad?'pending':'')}>{status||'unknown'}</span>;}

export function SecurityPage({workspace,currentUser,notify}) {
 const [session,setSession]=useState(null),[health,setHealth]=useState([]),[webhooks,setWebhooks]=useState([]),[audit,setAudit]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[checking,setChecking]=useState(false);
 const isAdmin=currentUser?.role==='admin'||currentUser?.role==='super_admin';
 async function load(){
  setLoading(true);setError('');
  const {data}=await supabase.auth.getSession();setSession(data?.session||null);
  if(isAdmin&&workspace?.id){
   const [h,w,a]=await Promise.all([
    supabase.from('integration_health_checks').select('id,service,status,latency_ms,details,checked_at').eq('workspace_id',workspace.id).order('checked_at',{ascending:false}).limit(20),
    supabase.from('webhook_events').select('id,event_type,status,message_count,details,received_at,processed_at').eq('workspace_id',workspace.id).order('received_at',{ascending:false}).limit(20),
    supabase.from('security_audit_logs').select('id,actor_user_id,action,target_type,target_id,details,created_at').eq('workspace_id',workspace.id).order('created_at',{ascending:false}).limit(30)
   ]);
   if(h.error||w.error||a.error)setError(h.error?.message||w.error?.message||a.error?.message||'Some monitoring data could not be loaded.');
   setHealth(h.data||[]);setWebhooks(w.data||[]);setAudit(a.data||[]);
  }
  setLoading(false);
 }
 useEffect(()=>{load();},[workspace?.id]);
 async function checkHealth(){
  if(!workspace?.id)return;setChecking(true);setError('');
  try{const {data}=await supabase.auth.getSession();const response=await fetch('/api/workspace/health?workspaceId='+encodeURIComponent(workspace.id),{headers:{Authorization:'Bearer '+data.session.access_token}});const body=await response.json();if(!response.ok)throw new Error(body.error||'Health check failed.');setHealth(body.checks.map((item,i)=>({...item,id:'latest-'+i,checked_at:body.checkedAt})).concat(health));notify('API health check completed.');await load();}
  catch(e){setError(e.message||'Health check failed.');}
  finally{setChecking(false);}
 }
 async function revokeOthers(){
  if(!window.confirm('Sign out all other devices and sessions for this account? This device will remain signed in.'))return;
  const {error}=await supabase.auth.signOut({scope:'others'});
  if(error)setError(error.message);else notify('Other sessions have been signed out.');
 }
 async function signOutAll(){
  if(!window.confirm('Sign out this account from every device, including this one?'))return;
  const {error}=await supabase.auth.signOut({scope:'global'});
  if(error)setError(error.message);else window.location.reload();
 }
 const latestByService=new Map();health.forEach(item=>{if(!latestByService.has(item.service))latestByService.set(item.service,item);});
 return <>
  <Header eyebrow="ACCOUNT PROTECTION" title="Security & Monitoring" description="Review your sign-in session, API health, webhook activity and workspace audit trail." action={<button className="button light" onClick={load} disabled={loading}><RefreshCw size={14}/>{loading?'Refreshing…':'Refresh'}</button>}/>
  <section className="stats">
   <div className="stat"><div className="stat-label">Session status <span className="stat-icon blue"><KeyRound size={16}/></span></div><strong>{session?'Active':'Signed out'}</strong><small>{session?.expires_at?'Expires '+new Date(session.expires_at*1000).toLocaleString('en-IN'):'Current browser session'}</small></div>
   <div className="stat"><div className="stat-label">API services <span className="stat-icon blue"><Wifi size={16}/></span></div><strong>{latestByService.size}</strong><small>Latest recorded health checks</small></div>
   <div className="stat"><div className="stat-label">Webhook events <span className="stat-icon blue"><Activity size={16}/></span></div><strong>{webhooks.length}</strong><small>Latest saved events</small></div>
   <div className="stat"><div className="stat-label">Audit entries <span className="stat-icon blue"><ShieldCheck size={16}/></span></div><strong>{audit.length}</strong><small>Latest workspace actions</small></div>
  </section>
  <section className="panel"><div className="panel-head"><div><h2>Session controls</h2><p>Supabase Auth session for the signed-in account.</p></div></div><div className="settings-grid"><div><small>Account</small><b>{currentUser?.email||'—'}</b></div><div><small>Last sign-in</small><b>{session?.user?.last_sign_in_at?new Date(session.user.last_sign_in_at).toLocaleString('en-IN'):'Not provided by Auth'}</b></div><div><small>Session expiry</small><b>{session?.expires_at?new Date(session.expires_at*1000).toLocaleString('en-IN'):'—'}</b></div><div><small>Session token</small><b>Hidden · stored by Supabase Auth</b></div></div><div style={{padding:'0 20px 20px',display:'flex',gap:9,flexWrap:'wrap'}}><button className="button light" onClick={revokeOthers} disabled={!session}><ShieldCheck size={15}/> Sign out other devices</button><button className="button light" onClick={signOutAll} disabled={!session}>Sign out all devices</button></div></section>
  {isAdmin?<><section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>API health monitoring</h2><p>Live checks for Supabase connectivity and Meta WhatsApp Cloud API credentials.</p></div><button className="button primary" onClick={checkHealth} disabled={checking}><RefreshCw size={14}/>{checking?'Checking…':'Run health check'}</button></div>{error&&<div style={{padding:'0 20px 14px',color:'#b45309',fontSize:12}}><AlertCircle size={14}/> {error}</div>}<div className="table-scroll"><table><thead><tr><th>SERVICE</th><th>STATUS</th><th>LATENCY</th><th>CHECKED</th><th>DETAIL</th></tr></thead><tbody>{[...latestByService.values()].map(item=><tr key={item.id}><td><b>{item.service}</b></td><td><State status={item.status}/></td><td>{item.latency_ms==null?'—':item.latency_ms+' ms'}</td><td>{new Date(item.checked_at).toLocaleString('en-IN')}</td><td>{item.details?.error||item.details?.message||item.details?.display_phone_number||item.details?.database||'—'}</td></tr>)}{!health.length&&<tr><td colSpan="5" style={{padding:24,textAlign:'center'}}>Run a health check to record API status.</td></tr>}</tbody></table></div></section>
  <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Webhook monitoring</h2><p>Verified WhatsApp webhook status updates and processing outcomes.</p></div></div><div className="table-scroll"><table><thead><tr><th>RECEIVED</th><th>EVENT</th><th>STATUS</th><th>MESSAGES</th><th>DETAIL</th></tr></thead><tbody>{webhooks.map(item=><tr key={item.id}><td>{new Date(item.received_at).toLocaleString('en-IN')}</td><td>{item.event_type}</td><td><State status={item.status}/></td><td>{item.message_count}</td><td>{item.details?.note||'—'}</td></tr>)}{!webhooks.length&&<tr><td colSpan="5" style={{padding:24,textAlign:'center'}}>No workspace webhook events recorded yet.</td></tr>}</tbody></table></div></section>
  <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Security audit log</h2><p>Workspace member, role and payment changes.</p></div></div><div className="table-scroll"><table><thead><tr><th>DATE</th><th>ACTOR</th><th>ACTION</th><th>TARGET</th><th>DETAILS</th></tr></thead><tbody>{audit.map(item=><tr key={item.id}><td>{new Date(item.created_at).toLocaleString('en-IN')}</td><td>{item.actor_user_id===currentUser?.id?'You':item.actor_user_id||'System'}</td><td><b>{item.action}</b></td><td>{item.target_type||'—'} · {item.target_id||'—'}</td><td>{JSON.stringify(item.details||{})}</td></tr>)}{!audit.length&&<tr><td colSpan="5" style={{padding:24,textAlign:'center'}}>No audit actions recorded yet.</td></tr>}</tbody></table></div></section></>:<div className="compliance"><ShieldCheck size={16}/><div><b>Administrator monitoring</b><span>API health, webhook monitoring and workspace audit logs are available to workspace admins.</span></div></div>}
 </>;
}

export function TeamPage({workspace,currentUser,notify}) {
 const [members,setMembers]=useState([]),[email,setEmail]=useState(''),[role,setRole]=useState('user'),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const isAdmin=currentUser?.role==='admin'||currentUser?.role==='super_admin';
 async function load(){
  if(!workspace?.id){setMembers([]);setLoading(false);return;}setLoading(true);setError('');
  const {data,error}=await supabase.from('workspace_memberships').select('id,user_id,role,created_at').eq('workspace_id',workspace.id).order('created_at',{ascending:true});
  if(error){setError(error.message);setMembers([]);setLoading(false);return;}
  const ids=(data||[]).map(m=>m.user_id);
  const profiles=ids.length?await supabase.from('profiles').select('id,full_name,email').in('id',ids):{data:[]};
  setMembers((data||[]).map(m=>({...m,profile:(profiles.data||[]).find(p=>p.id===m.user_id)})));
  if(profiles.error)setError(profiles.error.message);
  setLoading(false);
 }
 useEffect(()=>{load();},[workspace?.id]);
 async function invite(e){
  e.preventDefault();if(!email.trim())return;setBusy(true);setError('');
  try{const {data}=await supabase.auth.getSession();const response=await fetch('/api/workspace/team',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({workspaceId:workspace.id,email:email.trim(),role})});const body=await response.json();if(!response.ok)throw new Error(body.error||'Invitation failed.');notify(body.message||'Invitation sent.');setEmail('');await load();}
  catch(e){setError(e.message||'Invitation failed.');}finally{setBusy(false);}
 }
 async function changeRole(member,nextRole){
  if(member.user_id===currentUser?.id&&nextRole!=='admin'){setError('You cannot remove your own admin role.');return;}
  const {error}=await supabase.from('workspace_memberships').update({role:nextRole}).eq('workspace_id',workspace.id).eq('user_id',member.user_id);
  if(error)setError(error.message);else{notify('Member role updated.');await load();}
 }
 async function remove(member){
  if(member.user_id===currentUser?.id)return;
  if(!window.confirm('Remove '+(member.profile?.email||member.user_id)+' from this workspace?'))return;
  const {error}=await supabase.from('workspace_memberships').delete().eq('workspace_id',workspace.id).eq('user_id',member.user_id);
  if(error)setError(error.message);else{notify('Team member removed.');await load();}
 }
 return <>
  <Header eyebrow="WORKSPACE COLLABORATION" title="Team Management" description="Invite colleagues, assign workspace roles and manage member access."/>
  {!isAdmin?<div className="compliance"><ShieldCheck size={16}/><div><b>Administrator access required</b><span>Only workspace admins can manage team membership and roles.</span></div></div>:<>
   <section className="panel"><div className="panel-head"><div><h2>Invite team member</h2><p>Send an email invitation to join this workspace.</p></div></div><form onSubmit={invite} style={{padding:'0 20px 20px',display:'flex',gap:10,flexWrap:'wrap'}}><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@company.com" style={{height:36,minWidth:220,flex:'1 1 240px',border:'1px solid #e1e6ed',borderRadius:7,padding:'0 11px'}}/><select value={role} onChange={e=>setRole(e.target.value)} style={{height:36,border:'1px solid #e1e6ed',borderRadius:7,padding:'0 10px'}}><option value="user">Member</option><option value="admin">Admin</option></select><button className="button primary" disabled={busy}><UserPlus size={15}/>{busy?'Sending…':'Invite member'}</button></form></section>
   {error&&<div className="auth-error" style={{marginTop:14}}><AlertCircle size={14}/>{error}</div>}
   <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Workspace members</h2><p>{members.length} people currently have workspace access.</p></div><button className="button light" onClick={load} disabled={loading}><RefreshCw size={14}/> Refresh</button></div><div className="table-scroll"><table><thead><tr><th>MEMBER</th><th>ROLE</th><th>JOINED</th><th>ACCESS</th></tr></thead><tbody>{members.map(member=><tr key={member.id}><td><b>{member.profile?.full_name||member.profile?.email||member.user_id}</b><small style={{display:'block',color:'#8994a5'}}>{member.profile?.email||member.user_id}</small></td><td><select value={member.role} disabled={member.user_id===currentUser?.id} onChange={e=>changeRole(member,e.target.value)}><option value="user">Member</option><option value="admin">Admin</option></select></td><td>{new Date(member.created_at).toLocaleDateString('en-IN')}</td><td>{member.user_id===currentUser?.id?'You · cannot remove':<button className="more" onClick={()=>remove(member)}>Remove access</button>}</td></tr>)}{!members.length&&<tr><td colSpan="4" style={{padding:24,textAlign:'center'}}>{loading?'Loading team…':'No members found.'}</td></tr>}</tbody></table></div></section>
  </>}
 </>;
}
