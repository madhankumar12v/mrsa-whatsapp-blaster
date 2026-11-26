import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { Activity, AlertTriangle, CheckCircle2, Clock3, Download, RefreshCw, TrendingUp, XCircle } from 'lucide-react';

const dateKey = d => d.toISOString().slice(0,10);
const statusOf = row => String(row.status || 'unknown').toLowerCase();
const delivered = row => ['delivered','read'].includes(statusOf(row));
const failed = row => statusOf(row)==='failed';
const pending = row => ['accepted','sent','queued','processing'].includes(statusOf(row));
const labelDate = key => new Date(key+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'});

export default function AdvancedAnalytics({ workspace }) {
  const [range,setRange]=useState('30'), [from,setFrom]=useState(dateKey(new Date(Date.now()-29*86400000))), [to,setTo]=useState(dateKey(new Date()));
  const [groupBy,setGroupBy]=useState('daily'), [logs,setLogs]=useState([]), [loading,setLoading]=useState(false), [error,setError]=useState(''), [updated,setUpdated]=useState(null);
  const bounds=useMemo(()=>({start:range==='custom'?new Date(from+'T00:00:00'):new Date(Date.now()-(Number(range)-1)*86400000),end:new Date(to+'T23:59:59.999')}),[range,from,to]);
  async function load(){
    if(!workspace?.id){setLogs([]);return;}
    if(bounds.start>bounds.end){setError('Start date must be before end date.');return;}
    setLoading(true);setError('');
    const {data,error:e}=await supabase.from('whatsapp_message_logs').select('id,recipient_phone,template_name,status,error_message,meta_error_code,meta_error_details,created_at,status_updated_at,meta_message_id').eq('workspace_id',workspace.id).gte('created_at',bounds.start.toISOString()).lte('created_at',bounds.end.toISOString()).order('created_at',{ascending:true}).limit(10000);
    if(e)setError(e.message||'Analytics could not be loaded.');else setLogs(Array.isArray(data)?data:[]);
    setUpdated(new Date().toISOString());setLoading(false);
  }
  useEffect(()=>{load();},[workspace?.id,bounds.start.getTime(),bounds.end.getTime()]);
  const totals=useMemo(()=>{const d=logs.filter(delivered).length,f=logs.filter(failed).length,p=logs.filter(pending).length;return {total:logs.length,delivered:d,failed:f,pending:p,read:logs.filter(x=>statusOf(x)==='read').length,rate:logs.length?d/logs.length*100:0};},[logs]);
  const trend=useMemo(()=>{
    const map=new Map();
    const add=(key,label)=>{if(!map.has(key))map.set(key,{key,label,total:0,delivered:0});return map.get(key);};
    if(groupBy==='daily'){const d=new Date(bounds.start);d.setHours(0,0,0,0);const last=new Date(bounds.end);last.setHours(0,0,0,0);for(;d<=last;d.setDate(d.getDate()+1)){const k=dateKey(d);add(k,labelDate(k));}}
    logs.forEach(row=>{const d=new Date(row.created_at);let key,label;if(groupBy==='monthly'){key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');label=d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'});}else if(groupBy==='weekly'){const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));key=dateKey(monday);label='Wk '+labelDate(key);}else{key=dateKey(d);label=labelDate(key);}const item=add(key,label);item.total++;if(delivered(row))item.delivered++;});
    return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
  },[logs,groupBy,bounds.start,bounds.end]);
  const reasons=useMemo(()=>{const map=new Map();logs.filter(failed).forEach(row=>{const r=((row.meta_error_code?'Code '+row.meta_error_code+' · ':'')+(row.error_message||row.meta_error_details||'Unspecified failure')).slice(0,110);map.set(r,(map.get(r)||0)+1);});return [...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);},[logs]);
  function exportCsv(){const rows=[['Phone','Template','Status','Failure reason','Meta error code','Created at','Status updated','Meta message ID'],...logs.map(x=>[x.recipient_phone,x.template_name,x.status,x.error_message||x.meta_error_details||'',x.meta_error_code||'',x.created_at,x.status_updated_at||'',x.meta_message_id||''])];const csv=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join(String.fromCharCode(13,10));const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='mrsa-advanced-delivery-analytics.csv';a.click();URL.revokeObjectURL(url);}
  const max=Math.max(1,...trend.map(x=>x.total)), maxFail=Math.max(1,...reasons.map(x=>x[1]));
  return <section className="panel advanced-analytics" style={{marginBottom:18}}>
    <div className="panel-head"><div><h2>Advanced delivery analytics</h2><p>Delivery trends, success rates and failure reasons for this workspace.</p></div><div className="head-actions"><button className="button light" onClick={exportCsv} disabled={!logs.length}><Download size={14}/> Export CSV</button><button className="button light" onClick={load} disabled={loading}><RefreshCw size={14}/>{loading?'Loading…':'Refresh'}</button></div></div>
    <div className="analytics-toolbar"><div className="analytics-pills">{[['7','7 days'],['30','30 days'],['90','90 days'],['custom','Custom']].map(([v,l])=><button key={v} className={'analytics-pill '+(range===v?'selected':'')} onClick={()=>setRange(v)}>{l}</button>)}</div>{range==='custom'&&<div className="analytics-dates"><label>From <input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To <input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label></div>}<span className="analytics-updated">{updated?'Updated '+new Date(updated).toLocaleTimeString('en-IN'):'Not loaded'} · up to 10,000 records</span></div>
    {error&&<div className="dashboard-error">{error}</div>}
    <div className="stats analytics-stats">
      <div className="stat"><div className="stat-label">Total attempts <Activity size={16}/></div><strong>{totals.total.toLocaleString('en-IN')}</strong><small>Messages in selected period</small></div>
      <div className="stat"><div className="stat-label">Delivery success <CheckCircle2 size={16}/></div><strong>{totals.rate.toFixed(1)}%</strong><small>{totals.delivered} delivered or read</small></div>
      <div className="stat"><div className="stat-label">Failed <XCircle size={16}/></div><strong>{totals.failed}</strong><small>{totals.total?(totals.failed/totals.total*100).toFixed(1):'0.0'}% of attempts</small></div>
      <div className="stat"><div className="stat-label">Awaiting status <Clock3 size={16}/></div><strong>{totals.pending}</strong><small>Accepted / sent, not confirmed</small></div>
      <div className="stat"><div className="stat-label">Read receipts <TrendingUp size={16}/></div><strong>{totals.read}</strong><small>Confirmed as read</small></div>
    </div>
    <div className="analytics-section"><div className="analytics-section-head"><div><b>Delivery trend</b><span>Attempts and confirmed deliveries by period</span></div><div className="analytics-pills compact">{[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l])=><button key={v} className={'analytics-pill '+(groupBy===v?'selected':'')} onClick={()=>setGroupBy(v)}>{l}</button>)}</div></div>
      {loading?<div className="empty">Loading delivery trend…</div>:trend.length?<div className="analytics-chart" role="img" aria-label="Delivery attempts and confirmed deliveries chart">{trend.map(x=><div className="analytics-bar-group" key={x.key} title={x.label+': '+x.total+' attempts, '+x.delivered+' delivered'}><div className="analytics-bars"><i className="analytics-bar attempts" style={{height:Math.max(x.total?3:0,x.total/max*100)+'%'}}/><i className="analytics-bar delivered" style={{height:Math.max(x.delivered?3:0,x.delivered/max*100)+'%'}}/></div><small>{x.label}</small></div>)}</div>:<div className="empty"><Activity size={24}/><b>No delivery data in this period</b><span>Message attempts will appear here after a campaign is sent.</span></div>}
      <div className="analytics-legend"><span><i className="attempts"/> Total attempts</span><span><i className="delivered"/> Delivered / read</span></div>
    </div>
    <div className="analytics-bottom-grid">
      <div className="analytics-section"><div className="analytics-section-head"><div><b>Failure analysis</b><span>Most common recorded failure reasons</span></div><AlertTriangle size={17}/></div>{reasons.length?<div className="failure-list">{reasons.map(([reason,count])=><div className="failure-item" key={reason}><div><span>{reason}</span><b>{count}</b></div><div className="failure-track"><i style={{width:(count/maxFail*100)+'%'}}/></div></div>)}</div>:<div className="analytics-empty">No failed messages in this period.</div>}</div>
      <div className="analytics-section"><div className="analytics-section-head"><div><b>Status mix</b><span>Latest saved status for each message</span></div></div>{[['Delivered / read',totals.delivered,'#159b6e'],['Failed',totals.failed,'#d45b56'],['Awaiting status',totals.pending,'#d49a3d'],['Other',Math.max(0,totals.total-totals.delivered-totals.failed-totals.pending),'#8292a6']].map(([label,count,color])=><div className="status-mix" key={label}><div><span>{label}</span><b>{count}</b></div><div className="failure-track"><i style={{width:(totals.total?count/totals.total*100:0)+'%',background:color}}/></div></div>)}</div>
    </div>
    <div className="analytics-note">Delivery success = Delivered + Read ÷ total attempts. Accepted by Meta is not counted as delivered. Trends use message creation date; status totals use the latest webhook status stored for each message. Maximum 10,000 records per selected period.</div>
  </section>;
}
