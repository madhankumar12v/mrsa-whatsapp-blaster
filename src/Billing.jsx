import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Copy, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from './lib/supabase.js';

const UPI_ID = '8838037689@sbi';
const UPI_LINK = 'upi://pay?pa=8838037689%40sbi&pn=MrSa%20Solutions&am=299.00&cu=INR&tn=MrSa%20Blaster%20Monthly%20Subscription';

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function Billing({ workspace, currentUser }) {
  const [payments, setPayments] = useState([]);
  const [utr, setUtr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const active = workspace?.subscriptionStatus === 'active' && workspace?.paidThrough && new Date(workspace.paidThrough) > new Date();
  const trial = workspace?.subscriptionStatus === 'trialing' && workspace?.trialEndsAt && new Date(workspace.trialEndsAt) > new Date();
  const accessUntil = active ? workspace.paidThrough : trial ? workspace.trialEndsAt : null;
  const pending = useMemo(() => payments.filter(p => p.status === 'pending'), [payments]);

  async function refresh() {
    if (!workspace?.id) { setLoading(false); return; }
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('manual_payment_submissions')
      .select('id, utr, amount_paise, status, customer_note, admin_note, created_at, reviewed_at, submitted_by')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (queryError) setError(queryError.message);
    else setPayments(data || []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, [workspace?.id]);

  async function submitPayment(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    const reference = utr.trim();
    if (reference.length < 6) {
      setError('Enter the UPI transaction reference (UTR) shown in your payment app.');
      setBusy(false);
      return;
    }
    const { error: insertError } = await supabase.from('manual_payment_submissions').insert({
      workspace_id: workspace.id,
      submitted_by: currentUser.id,
      utr: reference,
      amount_paise: 29900,
      customer_note: note.trim() || null
    });
    if (insertError) {
      setError(insertError.code === '23505' ? 'This UTR has already been submitted. Please check the transaction reference.' : insertError.message);
    } else {
      setMessage('Payment reference submitted. Your access will be extended after an admin verifies the bank credit.');
      setUtr(''); setNote('');
      await refresh();
    }
    setBusy(false);
  }

  async function reviewPayment(paymentId, approve) {
    setReviewing(paymentId); setError(''); setMessage('');
    const { error: reviewError } = await supabase.rpc('review_manual_payment', {
      p_payment_id: paymentId,
      p_approve: approve,
      p_admin_note: approve ? 'UPI payment verified in bank account.' : 'Payment could not be verified.'
    });
    if (reviewError) setError(reviewError.message);
    else {
      setMessage(approve ? 'Payment approved. Subscription extended by 30 days.' : 'Payment request rejected.');
      await refresh();
      if (approve) window.location.reload();
    }
    setReviewing('');
  }

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setMessage('UPI ID copied.');
    } catch {
      setError('Copy is unavailable in this browser. Please select the UPI ID and copy it.');
    }
  }

  return <div className="content">
    <div className="page-head"><div><div className="eyebrow">ACCOUNT & BILLING</div><h1>Subscription</h1><p>Pay manually using UPI. Your subscription is activated after payment verification.</p></div></div>

    <section className="panel" style={{ maxWidth: 900, padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div><div className="eyebrow">STARTER PLAN</div><h2 style={{ fontSize: 30, margin: '8px 0' }}>₹299 <span style={{ fontSize: 15, fontWeight: 500, color: '#64748b' }}>/ 30 days</span></h2><p style={{ color: '#64748b', margin: 0 }}>One-time UPI payment · No automatic deductions</p></div>
        <span className={'status ' + (active ? 'opted-in' : trial ? 'pending' : 'opted-out')}><i />{active ? 'Subscription active' : trial ? 'Free trial active' : 'Renewal required'}</span>
      </div>
      <hr style={{ border: 0, borderTop: '1px solid #e8edf4', margin: '24px 0' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
        <div><small style={{ color: '#64748b' }}>Workspace</small><p style={{ fontWeight: 650, margin: '5px 0' }}>{workspace?.name || 'MrSa Solutions'}</p></div>
        <div><small style={{ color: '#64748b' }}>{active ? 'Paid through' : trial ? 'Trial ends' : 'Access status'}</small><p style={{ fontWeight: 650, margin: '5px 0' }}>{accessUntil ? formatDate(accessUntil) : 'Payment required'}</p></div>
        <div><small style={{ color: '#64748b' }}>Billing cycle</small><p style={{ fontWeight: 650, margin: '5px 0' }}>30 days per approved payment</p></div>
      </div>

      <div style={{ marginTop: 22, padding: 18, background: '#f5f8ff', borderRadius: 12, color: '#334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><ShieldCheck size={19}/><b>Pay using UPI</b></div>
        <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>Open any UPI app and pay exactly ₹299 to the UPI ID below. You can also use the button to open a supported UPI app on your phone.</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 13, background: '#fff', border: '1px solid #dbe4f0', borderRadius: 9 }}>
          <div><small style={{ color: '#64748b' }}>UPI ID</small><div style={{ fontWeight: 750, fontSize: 17, letterSpacing: '.2px' }}>{UPI_ID}</div></div>
          <button type="button" className="button light" onClick={copyUpi}><Copy size={15}/> Copy UPI ID</button>
        </div>
        <a href={UPI_LINK} className="button primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginTop: 14 }}><ExternalLink size={16}/> Pay ₹299 using UPI</a>
      </div>

      <form onSubmit={submitPayment} style={{ marginTop: 24, display: 'grid', gap: 12, maxWidth: 600 }}>
        <div><h3 style={{ margin: '0 0 5px' }}>Submit payment reference</h3><p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>After paying, enter the UTR / transaction ID from your UPI app.</p></div>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 650 }}>UPI transaction reference (UTR)<input required minLength={6} maxLength={80} value={utr} onChange={e => setUtr(e.target.value)} placeholder="Enter transaction ID / UTR" style={{ padding: 12, border: '1px solid #cbd5e1', borderRadius: 8 }}/></label>
        <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 650 }}>Optional note<input maxLength={250} value={note} onChange={e => setNote(e.target.value)} placeholder="Example: Paid from my SBI account" style={{ padding: 12, border: '1px solid #cbd5e1', borderRadius: 8 }}/></label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><button className="button primary" type="submit" disabled={busy || !workspace?.id}>{busy ? 'Submitting…' : 'Submit payment reference'}</button><span style={{ color: '#64748b', fontSize: 12 }}>Admin approval required</span></div>
      </form>

      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 22, padding: 13, background: '#fff8e8', borderRadius: 9, color: '#854d0e', fontSize: 13, lineHeight: 1.55 }}>
        <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }}/><span>Submitting a UTR does not automatically activate your subscription. An admin must confirm the ₹299 credit in the bank account before approving it. Do not share your UPI PIN or OTP.</span>
      </div>
      {error && <div className="auth-error" style={{ marginTop: 16 }}><AlertCircle size={15}/> {error}</div>}
      {message && <div style={{ marginTop: 16, color: '#16834a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}><CheckCircle2 size={15}/> {message}</div>}
    </section>

    {isAdmin && <section className="panel" style={{ maxWidth: 900, marginTop: 22 }}>
      <div className="panel-head"><div><h2>Admin payment approvals <span className="count">{pending.length}</span></h2><p>Verify the actual bank credit before approving a payment.</p></div><button className="button light" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      <div className="table-scroll"><table><thead><tr><th>SUBMITTED</th><th>UTR / TRANSACTION ID</th><th>AMOUNT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>
        {payments.map(p => <tr key={p.id}><td>{formatDate(p.created_at)}</td><td style={{ fontWeight: 650 }}>{p.utr}</td><td>₹{(p.amount_paise / 100).toFixed(2)}</td><td><span className={'status ' + (p.status === 'approved' ? 'opted-in' : p.status === 'rejected' ? 'opted-out' : 'pending')}><i/>{p.status}</span></td><td>{p.status === 'pending' ? <div style={{ display: 'flex', gap: 6 }}><button className="button primary" disabled={!!reviewing} onClick={() => reviewPayment(p.id, true)}>{reviewing === p.id ? 'Working…' : 'Approve'}</button><button className="button light" disabled={!!reviewing} onClick={() => reviewPayment(p.id, false)}>Reject</button></div> : p.admin_note || '—'}</td></tr>)}
        {!payments.length && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 28, color: '#64748b' }}>{loading ? 'Loading payment requests…' : 'No payment requests yet.'}</td></tr>}
      </tbody></table></div>
    </section>}

    <section className="panel" style={{ maxWidth: 900, marginTop: 22 }}>
      <div className="panel-head"><div><h2>Payment submissions</h2><p>Track the status of your submitted UPI references.</p></div><button className="button light" onClick={refresh} disabled={loading}><RefreshCw size={15}/> Refresh</button></div>
      <div className="table-scroll"><table><thead><tr><th>DATE</th><th>UTR / TRANSACTION ID</th><th>AMOUNT</th><th>STATUS</th><th>ADMIN NOTE</th></tr></thead><tbody>
        {payments.map(p => <tr key={p.id}><td>{formatDate(p.created_at)}</td><td>{p.utr}</td><td>₹{(p.amount_paise / 100).toFixed(2)}</td><td><span className={'status ' + (p.status === 'approved' ? 'opted-in' : p.status === 'rejected' ? 'opted-out' : 'pending')}><i/>{p.status}</span></td><td>{p.admin_note || '—'}</td></tr>)}
        {!payments.length && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 28, color: '#64748b' }}>{loading ? 'Loading payment submissions…' : 'No payments submitted yet.'}</td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
