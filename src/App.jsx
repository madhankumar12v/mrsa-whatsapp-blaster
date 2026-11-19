import { useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpRight, Bell, Check, ChevronDown, CircleHelp, ContactRound, FileSpreadsheet, Filter, Grid2X2, LayoutDashboard, Megaphone, MessageCircle, MoreHorizontal, Plus, Search, Settings, ShieldCheck, Upload, Users, X, Zap, LogOut } from 'lucide-react';

const seed = [
  {id:1,name:'Arun Kumar',phone:'+91 98765 43210',group:'Customers',consent:'Opted in',source:'Sample data',updated:'Today'},
  {id:2,name:'Priya S',phone:'+91 98765 43211',group:'Leads',consent:'Opted in',source:'Sample data',updated:'Today'},
  {id:3,name:'Karthik R',phone:'+91 98765 43212',group:'Customers',consent:'Pending',source:'Sample data',updated:'Yesterday'},
  {id:4,name:'Divya M',phone:'+91 98765 43213',group:'VIP',consent:'Opted in',source:'Sample data',updated:'Yesterday'},
  {id:5,name:'Suresh B',phone:'+91 98765 43214',group:'Leads',consent:'Opted out',source:'Sample data',updated:'2 days ago'},
  {id:6,name:'Nithya P',phone:'+91 98765 43215',group:'Customers',consent:'Opted in',source:'Sample data',updated:'2 days ago'}
];
const nav = [{name:'Overview',icon:LayoutDashboard},{name:'Contacts',icon:ContactRound},{name:'Campaigns',icon:Megaphone},{name:'Templates',icon:MessageCircle},{name:'Reports',icon:Activity}];
const cleanPhone = value => String(value || '').replace(/[\\s()-]/g,'');

function loadContacts(){
  try { const raw=localStorage.getItem('mrsa-contacts-v1'); return raw ? JSON.parse(raw) : seed; }
  catch { return seed; }
}

export default function App({currentUser,onLogout,workspace}){
  const [page,setPage]=useState('Contacts');
  const [contacts,setContacts]=useState(loadContacts);
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState('All groups');
  const [status,setStatus]=useState('All consent');
  const [selected,setSelected]=useState([]);
  const [modal,setModal]=useState(false);
  const [toast,setToast]=useState('');
  const [form,setForm]=useState({name:'',phone:'',group:'Customers',consent:'Pending'});
  const fileRef=useRef(null);
  const save=items=>{setContacts(items);localStorage.setItem('mrsa-contacts-v1',JSON.stringify(items));};
  const groups=['All groups',...new Set(contacts.map(c=>c.group))];
  const visible=useMemo(()=>contacts.filter(c=>
    [c.name,c.phone,c.group].join(' ').toLowerCase().includes(query.toLowerCase()) &&
    (group==='All groups'||c.group===group) && (status==='All consent'||c.consent===status)
  ),[contacts,query,group,status]);
  const optedIn=contacts.filter(c=>c.consent==='Opted in').length;
  const optedOut=contacts.filter(c=>c.consent==='Opted out').length;
  const notify=message=>{setToast(message);window.clearTimeout(notify.timer);notify.timer=window.setTimeout(()=>setToast(''),4000);};

  function addContact(e){
    e.preventDefault();
    const phone=cleanPhone(form.phone);
    if(!form.name.trim()||!phone)return;
    if(contacts.some(c=>cleanPhone(c.phone)===phone)){notify('This phone number already exists.');return;}
    save([{...form,id:Date.now(),name:form.name.trim(),phone,source:'Manual',updated:'Just now'},...contacts]);
    setForm({name:'',phone:'',group:'Customers',consent:'Pending'});setModal(false);notify('Contact added.');
  }

  function importCsv(file){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      const lines=String(reader.result).split(/\\r?\\n/).filter(Boolean);
      if(lines.length<2){notify('No contact rows found in this CSV.');return;}
      const split=line=>line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.map(x=>x.replace(/,$/,'').replace(/^"|"$/g,'').replaceAll('""','"'))||[];
      const headers=split(lines[0]).map(x=>x.trim().toLowerCase());
      const ni=headers.findIndex(x=>['name','full name','contact name'].includes(x));
      const pi=headers.findIndex(x=>['phone','mobile','number','phone number'].includes(x));
      const gi=headers.indexOf('group'), ci=headers.findIndex(x=>['consent','opt-in','optin','status'].includes(x));
      if(ni<0||pi<0){notify('CSV must contain Name and Phone columns.');return;}
      const known=new Set(contacts.map(c=>cleanPhone(c.phone)));const added=[];
      lines.slice(1).forEach((line,i)=>{
        const cols=split(line),phone=cleanPhone(cols[pi]),name=(cols[ni]||'').trim();
        if(!name||!phone||known.has(phone))return;known.add(phone);
        const raw=(ci>=0?cols[ci]:'').toLowerCase().trim();
        const consent=['opted in','yes','true','consented'].includes(raw)?'Opted in':['opted out','no','false','unsubscribed'].includes(raw)?'Opted out':'Pending';
        added.push({id:Date.now()+i,name,phone,group:(gi>=0&&cols[gi])||'Imported',consent,source:'CSV import',updated:'Just now'});
      });
      save([...added,...contacts]);notify(`Imported ${added.length} contacts. Duplicates and incomplete rows skipped.`);
    };
    reader.readAsText(file);fileRef.current.value='';
  }

  function exportCsv(){
    const rows=[['Name','Phone','Group','Consent'],...visible.map(c=>[c.name,c.phone,c.group,c.consent])];
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
      <div className="nav-label preferences">PREFERENCES</div><button className="nav-item" onClick={()=>notify('Settings will be available after account services are connected.')}><Settings size={18}/>Settings</button>
      <div className="sidebar-bottom"><div className="help-card"><CircleHelp size={18}/><b>Need a hand?</b><p>Setup guide and product help.</p><button onClick={()=>notify('Setup guide is coming in a later build.')}>View guide <ArrowUpRight size={13}/></button></div><div className="profile"><div className="profile-avatar">{(currentUser?.name || "U").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}</div><div><b>{currentUser?.name || "Account"}</b><small>{currentUser?.email || currentUser?.role}</small></div><button className="profile-logout" onClick={onLogout} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{page}</b></div><div className="top-actions"><div className="demo-pill"><i/> Local demo mode</div><button className="icon-button" onClick={()=>notify('You are all caught up.')} aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">{(currentUser?.name || "U").split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase()}</div></div></header>
      <div className="content">
        {page==='Contacts'?<>
          <div className="page-head"><div><div className="eyebrow">AUDIENCE MANAGEMENT</div><h1>Contacts</h1><p>Manage your audience, organize groups, and track messaging consent.</p></div><div className="head-actions"><button className="button light" onClick={exportCsv}><ArrowDownToLine size={16}/> Export</button><button className="button primary" onClick={()=>setModal(true)}><Plus size={17}/> Add contact</button></div></div>
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
            <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select visible contacts" checked={visible.length>0&&visible.every(c=>selected.includes(c.id))} onChange={e=>setSelected(e.target.checked?[...new Set([...selected,...visible.map(c=>c.id)])]:selected.filter(id=>!visible.some(c=>c.id===id))}/></th><th>CONTACT</th><th>GROUP</th><th>CONSENT STATUS</th><th>SOURCE</th><th>LAST UPDATED</th><th></th></tr></thead><tbody>{visible.map(c=><tr key={c.id}><td><input type="checkbox" checked={selected.includes(c.id)} onChange={()=>setSelected(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])} aria-label={'Select '+c.name}/></td><td><div className="contact"><div className="contact-initials">{c.name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()}</div><div><b>{c.name}</b><small>{c.phone}</small></div></div></td><td><span className="group-tag">{c.group}</span></td><td><span className={'status '+c.consent.toLowerCase().replace(' ','-')}><i/>{c.consent}</span></td><td>{c.source}</td><td>{c.updated}</td><td><button className="more" onClick={()=>notify('Contact editing and deletion are planned for the next update.')} aria-label={'More actions for '+c.name}><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table>{visible.length===0&&<div className="empty"><ContactRound size={27}/><b>No contacts found</b><span>Try changing your search or filters.</span></div>}</div>
            <div className="table-foot"><span>Showing <b>{visible.length?1:0}–{visible.length}</b> of <b>{contacts.length}</b> contacts</span><span><ShieldCheck size={13}/> Saved in this browser</span></div>
          </section>
          <div className="compliance"><ShieldCheck size={18}/><div><b>Consent-first messaging</b><span>Only message people who explicitly opted in. Pending and opted-out contacts must be excluded from campaigns.</span></div><button onClick={()=>notify('WhatsApp consent guidance will be included in the compliance documentation.')}>Learn more <ArrowUpRight size={13}/></button></div>
        </>:<div className="placeholder"><div className="placeholder-icon"><LayoutDashboard size={25}/></div><div className="eyebrow">MRSA BLASTER WORKSPACE</div><h1>{page}</h1><p>This module is planned for the next build milestone. Contact management is available now.</p><button className="button primary" onClick={()=>setPage('Contacts')}>Open Contacts <ArrowUpRight size={15}/></button></div>}
      </div>
      <footer><span>© 2026 MrSa Solutions</span><span><i/> Local demo · v0.1.0</span></footer>
    </main>
    {modal&&<div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModal(false)}><form className="modal" onSubmit={addContact}><div className="modal-head"><div><h2>Add new contact</h2><p>Save a contact and record their messaging consent.</p></div><button type="button" className="icon-button" onClick={()=>setModal(false)}><X size={18}/></button></div><label>Full name<input required autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Arun Kumar"/></label><label>Phone number<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+91 98765 43210"/></label><label>Contact group<select value={form.group} onChange={e=>setForm({...form,group:e.target.value})}><option>Customers</option><option>Leads</option><option>VIP</option><option>Partners</option></select></label><label>WhatsApp consent<select value={form.consent} onChange={e=>setForm({...form,consent:e.target.value})}><option>Pending</option><option>Opted in</option><option>Opted out</option></select></label><div className="consent-tip"><ShieldCheck size={16}/> Record opt-in only when valid permission has been received.</div><div className="modal-actions"><button type="button" className="button light" onClick={()=>setModal(false)}>Cancel</button><button type="submit" className="button primary"><Plus size={15}/> Save contact</button></div></form></div>}
    {toast&&<div className="toast"><Check size={16}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
