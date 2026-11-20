import React, { useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { Activity, ArrowDownToLine, Check, Clock3, Copy, FileText, Megaphone, MessageCircle, Plus, ShieldCheck, Users, X } from 'lucide-react';

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
  const [drafts, setDrafts] = useState(readDrafts);
  const eligibleContacts = contacts.filter(c => c.consent === 'Opted in' && c.consentAt && c.source && c.consentEvidence && /^[0-9a-f-]{36}$/i.test(String(c.id)));
  const eligible = eligibleContacts.length;
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [sending, setSending] = useState(false);
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
      const response = await fetch('/api/whatsapp/send', { method:'POST', headers:{'content-type':'application/json',Authorization:'Bearer '+token}, body:JSON.stringify({workspaceId:workspace.id,contactIds:targets.map(c=>c.id),templateName:templateName.trim(),language:templateLanguage.trim()}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Campaign request failed.');
      notify('WhatsApp send completed: '+body.sent+' sent, '+body.failed+' failed.');
    } catch (error) { notify(error.message || 'WhatsApp send failed.'); }
    finally { setSending(false); }
  }
  function saveDraft(event) {
    event.preventDefault();
    const next = [{ id: Date.now(), name: name.trim(), message: message.trim(), audience: eligible, created: new Date().toISOString(), status: 'Draft' }, ...drafts];
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
        <label className="module-label">Approved Meta template name<input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="e.g. november_customer_update"/></label>
        <label className="module-label">Template language code<input value={templateLanguage} onChange={e=>setTemplateLanguage(e.target.value)} placeholder="en_US"/></label>
        <div className="compliance" style={{margin:0}}><ShieldCheck size={17}/><div><b>{eligible} eligible contacts</b><span>Only contacts with opt-in status, timestamp, source and evidence. Maximum 50 recipients per send.</span></div></div>
        <div><button className="button primary" type="button" disabled={sending || !eligible} onClick={sendApprovedTemplate}><MessageCircle size={15}/>{sending?'Sending…':'Send live WhatsApp campaign'}</button></div>
      </div>
    </section>
    <section className="panel" style={{padding:20}}>
      <div className="panel-head" style={{padding:'0 0 16px'}}><div><h2>Create campaign draft</h2><p>Draft only. No WhatsApp messages will be sent from this page.</p></div></div>
      <form onSubmit={saveDraft} style={{display:'grid',gap:12,maxWidth:720}}>
        <label className="module-label">Campaign name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. November customer update"/></label>
        <label className="module-label">Message<textarea required rows="5" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write your WhatsApp message..."/></label>
        <div className="compliance" style={{margin:0}}><ShieldCheck size={17}/><div><b>Consent protection</b><span>Only {eligible} opted-in contacts are eligible. Pending and opted-out contacts are excluded.</span></div></div>
        <div><button className="button primary" type="submit"><Plus size={15}/> Save campaign draft</button></div>
      </form>
    </section>
    <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Saved campaign drafts</h2><p>Drafts stored on this device.</p></div><span className="count">{drafts.length} drafts</span></div>
      <div className="table-scroll"><table><thead><tr><th>CAMPAIGN</th><th>ELIGIBLE AUDIENCE</th><th>CREATED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {drafts.map(item=><tr key={item.id}><td><b>{item.name}</b></td><td>{item.audience}</td><td>{new Date(item.created).toLocaleDateString('en-IN')}</td><td><span className="status pending">Draft</span></td><td><button className="more" onClick={()=>{setName(item.name);setMessage(item.message);window.scrollTo({top:0,behavior:'smooth'});}}>Edit</button><button className="more" onClick={()=>removeDraft(item.id)}>Delete</button></td></tr>)}
      </tbody></table>{drafts.length===0&&<div className="empty"><Megaphone size={25}/><b>No campaign drafts</b><span>Create a draft above to get started.</span></div>}</div>
    </section>
    <div className="compliance"><Activity size={17}/><div><b>Sending is not enabled yet</b><span>Connect and configure the official WhatsApp Business Platform before sending real campaigns. Never message contacts without valid consent.</span></div></div>
  </>;
}

export function TemplatesPage({ notify }) {
  const [selected, setSelected] = useState(starterTemplates[0].name);
  const current = starterTemplates.find(item => item.name === selected) || starterTemplates[0];
  async function copy() {
    try { await navigator.clipboard.writeText(current.body); notify('Template copied.'); }
    catch { notify('Copy is unavailable in this browser.'); }
  }
  return <>
    <PageHead eyebrow="MESSAGE LIBRARY" title="Templates" description="Browse starter messages and copy a template to customize."/>
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
    <div className="compliance"><ShieldCheck size={17}/><div><b>Report scope</b><span>These figures reflect contact records currently stored in this browser. They are not platform-wide Supabase analytics.</span></div></div>
  </>;
}

export function SettingsPage({ currentUser, workspace }) {
  return <>
    <PageHead eyebrow="WORKSPACE PREFERENCES" title="Settings" description="View your workspace and account information."/>
    <section className="panel" style={{maxWidth:850}}><div className="panel-head"><div><h2>Workspace information</h2><p>Current workspace identity and account access.</p></div></div><div className="settings-grid">
      <div><small>Workspace name</small><b>{workspace?.name || '—'}</b></div><div><small>Signed-in account</small><b>{currentUser?.email || '—'}</b></div><div><small>Account role</small><b>{currentUser?.role || '—'}</b></div><div><small>Subscription status</small><b>{workspace?.subscriptionStatus || '—'}</b></div>
    </div></section>
    <section className="panel" style={{maxWidth:850,marginTop:18}}><div className="panel-head"><div><h2>Data & privacy</h2><p>Where your workspace data is currently stored.</p></div></div><div style={{padding:'0 20px 20px',fontSize:12,color:'#68778c',lineHeight:1.8}}>Contacts and campaign drafts are currently stored in this browser on this device. They are not yet synchronized across team members or devices. Supabase synchronization is a separate implementation step.</div></section>
  </>;
}
