import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { CreditCard } from 'lucide-react';
import Billing from './Billing.jsx';
import { CampaignsPage, TemplatesPage, ReportsPage, SettingsPage } from './WorkspacePages.jsx';
import WhatsAppPlatformPage from './WhatsAppPlatform.jsx';
import { Activity, ArrowDownToLine, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, ContactRound, FileSpreadsheet, Filter, Grid2X2, LayoutDashboard, Megaphone, MessageCircle, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Upload, Users, X, Zap, LogOut } from 'lucide-react';

const nav = [{name:'Overview',icon:LayoutDashboard},{name:'Contacts',icon:ContactRound},{name:'Campaigns',icon:Megaphone},{name:'Templates',icon:MessageCircle},{name:'Reports',icon:Activity},{name:'Billing',icon:CreditCard}];
const cleanPhone = value => String(value || '').replace(/[\\s()-]/g,'');

function loadContacts(){
  try { const raw=localStorage.getItem('mrsa-contacts-v1'); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}

function mapContact(row){
  return { id:row.id, name:row.full_name, phone:row.phone, group:row.group_name || 'Customers', consent:row.consent_status==='opted_in'?'Opted in':row.consent_status==='opted_out'?'Opted out':'Pending', source:row.consent_source || '', consentEvidence:row.consent_evidence || '', consentScope:row.consent_scope || '', consentAt:row.consent_at || null, optedOutAt:row.opted_out_at || null, updated:row.updated_at ? new Date(row.updated_at).toLocaleDateString('en-IN') : 'Saved' };
}

export default function App({currentUser,onLogout,workspace}){
  const [page,setPage]=useState('Overview');
  const [contacts,setContacts]=useState([]);
  const [contactsLoading,setContactsLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState('All groups');
  const [status,setStatus]=useState('All consent');
  const [selected,setSelected]=useState([]);
  const [modal,setModal]=useState(false);
  const [editingContact,setEditingContact]=useState(null);
  const [toast,setToast]=useState('');
  const [form,setForm]=useState({name:'',phone:'',group:'Customers',consent:'Pending',consentSource:'',consentEvidence:'',consentScope:'',consentAt:''});
  const fileRef=useRef(null);
  const save=items=>{setContacts(items);localStorage.setItem('mrsa-contacts-v1',JSON.stringify(items));};
  useEffect(()=>{
    let alive=true;
    async function loadWorkspaceContacts(){
      if(!workspace?.id){setContacts([]);setContactsLoading(false);return;}
      setContactsLoading(true);
      const {data,error}=await supabase.from('contacts').select('id,full_name,phone,group_name,consent_status,consent_source,consent_evidence,consent_scope,consent_at,opted_out_at,updated_at').eq('workspace_id',workspace.id).order('created_at',{ascending:false}).limit(2000);
      if(!alive)return;
      if(error){notify('Contacts could not be loaded from Supabase: '+error.message);setContacts([]);}
      else {const rows=(data||[]).map(mapContact);setContacts(rows);localStorage.setItem('mrsa-contacts-v1',JSON.stringify(rows));}
      setContactsLoading(false);
    }
    loadWorkspaceContacts();
    return ()=>{alive=false;};
  },[workspace?.id]);
  const groups=['All groups',...new Set(contacts.map(c=>c.group))];
  const visible=useMemo(()=>contacts.filter(c=>
    [c.name,c.phone,c.group].join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (group==='All groups'||c.group===group) && (status==='All consent'||c.consent===status)
  ),[contacts,query,group,status]);
  const optedIn=contacts.filter(c=>c.consent==='Opted in'&&c.consentAt&&c.source&&c.consentEvidence&&['marketing','utility','all'].includes(c.consentScope)).length;
  const optedOut=contacts.filter(c=>c.consent==='Opted out').length;
  const notify=message=>{setToast(message);window.clearTimeout(notify.timer);notify.timer=window.setTimeout(()=>setToast(''),4000);};

  async function markOptOut(contact){
    if(contact.consent==='Opted out')return;
    if(!window.confirm('Record that '+contact.name+' has opted out of WhatsApp messages? Future campaign sends will be blocked.'))return;
    const {data,error}=await supabase.from('contacts').update({consent_status:'opted_out',opted_out_at:new Date().toISOString(),opt_out_source:'Workspace Admin recorded customer opt-out'}).eq('id',contact.id).eq('workspace_id',workspace.id).select('id,full_name,phone,group_name,consent_status,consent_source,consent_evidence,consent_scope,consent_at,opted_out_at,updated_at').single();
    if(error){notify('Could not record opt-out: '+error.message);return;}
    save(contacts.map(item=>item.id===contact.id?mapContact(data):item));
    notify('Opt-out recorded. This contact is now blocked from campaigns.');
  }

  function openConsentEditor(contact){
    setEditingContact(contact);
    setForm({name:contact.name,phone:contact.phone,group:contact.group,consent:contact.consent,consentSource:contact.source==='—'?'':contact.source,consentEvidence:contact.consentEvidence||'',consentScope:contact.consentScope||'',consentAt:contact.consentAt?new Date(contact.consentAt).toISOString().slice(0,10):''});
    setModal(true);
  }

  function resetContactForm(){
    setForm({name:'',phone:'',group:'Customers',consent:'Pending',consentSource:'',consentEvidence:'',consentScope:'',consentAt:''});
    setEditingContact(null);
  }

  async function addContact(e){
    e.preventDefault();
    const phone=cleanPhone(form.phone);
    if(!form.name.trim()||phone.length<8||phone.length>15){notify('Enter a valid phone number with country code.');return;}
    if(contacts.some(c=>c.id!==editingContact?.id&&cleanPhone(c.phone)===phone)){notify('This phone number already exists.');return;}
    const optedIn=form.consent==='Opted in', optedOut=form.consent==='Opted out';
    if(optedIn&&(!form.consentSource.trim()||!form.consentEvidence.trim()||!form.consentScope||!form.consentAt||Number.isNaN(Date.parse(form.consentAt))||!['marketing','utility','all'].includes(form.consentScope))){notify('To record opt-in, enter the real consent date, source, evidence and category. Do not guess or create consent evidence.');return;}
    if(editingContact){
      const update={full_name:form.name.trim(),phone,group_name:form.group,consent_status:optedIn?'opted_in':optedOut?'opted_out':'pending'};
      if(optedIn){update.consent_source=form.consentSource.trim();update.consent_evidence=form.consentEvidence.trim();update.consent_scope=form.consentScope;update.consent_at=new Date(form.consentAt+'T00:00:00.000Z').toISOString();update.opted_out_at=null;update.opt_out_source=null;}
      if(optedOut){update.opted_out_at=new Date().toISOString();update.opt_out_source='Workspace Admin recorded customer opt-out';}
      const {data,error}=await supabase.from('contacts').update(update).eq('id',editingContact.id).eq('workspace_id',workspace.id).select('id,full_name,phone,group_name,consent_status,consent_source,consent_evidence,consent_scope,consent_at,opted_out_at,updated_at').single();
      if(error){notify('Consent record could not be updated: '+error.message);return;}
      save(contacts.map(item=>item.id===editingContact.id?mapContact(data):item));
      resetContactForm();setModal(false);notify('Contact and consent record updated in Supabase.');return;
    }
    const row={workspace_id:workspace.id,full_name:form.name.trim(),phone,group_name:form.group,consent_status:optedIn?'opted_in':optedOut?'opted_out':'pending',consent_source:optedIn?form.consentSource.trim():null,consent_evidence:optedIn?form.consentEvidence.trim():null,consent_scope:optedIn?form.consentScope:null,consent_at:optedIn?new Date(form.consentAt+'T00:00:00.000Z').toISOString():null,opted_out_at:optedOut?new Date().toISOString():null,opt_out_source:optedOut?'Workspace Admin recorded customer opt-out':null,created_by:currentUser.id};
    const {data,error}=await supabase.from('contacts').insert(row).select('id,full_name,phone,group_name,consent_status,consent_source,consent_evidence,consent_scope,consent_at,opted_out_at,updated_at').single();
    if(error){notify('Contact could not be saved: '+error.message);return;}
    save([mapContact(data),...contacts]);
    resetContactForm();setModal(false);notify('Contact saved securely in Supabase.');
  }

  function importCsv(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=async()=>{
      const lines=String(reader.result).split(/\\r?\\n/).filter(Boolean);
      if(lines.length<2){notify('No contact rows found in this CSV.');return;}
      const split=line=>line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.map(x=>x.replace(/,$/,'').replace(/^"|"$/g,'').replaceAll('""','"'))||[];
      const headers=split(lines[0]).map(x=>x.trim().toLowerCase());
      const ni=headers.findIndex(x=>['name','full name','contact name'].includes(x));
      const pi=headers.findIndex(x=>['phone','mobile','number','phone number'].includes(x));
      const gi=headers.indexOf('group'), ci=headers.findIndex(x=>['consent','opt-in','optin','status'].includes(x)), si=headers.indexOf('consent_source'), ei=headers.indexOf('consent_evidence'), ai=headers.indexOf('consent_at'), sci=headers.indexOf('consent_scope');
      if(ni<0||pi<0){notify('CSV must contain Name and Phone columns.');return;}
      const known=new Set(contacts.map(c=>cleanPhone(c.phone)));const added=[];
      lines.slice(1).forEach((line,i)=>{
        const cols=split(line),phone=cleanPhone(cols[pi]),name=(cols[ni]||'').trim();
        if(!name||!phone||known.has(phone))return;known.add(phone);
        const raw=(ci>=0?cols[ci]:'').toLowerCase().trim();
        const source=si>=0?(cols[si]||'').trim():''; const evidence=ei>=0?(cols[ei]||'').trim():''; const consentAt=ai>=0?(cols[ai]||'').trim():''; const consentScope=sci>=0?(cols[sci]||'').trim().toLowerCase():'';
        const consent=['opted in','yes','true','consented'].includes(raw)&&source&&evidence&&consentAt&&['marketing','utility','all'].includes(consentScope)&&!Number.isNaN(Date.parse(consentAt))?'Opted in':['opted out','no','false','unsubscribed'].includes(raw)?'Opted out':'Pending';
        added.push({name,phone,group:(gi>=0&&cols[gi])||'Imported',consent,source,evidence,consentAt,consentScope});
      });
      if(!added.length){notify('No new contacts to import. Opted-in rows need consent_at, consent_source, consent_evidence and consent_scope columns.');return;}
      const rows=added.map(c=>({workspace_id:workspace.id,full_name:c.name,phone:c.phone,group_name:c.group,consent_status:c.consent==='Opted in'?'opted_in':c.consent==='Opted out'?'opted_out':'pending',consent_source:c.source||null,consent_evidence:c.evidence||null,consent_scope:c.consentScope||null,consent_at:c.consent==='Opted in'?new Date(c.consentAt).toISOString():null,created_by:currentUser.id}));
      const {data,error}=await supabase.from('contacts').insert(rows).select('id,full_name,phone,group_name,consent_status,consent_source,consent_evidence,consent_scope,consent_at,opted_out_at,updated_at');
      if(error){notify('CSV import failed: '+error.message);return;}
      save([...(data||[]).map(mapContact),...contacts]);notify(`Imported ${(data||[]).length} contacts into Supabase. Duplicates and incomplete rows skipped.`);
    };
    reader.readAsText(file);fileRef.current.value='';
  }

  function exportCsv(){
    const rows=[['Name','Phone','Group','Consent','Consent Category','Consent Date','Consent Source','Consent Evidence'],...visible.map(c=>[c.name,c.phone,c.group,c.consent,c.consentScope,c.consentAt,c.source,c.consentEvidence])];
    const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='mrsa-contacts.csv';a.click();URL.revokeObjectURL(url);
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={21} fill="currentColor"/></div><div><b>MrSa<span>Blaster</span></b><small>MRSA SOLUTIONS</small></div></div>
      <div className="workspace"><div className="workspace-mark">M</div><div><b>{workspace?.name || "MrSa Workspace"}</b><small>{currentUser?.role === "super_admin" ? "Platform Super Admin" : currentUser?.role === "admin" ? "Workspace Admin" : "Workspace User"}</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(item=><button key={item.name} className={'nav-item '+(page===item.name?'active':'')} onClick={()=>setPage(item.name)}><item.icon size={18}/>{item.name}{item.name==='Contacts'&&<span className="nav-count">{contacts.length}</span>}</button>)}</nav>
      <div className="nav-label preferences">PREFERENCES</div><button className={'nav-item '+(page==='WhatsApp API'?'active':'')} onClick={()=>setPage('WhatsApp API')}><MessageCircle size={18}/>WhatsApp API</button><button className={'nav-item '+(page==='Settings'?'active':'')} onClick={()=>setPage('Settings')}><Settings size={18}/>Settings</button>
      <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={18}/><b>Need a hand?</b><p>Setup guide and product help.</p><button onClick={()=>notify('Setup guide is coming in a later build.')}>View guide <ArrowUpRight size={13}/></button></div><div className="profile"><div className="profile-avatar">{(currentUser?.name || "U").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}</div><div><b>{currentUser?.name || "Account"}</b><small>{currentUser?.email || currentUser?.role}</small></div><button className="profile-logout" onClick={onLogout} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{page}</b></div><div className="top-actions"><div className="demo-pill"><i/> Supabase workspace</div><button className="icon-button" onClick={()=>notify('You are all caught up.')} aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">{(currentUser?.name || "U").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}</div></div></header>
      <div className="content">
        {page==='Overview'?<>
          <div className="page-head"><div><div className="eyebrow">BUSINESS WORKSPACE</div><h1>Admin Dashboard</h1><p>Welcome back, {currentUser?.name || 'Admin'}. Here is your workspace at a glance.</p></div><div className="head-actions"><button className="button primary" onClick={()=>setPage('Contacts')}><Users size={16}/> Manage contacts</button></div></div>
          <section className="stats">
            <div className="stat"><div className="stat-label">Total contacts <span className="stat-icon purple"><Users size={17}/></span></div><strong>{contacts.length.toLocaleString('en-IN')}</strong><small>Saved in this workspace browser</small></div>
            <div className="stat"><div className="stat-label">Opted-in contacts <span className="stat-icon green"><ShieldCheck size={17}/></span></div><strong>{optedIn.toLocaleString('en-IN')}</strong><small className="good">Eligible audience</small></div>
            <div className="stat"><div className="stat-label">Opted-out <span className="stat-icon orange"><X size={17}/></span></div><strong>{optedOut.toLocaleString('en-IN')}</strong><small>Excluded from campaigns</small></div>
            <div className="stat"><div className="stat-label">Subscription <span className="stat-icon blue"><CreditCard size={17}/></span></div><strong>₹299</strong><small>Monthly plan after 30-day trial</small></div>
          </section>
          <section className="panel"><div className="panel-head"><div><h2>Workspace management</h2><p>Choose a module to continue managing your business messaging workspace.</p></div></div><div style={{padding:20,display:'flex',gap:10,flexWrap:'wrap'}}><button className="button light" onClick={()=>setPage('Contacts')}><ContactRound size={16}/> Contacts</button><button className="button light" onClick={()=>setPage('Campaigns')}><Megaphone size={16}/> Campaigns</button><button className="button light" onClick={()=>setPage('Reports')}><Activity size={16}/> Reports</button><button className="button light" onClick={()=>setPage('Billing')}><CreditCard size={16}/> Billing</button></div></section>
        </>:page==='Contacts'?<>
          <div className="page-head"><div><div className="eyebrow">AUDIENCE MANAGEMENT</div><h1>Contacts</h1><p>Manage your audience, organize groups, and track messaging consent.</p></div><div className="head-actions"><button className="button light" onClick={exportCsv}><ArrowDownToLine size={16}/> Export</button><button className="button primary" onClick={()=>{resetContactForm();setModal(true);}}><Plus size={17}/> Add contact</button></div></div>
          <section className="stats">
            <div className="stat"><div className="stat-label">Total contacts <span className="stat-icon purple"><Users size={17}/></span></div><strong>{contacts.length.toLocaleString('en-IN')}</strong><small>Across all groups</small></div>
            <div className="stat"><div className="stat-label">Opted-in contacts <span className="stat-icon green"><ShieldCheck size={17}/></span></div><strong>{optedIn.toLocaleString('en-IN')}</strong><small className="good"><Check size={12}/> Eligible audience</small></div>
            <div className="stat"><div className="stat-label">Opted-out <span className="stat-icon orange"><X size={17}/></span></div><strong>{optedOut.toLocaleString('en-IN')}</strong><small>Excluded from campaigns</small></div>
            <div className="stat"><div className="stat-label">Contact groups <span className="stat-icon blue"><Grid2X2 size={17}/></span></div><strong>{new Set(contacts.map(c=>c.group)).size}</strong><small>Organized audiences</small></div>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>All contacts <span className="count">{visible.length}</span></h2><p>Review and manage your saved contacts.</p></div><div className="head-actions"><input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={e=>importCsv(e.target.files?.[0])}/><button className="button light" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Import CSV</button><button className="button light square" onClick={exportCsv} title="Export contacts"><FileSpreadsheet size={16}/></button></div></div>
            <div className="toolbar"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, phone or group..."/></div><div className="filters"><label><Filter size={14}/><select value={group} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></label><label><select value={status} onChange={e=>setStatus(e.target.value)}><option>All consent</option><option>Opted in</option><option>Pending</option><option>Opted out</option></select><ChevronDown size={13}/></label></div></div>
            {selected.length>0&&<div className="selection"><b>{selected.length} selected</b><button onClick={()=>setSelected([])}>Clear selection</button><span>Bulk campaign actions will be enabled after API setup.</span></div>}
            <div className="table-scroll">{contactsLoading?<div className="empty">Loading Supabase contacts…</div>:<table><thead><tr><th><input type="checkbox" aria-label="Select visible contacts" checked={visible.length>0&&visible.every(c=>selected.includes(c.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...visible.map(c=>c.id)])]:selected.filter(id=>!visible.some(c=>c.id===id)))}/></th><th>CONTACT</th><th>GROUP</th><th>CONSENT STATUS</th><th>CATEGORY / SOURCE</th><th>LAST UPDATED</th><th>ACTIONS</th></tr></thead><tbody>{visible.map(c=><tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>setSelected(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])} aria-label={'Select '+c.name}/></td><td><div className="contact"><div className="contact-initials">{c.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}</div><div><b>{c.name}</b><small>{c.phone}</small></div></div></td><td><span className="group-tag">{c.group}</span></td><td><span className={'status '+c.consent.toLowerCase().replace(' ','-')}><i/>{c.consent}</span></td><td><div>{c.consentScope||'—'}</div><small>{c.source||'—'}</small></td><td>{c.updated}</td><td><button className="more" onClick={()=>openConsentEditor(c)}>Manage consent</button><button className="more" disabled={c.consent==='Opted out'} onClick={()=>markOptOut(c)} aria-label={'Mark '+c.name+' opted out'}>{c.consent==='Opted out'?'Opted out':'Opt out'}</button></td></tr>)}</tbody></table>}{!contactsLoading&&visible.length===0&&<div className="empty"><ContactRound size={27}/><b>No contacts found</b><span>Try changing your search or filters.</span></div>}</div>
            <div className="table-foot"><span>Showing <b>{visible.length?1:0}–{visible.length}</b> of <b>{contacts.length}</b> contacts</span><span><ShieldCheck size={13}/> Synced with Supabase</span></div>
          </section>
          <div className="compliance"><ShieldCheck size={18}/><div><b>Consent-first messaging</b><span>Only message people who explicitly opted in. Store the original consent date, source and evidence; pending and opted-out contacts must be excluded from campaigns.</span></div><button onClick={()=>notify('WhatsApp consent guidance will be included in the compliance documentation.')}>Learn more <ArrowUpRight size={13}/></button></div>
        </>:page==='Campaigns'?<CampaignsPage contacts={contacts} notify={notify} workspace={workspace}/>:page==='Templates'?<TemplatesPage notify={notify} workspace={workspace}/>:page==='Reports'?<ReportsPage contacts={contacts} exportCsv={exportCsv}/> :page==='Settings'?<SettingsPage currentUser={currentUser} workspace={workspace}/>:page==='WhatsApp API'?<WhatsAppPlatformPage workspace={workspace}/>:page==='Billing'?<Billing workspace={workspace} currentUser={currentUser}/>:<div className="placeholder"><div className="placeholder-icon"><LayoutDashboard size={25}/></div><div className="eyebrow">MRSA BLASTER WORKSPACE</div><h1>{page}</h1><p>Choose a module from the workspace menu.</p><button className="button primary" onClick={()=>setPage('Overview')}>Back to Overview <ArrowUpRight size={15}/></button></div>}
      </div>
      <footer><span>© 2026 MrSa Solutions</span><span><i/> Supabase contacts · v0.1.0</span></footer>
    </main>
    {modal&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget){setModal(false);resetContactForm();}}}><form className="modal" onSubmit={addContact}><div className="modal-head"><div><h2>{editingContact?'Manage contact & consent':'Add new contact'}</h2><p>{editingContact?'Update this contact and record only consent actually given.':'Save a contact and record their messaging consent.'}</p></div><button type="button" className="icon-button" onClick={()=>{setModal(false);resetContactForm();}}><X size={18}/></button></div><label>Full name<input required autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Arun Kumar"/></label><label>Phone number<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+91 98765 43210"/></label><label>Contact group<select value={form.group} onChange={e=>setForm({...form,group:e.target.value})}><option>Customers</option><option>Leads</option><option>VIP</option><option>Partners</option></select></label><label>WhatsApp consent<select value={form.consent} onChange={e=>setForm({...form,consent:e.target.value})}><option>Pending</option><option>Opted in</option><option>Opted out</option></select></label>{form.consent==='Opted in'&&<><label>Consent category<select required value={form.consentScope} onChange={e=>setForm({...form,consentScope:e.target.value})}><option value="">Choose category</option><option value="marketing">Marketing / promotional messages</option><option value="utility">Service / transactional updates</option><option value="all">Both marketing and service updates</option></select></label><label>Original opt-in date<input required type="date" value={form.consentAt} onChange={e=>setForm({...form,consentAt:e.target.value})}/></label><label>Opt-in source<input required value={form.consentSource} onChange={e=>setForm({...form,consentSource:e.target.value})} placeholder="e.g. Website signup form / in-store form"/></label><label>Consent evidence<input required value={form.consentEvidence} onChange={e=>setForm({...form,consentEvidence:e.target.value})} placeholder="e.g. Form reference, date, or recorded permission details"/></label></>}<div className="consent-tip"><ShieldCheck size={16}/> Record opt-in only when the person has actually agreed. Use a source and evidence reference that can be verified later. Marketing and Utility consent are separate.</div><div className="modal-actions"><button type="button" className="button light" onClick={()=>{setModal(false);resetContactForm();}}>Cancel</button><button type="submit" className="button primary"><Plus size={15}/>{editingContact?'Save consent changes':'Save contact'}</button></div></form></div>}
    {toast&&<div className="toast"><Check size={16}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
