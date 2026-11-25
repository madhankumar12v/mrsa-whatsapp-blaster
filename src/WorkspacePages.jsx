import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { Activity, ArrowDownToLine, Check, Clock3, Copy, FileText, Megaphone, MessageCircle, Plus, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';

const starterTemplates = [
  { name: 'Welcome message', category: 'Customer care', body: 'Hello {{name}}, welcome! Thank you for connecting with us. How can we help you today?' },
  { name: 'Order update', category: 'Updates', body: 'Hello {{name}}, your order update is ready. Please contact our team if you need any assistance.' },
  { name: 'Appointment reminder', category: 'Reminders', body: 'Hello {{name}}, this is a friendly reminder about your upcoming appointment. Reply if you need to reschedule.' },
  { name: 'Thank you', category: 'Customer care', body: 'Hello {{name}}, thank you for choosing us. We appreciate your support!' }
];

function PageHead({ eyebrow, title, description, action }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="head-actions">{action}</div>}</div>;
}
function Stat({ label, value, note, icon: Icon }) {
  return <div className="stat"><div className="stat-label">{label}<span className="stat-icon blue"><Icon size={17}/></span></div><strong>{value}</strong><small>{note}</small></div>;
}
function readDrafts() {
  try { return JSON.parse(localStorage.getItem('mrsa-campaign-drafts-v1') || '[]'); } catch { return []; }
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
      const firstFailure=body.results?.find(item=>!item.sent); notify('WhatsApp send completed: '+body.sent+' sent, '+body.failed+' failed.'+(firstFailure?' First issue: '+firstFailure.reason:''));
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
      <Stat label="Messages sent" value="0" note="WhatsApp API not connected" icon={MessageCircle}/>
    </section>
    <section className="panel" style={{padding:20,marginBottom:18}}>
      <div className="panel-head" style={{padding:'0 0 16px'}}><div><h2>Send an approved WhatsApp template</h2><p>Live sending uses Meta Cloud API. Only recorded opted-in Supabase contacts are eligible.</p></div></div>
      <div style={{display:'grid',gap:12,maxWidth:720}}>
        <label className="module-label">Campaign category<select value={campaignCategory} onChange={e=>setCampaignCategory(e.target.value)}><option value="marketing">Marketing / Promotional</option><option value="utility">Utility / Transactional</option></select></label>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
          <label className="module-label" style={{flex:1,minWidth:260}}>Meta-approved template
            <select value={templateName + '|' + templateLanguage} onChange={e=>{
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
    <div className="compliance"><Activity size={17}/><div><b>Sending is not enabled yet</b><span>Connect and configure the official WhatsApp Business Platform before sending real campaigns. Never message contacts without valid consent.</span></div></div>
  </>;
}

export function TemplatesPage({ notify, workspace }) {
  const [selected, setSelected] = useState(starterTemplates[0].name);
  const [metaTemplates, setMetaTemplates] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const current = starterTemplates.find(item => item.name === selected) || starterTemplates[0];

  async function syncMetaTemplates() {
    if (!workspace?.id) return;
    setSyncing(true); setSyncError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch('/api/whatsapp/templates?workspaceId=' + encodeURIComponent(workspace.id), { headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Meta templates could not be loaded.');
      setMetaTemplates(Array.isArray(body.templates) ? body.templates : []);
    } catch (error) { setSyncError(error.message || 'Meta templates could not be loaded.'); }
    finally { setSyncing(false); }
  }

  useEffect(() => { syncMetaTemplates(); }, [workspace?.id]);
  async function copy() {
    try { await navigator.clipboard.writeText(current.body); notify('Template copied.'); }
    catch { notify('Copy is unavailable in this browser.'); }
  }
  return <>
    <PageHead eyebrow="MESSAGE LIBRARY" title="Templates" description="Sync approved WhatsApp templates from Meta and browse starter message examples."/>
    <section className="panel" style={{marginBottom:18}}><div className="panel-head"><div><h2>Meta WhatsApp templates</h2><p>Live templates retrieved securely from the connected WhatsApp Business Account.</p></div><button className="button light" onClick={syncMetaTemplates} disabled={syncing}><RefreshCw size={14}/>{syncing?'Syncing…':'Sync from Meta'}</button></div>
      {syncError&&<p style={{padding:'0 20px',fontSize:12,color:'#b45309'}}>{syncError}</p>}
      <div className="table-scroll"><table><thead><tr><th>TEMPLATE NAME</th><th>CATEGORY</th><th>LANGUAGE</th><th>STATUS</th><th>QUALITY</th></tr></thead><tbody>
        {metaTemplates.map(item=><tr key={item.name+'|'+item.language}><td><b>{item.name}</b></td><td>{item.category||'—'}</td><td>{item.language||'—'}</td><td><span className={'status '+(item.status==='APPROVED'?'active':'pending')}>{item.status||'Unknown'}</span></td><td>{item.quality||'—'}</td></tr>)}
      </tbody></table>{metaTemplates.length===0&&!syncing&&<div className="empty"><MessageCircle size={25}/><b>No Meta templates loaded</b><span>Use Sync from Meta to retrieve templates for this WhatsApp Business Account.</span></div>}</div>
      <div style={{padding:'0 20px 16px',fontSize:12,color:'#68778c'}}>{metaTemplates.length} templates · {metaTemplates.filter(item=>item.status==='APPROVED').length} approved · only approved Marketing and Utility templates can be sent from Campaigns.</div>
    </section>
    <section className="panel"><div className="panel-head"><div><h2>Starter templates</h2><p>Examples for drafting. These are not approved WhatsApp API templates.</p></div><span className="count">{starterTemplates.length} templates</span></div>
      <div className="module-grid">{starterTemplates.map(item=><button key={item.name} className="stat template-card" onClick={()=>setSelected(item.name)} aria-pressed={selected===item.name}><div className="stat-label">{item.category}<MessageCircle size={16}/></div><strong>{item.name}</strong><small>{item.body}</small></button>)}</div>
    </section>
    <section className="panel" style={{marginTop:18,padding:20}}><div className="panel-head" style={{padding:'0 0 12px'}}><div><h2>{current.name} preview</h2><p>Use the copy button to adapt this text for your business.</p></div></div><div className="template-preview">{current.body}</div><button className="button primary" style={{marginTop:14}} onClick={copy}><Copy size={15}/> Copy template</button></section>
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
