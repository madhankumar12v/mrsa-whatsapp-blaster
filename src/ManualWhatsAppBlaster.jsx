import React, { useMemo, useState } from 'react';
import { MessageCircle, ChevronLeft, ChevronRight, CheckCircle2, ShieldCheck, Users } from 'lucide-react';

function phoneForWhatsApp(value) {
  let phone=String(value||'').replace(/\D/g,'');
  if(phone.length===10) phone='91'+phone;
  if(phone.startsWith('0')&&phone.length===11) phone='91'+phone.slice(1);
  if(phone.startsWith('0091')) phone=phone.slice(2);
  return phone.length>=8&&phone.length<=15&&!phone.startsWith('0')?phone:null;
}

export default function ManualWhatsAppBlaster({contacts=[],notify=()=>{}}) {
  const [category,setCategory]=useState('marketing');
  const [campaignName,setCampaignName]=useState('');
  const [message,setMessage]=useState('');
  const [index,setIndex]=useState(0);
  const [completed,setCompleted]=useState([]);
  const [query,setQuery]=useState('');
  const audience=useMemo(()=>{
    const seen=new Set();
    return contacts.filter(c=>{
      if(c.consent!=='Opted in'||!c.consentAt||!c.source||!c.consentEvidence||!['marketing','utility','all'].includes(c.consentScope))return false;
      if(c.consentScope!=='all'&&c.consentScope!==category)return false;
      const phone=phoneForWhatsApp(c.phone);
      if(!phone||seen.has(phone))return false;
      seen.add(phone);return true;
    }).map(c=>({...c,waPhone:phoneForWhatsApp(c.phone)}));
  },[contacts,category]);
  const pending=audience.filter(c=>!completed.includes(c.id));
  const current=pending[Math.min(index,Math.max(0,pending.length-1))]||null;
  const personalized=message.replaceAll('{{name}}',current?.name||'').replaceAll('{name}',current?.name||'');
  function openCurrent(){
    if(!current){notify('All eligible contacts are complete.');return;}
    if(!message.trim()){notify('Write your message first.');return;}
    const url='https://wa.me/'+current.waPhone+'?text='+encodeURIComponent(personalized);
    window.open(url,'_blank','noopener,noreferrer');
  }
  function markSent(){
    if(!current)return;
    setCompleted(old=>old.includes(current.id)?old:[...old,current.id]);
    setIndex(0);
    notify('Marked as manually sent. This is your confirmation; WhatsApp delivery is not verified by this website.');
  }
  function resetQueue(){setCompleted([]);setIndex(0);}
  const filtered=pending.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(query.toLowerCase()));
  return <section className="panel" style={{padding:20,marginBottom:18,border:'1px solid #cfe7dc'}}>
    <div className="panel-head" style={{padding:'0 0 14px'}}><div><h2 style={{display:'flex',alignItems:'center',gap:8}}><MessageCircle size={18}/> Manual WhatsApp Bulk Blaster</h2><p>Prepare personalised chats for opted-in contacts. You review and press Send inside WhatsApp for every recipient.</p></div><span className="status active">₹0 API mode</span></div>
    <div className="compliance" style={{margin:'0 0 16px'}}><ShieldCheck size={17}/><div><b>Consent-safe audience</b><span>Only contacts with recorded opt-in date, source, evidence and matching consent category are included. Opt-outs and duplicates are excluded.</span></div></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
      <label className="module-label">Campaign name<input value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder="e.g. MrSa customer update"/></label>
      <label className="module-label">Consent category<select value={category} onChange={e=>{setCategory(e.target.value);setIndex(0);setCompleted([]);}}><option value="marketing">Marketing / Promotional</option><option value="utility">Utility / Transactional</option></select></label>
    </div>
    <label className="module-label" style={{display:'block',marginTop:12}}>Message<textarea rows="4" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Hi {{name}}, your message here…"/></label>
    <small style={{display:'block',color:'#718096',marginTop:5}}>Personalisation: use <b>{'{{name}}'}</b> or <b>{'{name}'}</b> to insert each contact's name.</small>
    <div className="stats" style={{padding:'16px 0',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
      <div className="stat"><div className="stat-label">Eligible contacts<Users size={16}/></div><strong>{audience.length.toLocaleString('en-IN')}</strong><small>Unique valid opt-ins</small></div>
      <div className="stat"><div className="stat-label">Marked complete<CheckCircle2 size={16}/></div><strong>{completed.length.toLocaleString('en-IN')}</strong><small>Your manual confirmations</small></div>
      <div className="stat"><div className="stat-label">Remaining</div><strong>{pending.length.toLocaleString('en-IN')}</strong><small>Chats still in queue</small></div>
    </div>
    {current ? <div style={{border:'1px solid #e4eaf1',borderRadius:12,padding:16,display:'grid',gap:10}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><b>Next recipient: {current.name||'Customer'}</b><span style={{fontSize:12,color:'#68778c'}}>{current.phone}</span></div>
      <div style={{background:'#f6f8fb',padding:12,borderRadius:8,whiteSpace:'pre-wrap',fontSize:13}}>{personalized||'Your personalised message preview will appear here.'}</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button className="button primary" type="button" onClick={openCurrent} disabled={!message.trim()}><MessageCircle size={15}/> Open WhatsApp chat</button>
        <button className="button light" type="button" onClick={markSent}><CheckCircle2 size={15}/> I sent it — next</button>
        <button className="button light" type="button" onClick={()=>setIndex(v=>Math.min(v+1,Math.max(0,pending.length-1)))} disabled={pending.length<2}><ChevronRight size={15}/> Skip for now</button>
      </div>
      <small style={{color:'#718096'}}>Opening the chat does not send anything. Review the recipient and message, then press Send in WhatsApp. Only mark complete after you send it.</small>
    </div> : <div className="empty"><CheckCircle2 size={25}/><b>Queue complete</b><span>All eligible contacts have been marked complete.</span><button className="button light" type="button" onClick={resetQueue}>Reset queue</button></div>}
    {pending.length>1&&<label className="module-label" style={{display:'block',marginTop:12}}>Find next recipient<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or phone"/></label>}
    {query&&<div style={{maxHeight:180,overflowY:'auto',marginTop:8}}>{filtered.slice(0,30).map(c=><button key={c.id} type="button" className="more" style={{display:'block',width:'100%',textAlign:'left',padding:8}} onClick={()=>{const position=pending.findIndex(x=>x.id===c.id);setIndex(position);setQuery('');}}>{c.name} · {c.phone}</button>)}</div>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:14}}><small style={{color:'#718096'}}>No Meta API call · No automated delivery · WhatsApp account limits still apply.</small><button className="button light" type="button" onClick={resetQueue} disabled={!completed.length}>Reset progress</button></div>
  </section>;
}
