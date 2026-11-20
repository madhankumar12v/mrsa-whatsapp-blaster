import React from 'react';
import { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck, Clock3, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from './lib/supabase.js';

const API = (import.meta.env.VITE_BILLING_API_URL || '/api').replace(/\/$/, '');
async function api(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(API + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function loadCheckout() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Unable to load secure checkout. Check your internet connection.'));
    document.body.appendChild(script);
  });
}
export default function Billing({ workspace, currentUser }) {
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function refresh() {
    setLoadingHistory(true);
    try { const data = await api('/billing/history'); setPayments(data.payments || []); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoadingHistory(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function subscribe() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await api('/billing/order', { method: 'POST', body: JSON.stringify({}) });
      await loadCheckout();
      const checkout = new window.Razorpay({
        key: data.keyId,
        amount: data.order.amount,
        currency: data.order.currency,
        name: 'MrSa Solutions',
        description: 'MrSa Blaster Starter · 30 days',
        order_id: data.order.id,
        prefill: { name: currentUser?.name, email: currentUser?.email },
        notes: { workspace: workspace?.name || '' },
        theme: { color: '#2457d6' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async response => {
          try {
            await api('/billing/verify', { method: 'POST', body: JSON.stringify(response) });
            setMessage('Payment verified. Your workspace subscription is active for 30 days.');
            await refresh();
            window.location.reload();
          } catch (e) { setError(e.message); setBusy(false); }
        }
      });
      checkout.on('payment.failed', response => {
        setError(response.error?.description || 'Payment failed. You can try again.');
        setBusy(false);
      });
      checkout.open();
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const active = workspace?.subscriptionStatus === 'active';
  const trial = workspace?.subscriptionStatus === 'trialing';
  const date = workspace?.paidThrough || workspace?.trialEndsAt;
  return <div className="content">
    <div className="page-head"><div><div className="eyebrow">ACCOUNT & BILLING</div><h1>Subscription</h1><p>Manage your MrSa Blaster plan and payment history.</p></div></div>
    <section className="panel" style={{ maxWidth: 850, padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div><div className="eyebrow">STARTER PLAN</div><h2 style={{ fontSize: 30, margin: '8px 0' }}>₹299 <span style={{ fontSize: 15, fontWeight: 500, color: '#64748b' }}>/ month</span></h2><p style={{ color: '#64748b', margin: 0 }}>30-day subscription period · Secure Razorpay checkout</p></div>
        <span className={'status ' + (active ? 'opted-in' : trial ? 'pending' : 'opted-out')}><i />{active ? 'Subscription active' : trial ? 'Free trial' : 'Payment required'}</span>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid #e8edf4', margin: '24px 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
        <div><small style={{ color: '#64748b' }}>Workspace</small><p style={{ fontWeight: 650, margin: '5px 0' }}>{workspace?.name || 'MrSa Solutions'}</p></div>
        <div><small style={{ color: '#64748b' }}>{active ? 'Paid through' : 'Trial ends'}</small><p style={{ fontWeight: 650, margin: '5px 0' }}>{date ? new Date(date).toLocaleDateString('en-IN') : '—'}</p></div>
        <div><small style={{ color: '#64748b' }}>Billing cycle</small><p style={{ fontWeight: 650, margin: '5px 0' }}>Monthly</p></div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 24, padding: 14, background: '#f5f8ff', borderRadius: 10, color: '#334155' }}>
        {trial ? <Clock3 size={18} /> : <ShieldCheck size={18} />}
        <span style={{ fontSize: 13, lineHeight: 1.6 }}>{trial ? 'Your 30-day free trial is active. Subscribe now to continue using the service after the trial ends.' : 'Payments are verified by the MrSa Blaster billing service before the workspace is activated.'} Each successful payment provides 30 days of access. Automatic recurring debit is not enabled in this release.</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 22 }}>
        <button className="button primary" disabled={busy} onClick={subscribe}><CreditCard size={16} />{busy ? 'Opening secure checkout…' : active ? 'Renew for ₹299' : 'Subscribe for ₹299/month'}</button>
        <span style={{ fontSize: 12, color: '#64748b' }}>Razorpay · UPI · Cards · Netbanking (availability depends on your account)</span>
      </div>
      {error && <div className="auth-error" style={{ marginTop: 16 }}><AlertCircle size={15} /> {error}</div>}
      {message && <div style={{ marginTop: 16, color: '#16834a', fontSize: 13 }}><CheckCircle2 size={15} /> {message}</div>}
    </section>
    <section className="panel" style={{ maxWidth: 850, marginTop: 22 }}>
      <div className="panel-head"><div><h2>Payment history</h2><p>Your latest subscription payment attempts.</p></div><button className="button light" onClick={refresh} disabled={loadingHistory}><RefreshCw size={15} /> Refresh</button></div>
      <div className="table-scroll"><table><thead><tr><th>DATE</th><th>ORDER ID</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>
        {payments.map(p => <tr key={p.provider_order_id}><td>{new Date(p.created_at).toLocaleDateString('en-IN')}</td><td>{p.provider_order_id}</td><td>₹{(p.amount_paise / 100).toFixed(2)}</td><td><span className={'status ' + (p.status === 'paid' ? 'opted-in' : p.status === 'failed' ? 'opted-out' : 'pending')}><i />{p.status}</span></td></tr>)}
        {!payments.length && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 28, color: '#64748b' }}>{loadingHistory ? 'Loading payment history…' : 'No payments recorded yet.'}</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
