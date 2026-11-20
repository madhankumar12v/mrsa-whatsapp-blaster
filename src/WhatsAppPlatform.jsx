import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Copy, ExternalLink, MessageCircle, ShieldCheck, RefreshCw } from 'lucide-react';
import { supabase } from './lib/supabase.js';

const secretNames = [
  ['SUPABASE_URL', 'Supabase Project URL'],
  ['SUPABASE_ANON_KEY', 'Supabase Publishable / anon key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key'],
  ['WHATSAPP_ACCESS_TOKEN', 'Meta WhatsApp access token'],
  ['WHATSAPP_PHONE_NUMBER_ID', 'WhatsApp Phone Number ID'],
  ['WHATSAPP_BUSINESS_ACCOUNT_ID', 'WhatsApp Business Account ID (WABA ID)'],
  ['WHATSAPP_VERIFY_TOKEN', 'Webhook verify token (create a long random value)'],
  ['META_APP_SECRET', 'Meta App Secret'],
  ['WHATSAPP_API_VERSION', 'Optional: v27.0']
];

export default function WhatsAppPlatformPage({ workspace }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function checkConnection() {
    setLoading(true); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Please sign in again.');
      const response = await fetch('/api/whatsapp/status?workspaceId=' + encodeURIComponent(workspace?.id || ''), {
        headers: { Authorization: 'Bearer ' + token }
      });
      const body = await response.json();
      if (!response.ok && !body.missing) throw new Error(body.error || 'Connection check failed.');
      setResult(body);
    } catch (e) { setError(e.message || 'Could not check the Meta connection.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { checkConnection(); }, [workspace?.id]);

  const webhookUrl = typeof window !== 'undefined' ? window.location.origin + '/api/whatsapp/webhook' : '/api/whatsapp/webhook';
  async function copyWebhook() {
    try { await navigator.clipboard.writeText(webhookUrl); setError('Webhook URL copied.'); }
    catch { setError('Copy is unavailable. Select and copy the webhook URL manually.'); }
  }

  return <>
    <div className="page-head"><div><div className="eyebrow">OFFICIAL META INTEGRATION</div><h1>WhatsApp Business Platform</h1><p>Connect your own WhatsApp Business Account using Meta Cloud API.</p></div><div className="head-actions"><button className="button light" onClick={checkConnection} disabled={loading}><RefreshCw size={15}/> {loading ? 'Checking…' : 'Check connection'}</button></div></div>
    <section className="panel" style={{ padding: 20, maxWidth: 920 }}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
        <div className="stat-icon green"><MessageCircle size={20}/></div>
        <div><h2 style={{margin:0}}>Meta Cloud API connection</h2><small style={{color:'#7b8798'}}>Workspace: {workspace?.name || '—'}</small></div>
      </div>
      {result?.connected ? <div className="compliance" style={{margin:'12px 0',borderColor:'#bfe8d7',background:'#f0fbf6'}}><CheckCircle2 size={18}/><div><b>Connected to WhatsApp</b><span>{result.verifiedName || 'Business account'} · {result.phone || 'Phone number verified'} · Quality: {result.quality || 'Unknown'}</span></div></div>
        : <div className="compliance" style={{margin:'12px 0'}}><CircleAlert size={18}/><div><b>{result?.configured ? 'Credentials found, but Meta connection failed' : 'WhatsApp API is not configured yet'}</b><span>{result?.error || 'Add the required Cloudflare secrets below, then check the connection again.'}</span></div></div>}
      {error && <p style={{fontSize:12,color:'#b45309'}}>{error}</p>}
      {result?.missing?.length > 0 && <p style={{fontSize:12,color:'#68778c'}}>Missing: {result.missing.join(', ')}</p>}
      <div className="compliance" style={{margin:'16px 0'}}><ShieldCheck size={18}/><div><b>Credentials stay on the server</b><span>Never paste Meta access tokens or App Secrets into this page, chat, GitHub, or frontend code. Store them as encrypted Cloudflare Pages secrets only.</span></div></div>
    </section>

    <section className="panel" style={{marginTop:18,maxWidth:920}}>
      <div className="panel-head"><div><h2>1. Configure Cloudflare secrets</h2><p>Cloudflare Dashboard → Workers &amp; Pages → your MrSa Blaster project → Settings → Variables and Secrets. Add these names; mark sensitive values as encrypted secrets.</p></div></div>
      <div style={{padding:'0 20px 20px',display:'grid',gap:10}}>
        {secretNames.map(([key,label])=><div key={key} style={{display:'grid',gridTemplateColumns:'minmax(210px,0.8fr) 1fr',gap:12,alignItems:'center',padding:'9px 0',borderBottom:'1px solid #edf0f4'}}><code>{key}</code><span style={{fontSize:12,color:'#68778c'}}>{label}</span></div>)}
      </div>
    </section>

    <section className="panel" style={{marginTop:18,maxWidth:920}}>
      <div className="panel-head"><div><h2>2. Configure Meta webhook</h2><p>In Meta for Developers → your app → WhatsApp → Configuration, set the callback URL and verify token.</p></div></div>
      <div style={{padding:'0 20px 20px',display:'grid',gap:10}}>
        <small style={{color:'#68778c'}}>Callback URL</small>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><code style={{overflowWrap:'anywhere'}}>{webhookUrl}</code><button className="button light" onClick={copyWebhook}><Copy size={14}/> Copy URL</button></div>
        <small style={{color:'#68778c'}}>Subscribe to the <b>messages</b> webhook field. The verify token must exactly match WHATSAPP_VERIFY_TOKEN.</small>
      </div>
    </section>

    <section className="panel" style={{marginTop:18,maxWidth:920}}>
      <div className="panel-head"><div><h2>3. Consent and live sending safeguards</h2><p>Sending is deliberately restricted until contact records contain auditable opt-in evidence.</p></div></div>
      <div style={{padding:'0 20px 20px',fontSize:12,color:'#68778c',lineHeight:1.9}}>
        <ul style={{paddingLeft:18,margin:0}}>
          <li>Only workspace Admins with an active subscription or unexpired trial can send.</li>
          <li>Only approved WhatsApp message templates can be sent by the API endpoint.</li>
          <li>Every recipient must have consent_status = opted_in plus original consent date, source, evidence and the matching consent category.</li>
          <li>Pending, opted-out, sample and browser-only contacts are rejected.</li>
          <li>One request is limited to 50 recipients; each recipient is checked server-side before sending.</li>
        </ul>
        <p style={{marginBottom:0}}>Current browser demo contacts are not automatically eligible. Import or create real contacts in the Supabase contacts table and record how each person opted in.</p>
      </div>
    </section>
  </>;
}
