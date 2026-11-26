import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { Activity, ArrowDownToLine, Check, Clock3, Megaphone, MessageCircle, Plus, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';

function PageHead({ eyebrow, title, description, action }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="head-actions">{action}</div>}</div>;
}
function Stat({ label, value, note, icon: Icon }) {
  return <div className="stat"><div className="stat-label">{label}<span className="stat-icon blue"><Icon size={17}/></span></div><strong>{value}</strong><small>{note}</small></div>;
}
function readDrafts() {
  try { return JSON.parse(localStorage.getItem('mrsa-campaign-drafts-v1') || '[]'); } catch { return []; }
}
function readLastSend() {
  try { return JSON.parse(localStorage.getItem('mrsa-last-send-v1') || 'null'); } catch { return null; }
}

export function CampaignsPage({ contacts, notify, workspace }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [campaignCategory, setCampaignCategory] = useState('marketing');
  const [drafts, setDrafts] = useState(readDrafts);
  const eligibleContacts = contacts.filter(c => c.consent === 'Opted in' && c.consentAt && c.source && c.consentEvidence && ['marketing','utility','all'].includes(c.consentScope) && (c.consentScope === 'all' || c.consentScope === campaignCategory) && /^[0-9a-f-]{36}$/i.test(String(c.id)));
  const eligible = eligibleContacts.length;
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [templateParameters, setTemplateParameters] = useState('');
  const [metaTemplates, setMetaTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSend, setLastSend] = useState(readLastSend);
  const [deliveryLogs, setDeliveryLogs] = useState([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');

  async function loadDeliveryHistory() {
    if (!workspace?.id) { setDeliveryLogs([]); return; }
    setDeliveryLoading(true); setDeliveryError('');
    const { data, error } = await supabase
      .from('whatsapp_message_logs')
      .select('id,recipient_phone,template_name,status,status_updated_at,created_at,meta_message_id,error_message,meta_error_code,meta_error_details')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setDeliveryError(error.message || 'Delivery history could not be loaded.');
    } else {
      setDeliveryLogs(Array.isArray(data) ? data : []);
    }
    setDeliveryLoading(false);
  }

  useEffect(() => { loadDeliveryHistory(); }, [workspace?.id]);

  async function syncMetaTemplates() {
    if (!workspace?.id) return;
    setTemplatesLoading(true); setTemplatesError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch('/api/whatsapp/templates?workspaceId=' + encodeURIComponent(workspace.id), {
        headers: { Authorization: 'Bearer ' + token }
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Meta templates could not be loaded.');
      const templates = Array.isArray(body.templates) ? body.templates : [];
      setMetaTemplates(templates);
      const firstApproved = templates.find(item => item.status === 'APPROVED' && ['marketing','utility'].includes(item.category));
      if (firstApproved && !templates.some(item => item.name === templateName && item.language === templateLanguage && item.status === 'APPROVED')) {
        setTemplateName(firstApproved.name);
        setTemplateLanguage(firstApproved.language || 'en_US');
        setCampaignCategory(firstApproved.category);
      }
    } catch (error) {
      setTemplatesError(error.message || 'Meta templates could not be loaded.');
    } finally { setTemplatesLoading(false); }
  }

  useEffect(() => { syncMetaTemplates(); }, [workspace?.id]);
  async function sendApprovedTemplate() {
    if (!workspace?.id || !templateName.trim()) { notify('Enter your exact approved Meta template name.'); return; }
    if (!eligibleContacts.length) { notify('No contacts have complete, recorded opt-in evidence in Supabase.'); return; }
    const targets = eligibleContacts.slice(0, 50);
    if (!window.confirm('Send the approved template “' + templateName.trim() + '” to ' + targets.length + ' opted-in contacts now? This will send real WhatsApp messages.')) return;
    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch('/api/whatsapp/send', { method:'POST', headers:{'content-type':'application/json',Authorization:'Bearer '+token}, body:JSON.stringify({workspaceId:workspace.id,contactIds:targets.map(c=>c.id),templateName:templateName.trim(),language:templateLanguage.trim(),campaignCategory,parameters:templateParameters.trim()?templateParameters.split('|').map(value=>value.trim()):[]}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Campaign request failed.');
      const contactById = new Map(targets.map(contact => [contact.id, contact]));
      const results = (Array.isArray(body.results) ? body.results : []).map(item => {
        const contact = contactById.get(item.contactId);
        return { ...item, contactName: contact?.name || item.contactName || 'Contact record', phone: contact?.phone || item.phone || '' };
      });
      const report = { createdAt: new Date().toISOString(), templateName: templateName.trim(), language: templateLanguage.trim(), requested: body.requested ?? targets.length, sent: body.sent ?? 0, failed: body.failed ?? 0, results };
      setLastSend(report); localStorage.setItem('mrsa-last-send-v1', JSON.stringify(report));
      const firstFailure=report.results.find(item=>!item.sent); notify('WhatsApp send completed: '+report.sent+' accepted by Meta, '+report.failed+' failed.'+(firstFailure?' First issue: '+firstFailure.reason:''));
    } catch (error) { notify(error.message || 'WhatsApp send failed.'); }
    finally { setSending(false); }
  }
  function saveDraft(event) {
    event.preventDefault();
    const next = [{ id: Date.now(), name: name.trim(), message: message.trim(), category: campaignCategory, audience: eligible, created: new Date().toISOString(), status: 'Draft' }, ...drafts];
    setDrafts(next); localStorage.setItem('mrsa-campaign-drafts-v1', JSON.stringify(next));
    setName(''); setMessage(''); notify('Campaign draft saved.');
  }
  function removeDraft(id) {
    const next = drafts.filter(item => item.id !== id);
    setDrafts(next); localStorage.setItem('mrsa-campaign-drafts-v1', JSON.stringify(next));
  }
  return <>
    <PageHead eyebrow="MESSAGE BROADCASTS" title="Campaigns" description="Create and organize WhatsApp campaign drafts for opted-in contacts."/>
    <section className="stats">
      <Stat label="Campaign drafts" value={drafts.length} note="Saved in this browser" icon={Megaphone}/>
      <Stat label="Eligible contacts" value={eligible} note="Explicitly opted in only" icon={Users}/>
      <Stat label="Excluded contacts" value={contacts.length - eligible} note="Pending and opted-out" icon={ShieldCheck}/>
      <Stat label="Last run accepted" value={lastSend ? lastSend.sent : '—'} note={lastSend ? 'Accepted by Meta · not delivery-confirmed' : 'No send results yet'} icon={MessageCircle}/>
    </section>
    <section className="panel" style={{padding:20,marginBottom:18}}>
      <div className="panel-head" style={{padding:'0 0 16px'}}><div><h2>Send an approved WhatsApp template</h2><p>Live sending uses Meta Cloud API. Only recorded opted-in Supabase contacts are eligible.</p></div></div>
      <div style={{display:'grid',gap:12,maxWidth:720}}>
        <label className="module-label">Campaign category<select value={campaignCategory} onChange={e=>setCampaignCategory(e.target.value)}><option value="marketing">Marketing / Promotional</option><option value="utility">Utility / Transactional</option></select></label>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <label className="module-label" style={{flex:1,minWidth:260}}>Meta-approved template
            <select value={templateName ? templateName + '|' + templateLanguage : '|'} onChange={e=>{
              const chosen=metaTemplates.find(item=>item.name+'|'+item.language===e.target.value);
              if(chosen){setTemplateName(chosen.name);setTemplateLanguage(chosen.language || 'en_US');setCampaignCategory(chosen.category);}
            }}>
              <option value="|">Choose a synced approved template</option>
              {metaTemplates.filter(item=>item.status==='APPROVED' && ['marketing','utility'].includes(item.category)).map(item=><option key={item.name+'|'+item.language} value={item.name+'|'+item.language}>{item.name} · {item.category} · {item.language}</option>)}
            </select>
          </label>
          <button className="button light" type="button" onClick={syncMetaTemplates} disabled={templatesLoading}><RefreshCw size={14}/>{templatesLoading?'Syncing…':'Sync from Meta'}</button>
        </div>
        {templatesError&&<p style={{fontSize:12,color:'#b45309',margin:0}}>{templatesError}</p>}
        <small style={{color:'#68778c'}}>{metaTemplates.length} templates found · {metaTemplates.filter(item=>item.status==='APPROVED').length} approved and sendable. Active/quality-pending in WhatsApp Manager should appear as APPROVED in the API when eligible.</small>
        <label className="module-label">Template language code<input value={templateLanguage} readOnly/></label>
        <label className="module-label">Template body parameters (optional, in order)<input value={templateParameters} onChange={e=>setTemplateParameters(e.target.value)} placeholder="Example: Arun Kumar|Order 123"/></label><small style={{color:"#68778c"}}>Leave blank for templates without variables. Separate body values with a vertical bar (|).</small>
        <div className="compliance" style={{margin:0}}><ShieldCheck size={17}/><div><b>{eligible} eligible contacts</b><span>Only contacts with complete opt-in evidence and {campaignCategory} consent (or All scope). Maximum 50 recipients per send.</span></div></div>
        <div><button className="button primary" type="button" disabled={sending || !eligible || !templateName || !metaTemplates.some(item=>item.name===templateName&&item.language===templateLanguage&&item.status==='APPROVED')} onClick={sendApprovedTemplate}><MessageCircle size={15}/>{sending?'Sending…':'Send live WhatsApp campaign'}</button></div>
      </div>
    </section>
    <section className="panel" style={{marginBottom:18}}>
      <div className="panel-head">
        <div><h2>WhatsApp delivery dashboard</h2><p>Latest 100 message attempts saved in this workspace. Delivery status updates arrive through Meta webhooks.</p></div>
        <button className="button light" type="button" onClick={loadDeliveryHistory} disabled={deliveryLoading}><RefreshCw size={14}/>{deliveryLoading?'Refreshing…':'Refresh status'}</button>
      </div>
      <div className="stats" style={{padding:'0 20px 18px'}}>
        <Stat label="Total attempts" value={deliveryLogs.length} note="Saved message logs" icon={Activity}/>
        <Stat label="Delivered" value={deliveryLogs.filter(x=>x.status==='delivered').length} note="Confirmed by WhatsApp" icon={Check}/>
        <Stat label="Read" value={deliveryLogs.filter(x=>x.status==='read').length} note="Read receipt received" icon={MessageCircle}/>
        <Stat label="Failed" value={deliveryLogs.filter(x=>x.status==='failed').length} note="Meta send or delivery failure" icon={X}/>
      </div>
      {deliveryError && <div style={{padding:'0 20px 16px',fontSize:12,color:'#b45309'}}>Could not load delivery history: {deliveryError}. If this mentions a missing column, apply the new Supabase migration first.</div>}
      <div className="table-scroll"><table><thead><tr><th>PHONE NUMBER</th><th>TEMPLATE</th><th>STATUS</th><th>DETAILS</th><th>LAST UPDATE</th><th>META MESSAGE ID</th></tr></thead><tbody>
        {deliveryLogs.map(item=><tr key={item.id}>
          <td><b>{item.recipient_phone || '—'}</b></td>
          <td>{item.template_name || '—'}</td>
          <td><span className={'status '+(['delivered','read'].includes(item.status)?'active':item.status==='failed'?'pending':'')}>{String(item.status || 'unknown').replaceAll('_',' ').toUpperCase()}</span></td>
          <td>{item.error_message || (item.status==='accepted'?'Accepted by Meta; delivery not yet confirmed.':item.status==='sent'?'Sent to WhatsApp; waiting for delivery confirmation.':item.status==='delivered'?'Delivered to recipient.':item.status==='read'?'Read receipt received.':'—')}{item.meta_error_code?' (Code: '+item.meta_error_code+')':''}{item.meta_error_details?' · '+item.meta_error_details:''}</td>
          <td>{new Date(item.status_updated_at || item.created_at).toLocaleString('en-IN')}</td>
          <td><small>{item.meta_message_id || '—'}</small></td>
        </tr>)}
      </tbody></table>{!deliveryLoading&&!deliveryError&&deliveryLogs.length===0&&<div className="empty"><MessageCircle size={25}/><b>No WhatsApp delivery records yet</b><span>After a campaign attempt, each saved result will appear here.</span></div>}</div>
      <div style={{padding:'0 20px 16px',fontSize:12,color:'#68778c'}}>“Accepted” is not a delivery confirmation. “Delivered” and “Read” are confirmed by status webhooks. Failed attempts show the Meta error where available.</div>
    </section>
    {lastSend && <section className="panel" style={{marginBottom:18}}>
      <div className="panel-head"><div><h2>Last WhatsApp send results</h2><p>{lastSend.templateName} · {lastSend.language} · {new Date(lastSend.createdAt).toLocaleString('en-IN')} · {lastSend.requested} requested</p></div><span className="count">{lastSend.sent} accepted · {lastSend.failed} failed</span></div>
      <div className="table-scroll"><table><thead><tr><th>CONTACT</th><th>PHONE</th><th>RESULT</th><th>DETAILS</th><th>META MESSAGE ID</th></tr></thead><tbody>
        {lastSend.results.map((item,index)=>{const contact=contacts.find(c=>c.id===item.contactId);return <tr key={item.contactId||index}><td><b>{item.contactName || contact?.name || 'Contact record'}</b></td><td>{item.phone || contact?.phone || '—'}</td><td><span className={'status '+(item.sent?'active':'pending')}>{item.sent?'Accepted by Meta':'Failed'}</span></td><td>{item.sent?'Message request accepted by Meta. Delivery status is not confirmed yet.':(item.reason || 'Meta rejected this message.')}</td><td><small>{item.messageId || '—'}</small></td></tr>;})}
      </tbody></table></div>
      <div style={{padding:'0 20px 16px',fontSize:12,color:'#68778c'}}>“Accepted by Meta” means the API accepted the message request; it does not prove delivery or reading. Final delivery requires a WhatsApp status webhook.</div>
    </section>}
    <section className="panel" style={{padding:20}}>
      <div className="panel-head" style={{padding:'0 0 16px'}}><div><h2>Create campaign draft</h2><p>Draft only. No WhatsApp messages will be sent from this page.</p></div></div>
      <form onSubmit={saveDraft} style={{display:'grid',gap:12,maxWidth:720}}>
        <label className="module-label">Campaign name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. November customer update"/></label>
        <label className="module-label">Message<textarea required rows="5" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write your WhatsApp message..."/></label>
        <div className="compliance" style={{margin:0}}><ShieldCheck size={17}/><div><b>Consent protection</b><span>Only {eligible} contacts with matching {campaignCategory} consent are eligible. Pending, opted-out and other-category contacts are excluded.</span></div></div>
        <div><button className="button primary" type="submit"><Plus size={15}/> Save campaign draft</button></div>
      </form>
    </section>
    <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Saved campaign drafts</h2><p>Drafts stored on this device.</p></div><span className="count">{drafts.length} drafts</span></div>
      <div className="table-scroll"><table><thead><tr><th>CAMPAIGN</th><th>ELIGIBLE AUDIENCE</th><th>CREATED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {drafts.map(item=><tr key={item.id}><td><b>{item.name}</b></td><td>{item.audience} ({item.category || 'Unspecified'})</td><td>{new Date(item.created).toLocaleDateString('en-IN')}</td><td><span className="status pending">Draft</span></td><td><button className="more" onClick={()=>{setName(item.name);setMessage(item.message);window.scrollTo({top:0,behavior:'smooth'});}}>Edit</button><button className="more" onClick={()=>removeDraft(item.id)}>Delete</button></td></tr>)}
      </tbody></table>{drafts.length===0&&<div className="empty"><Megaphone size={25}/><b>No campaign drafts</b><span>Create a draft above to get started.</span></div>}</div>
    </section>
    <div className="compliance"><Activity size={17}/><div><b>WhatsApp sending status</b><span>Live API requests are enabled. This page shows the latest per-contact API result; use Meta delivery-status webhooks to confirm delivered, read or undelivered states. Continue messaging only contacts with valid consent.</span></div></div>
  </>;
}

export function ReportsPage({ contacts, exportCsv }) {
  const optedIn = contacts.filter(c=>c.consent==='Opted in').length;
  const pending = contacts.filter(c=>c.consent==='Pending').length;
  const optedOut = contacts.filter(c=>c.consent==='Opted out').length;
  const rows = [{label:'Opted in',value:optedIn,color:'#20b982'},{label:'Pending',value:pending,color:'#d69b43'},{label:'Opted out',value:optedOut,color:'#d36c65'}];
  return <>
    <PageHead eyebrow="WORKSPACE ANALYTICS" title="Reports" description="Review your audience size and messaging consent." action={<button className="button light" onClick={exportCsv}><ArrowDownToLine size={15}/> Export contacts report</button>}/>
    <section className="stats"><Stat label="Total audience" value={contacts.length} note="Current contact records" icon={Users}/><Stat label="Opted in" value={optedIn} note="Eligible for campaigns" icon={ShieldCheck}/><Stat label="Pending consent" value={pending} note="Do not message" icon={Clock3}/><Stat label="Opted out" value={optedOut} note="Excluded from campaigns" icon={X}/></section>
    <section className="panel"><div className="panel-head"><div><h2>Consent breakdown</h2><p>Contact records grouped by consent status.</p></div></div><div style={{padding:20,display:'grid',gap:17}}>{rows.map(row=><div key={row.label}><div className="report-row"><b>{row.label}</b><span>{row.value} ({contacts.length?Math.round(row.value/contacts.length*100):0}%)</span></div><div className="report-track"><div style={{width:(contacts.length?row.value/contacts.length*100:0)+'%',background:row.color}}/></div></div>)}</div></section>
    <div className="compliance"><ShieldCheck size={17}/><div><b>Report scope</b><span>These figures reflect the contacts loaded from this Supabase workspace. Campaign drafts remain stored in this browser.</span></div></div>
  </>;
}

export function SettingsPage({ currentUser, workspace }) {
  return <>
    <PageHead eyebrow="WORKSPACE PREFERENCES" title="Settings" description="View your workspace and account information."/>
    <section className="panel" style={{maxWidth:850}}><div className="panel-head"><div><h2>Workspace information</h2><p>Current workspace identity and account access.</p></div></div><div className="settings-grid">
      <div><small>Workspace name</small><b>{workspace?.name || '—'}</b></div><div><small>Signed-in account</small><b>{currentUser?.email || '—'}</b></div><div><small>Account role</small><b>{currentUser?.role || '—'}</b></div><div><small>Subscription status</small><b>{workspace?.subscriptionStatus || '—'}</b></div>
    </div></section>
    <section className="panel" style={{maxWidth:850,marginTop:18}}><div className="panel-head"><div><h2>Data & privacy</h2><p>Where your workspace data is currently stored.</p></div></div><div style={{padding:'0 20px 20px',fontSize:12,color:'#68778c',lineHeight:1.8}}>Contacts are synchronized to the workspace in Supabase. Campaign drafts remain saved locally in this browser and are not yet shared across team members or devices.</div></section>
  </>;
}
