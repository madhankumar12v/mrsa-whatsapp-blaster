import React from 'react';
import { useEffect, useState } from 'react';
import { Zap, ShieldCheck, Users, Clock3, LogOut, Eye, EyeOff } from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase.js';
import { SuperAdminDashboard, UserDashboard } from './RoleDashboards.jsx';

async function loadWorkspaceSession(authUser) {
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, email, platform_role').eq('id', authUser.id).single();
  if (profileError) throw profileError;
  const { data: membership, error: membershipError } = await supabase.from('workspace_memberships').select('workspace_id, role').eq('user_id', authUser.id).limit(1).maybeSingle();
  if (membershipError) throw membershipError;
  let workspace = null;
  let role = profile.platform_role === 'super_admin' ? 'super_admin' : 'user';
  if (membership && profile.platform_role !== 'super_admin') {
    role = membership.role;
    const { data: workspaceRow, error: workspaceError } = await supabase.from('workspaces').select('id, name').eq('id', membership.workspace_id).single();
    if (workspaceError) throw workspaceError;
    const { data: subscription, error: subscriptionError } = await supabase.from('workspace_subscriptions').select('status, trial_ends_at, paid_through, plan_name, monthly_price_paise').eq('workspace_id', membership.workspace_id).maybeSingle();
    if (subscriptionError) throw subscriptionError;
    workspace = {
      id: workspaceRow.id, name: workspaceRow.name,
      subscriptionStatus: subscription?.status || 'trialing',
      trialEndsAt: subscription?.trial_ends_at, paidThrough: subscription?.paid_through,
      planName: subscription?.plan_name || 'Starter',
      monthlyPricePaise: subscription?.monthly_price_paise || 29900
    };
  }
  return {
    user: { id: authUser.id, name: profile.full_name || authUser.user_metadata?.full_name || '', email: profile.email || authUser.email, role },
    workspace
  };
}

export default function AuthGate({ App }) {
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', workspaceName: '', email: '', password: '' });

  useEffect(() => {
    if (!supabaseConfigured) { setChecking(false); return undefined; }
    let alive = true;
    const applySession = async (session) => {
      if (!session?.user) { if (alive) { setUser(null); setWorkspace(null); } return; }
      try {
        const result = await loadWorkspaceSession(session.user);
        if (alive) { setUser(result.user); setWorkspace(result.workspace); }
      } catch (err) {
        console.error('Unable to load account workspace:', err);
        if (alive) { setError('Your account profile is not ready yet. Please contact support.'); setUser(null); setWorkspace(null); }
      }
    };
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      await applySession(data?.session);
      if (alive) setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => { void applySession(session); });
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(), password: form.password,
          options: { data: { full_name: form.name.trim(), workspace_name: form.workspaceName.trim() } }
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice('Your account has been created. Please verify your email using the confirmation link, then sign in.');
        } else {
          const result = await loadWorkspaceSession(data.user);
          setUser(result.user); setWorkspace(result.workspace);
          setNotice('Your workspace and 30-day free trial are ready.');
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (signInError) throw signInError;
        const result = await loadWorkspaceSession(data.user);
        setUser(result.user); setWorkspace(result.workspace);
      }
    } catch (err) {
      setError(err.message || 'Unable to complete your request. Please try again.');
    } finally { setBusy(false); }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null); setWorkspace(null);
  }

  if (checking) return <div className="auth-screen"><div className="auth-card">Checking your secure session…</div></div>;
  if (!supabaseConfigured) return <div className="auth-screen"><div className="auth-card">
    <div className="auth-brand"><div className="auth-mark"><Zap size={23} fill="currentColor"/></div><div><b>MrSa<span>Blaster</span></b><small>MRSA SOLUTIONS</small></div></div>
    <h1>Supabase setup required</h1><p className="auth-intro">Add your Supabase Project URL and Publishable Key to the Cloudflare environment variables to enable secure sign-in.</p>
    <div className="auth-error">Required: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY</div>
  </div></div>;
  if (user) return <>
    <div className="trial-ribbon"><span><Clock3 size={15}/>{workspace?.subscriptionStatus === 'trialing'
      ? 'Free trial ends ' + new Date(workspace.trialEndsAt).toLocaleDateString('en-IN') + ' · ' + Math.max(0, Math.ceil((new Date(workspace.trialEndsAt) - Date.now()) / 86400000)) + ' days remaining'
      : workspace?.subscriptionStatus === 'active' ? 'Subscription active'
      : workspace?.subscriptionStatus === 'expired' ? 'Trial expired · Subscription required'
      : 'MrSa Super Admin'}</span><button onClick={logout}><LogOut size={14}/> Sign out</button></div>
    {workspace?.subscriptionStatus === 'expired' && <div className="trial-expired">Your 30-day free trial has ended. Paid features require an active ₹299/month subscription. Payment activation will be connected in the billing milestone.</div>}
    {user.role === 'super_admin' ? <SuperAdminDashboard currentUser={user} onLogout={logout}/> : user.role === 'user' ? <UserDashboard currentUser={user} workspace={workspace} onLogout={logout}/> : <App currentUser={user} onLogout={logout} workspace={workspace}/>}
  </>;
  return <div className="auth-screen"><div className="auth-card">
    <div className="auth-brand"><div className="auth-mark"><Zap size={23} fill="currentColor"/></div><div><b>MrSa<span>Blaster</span></b><small>MRSA SOLUTIONS</small></div></div>
    <div className="auth-intro"><div className="auth-eyebrow">BUSINESS MESSAGING WORKSPACE</div><h1>{mode === 'login' ? 'Welcome back' : 'Start your free trial'}</h1><p>{mode === 'login' ? 'Sign in to manage your WhatsApp business workspace.' : 'Create your workspace and get 30 days free. No payment details required to start.'}</p></div>
    <form onSubmit={submit} className="auth-form">
      {mode === 'register' && <><label>Your full name<input required minLength="2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your name"/></label><label>Business / workspace name<input required minLength="2" value={form.workspaceName} onChange={e => setForm({ ...form, workspaceName: e.target.value })} placeholder="Your business name"/></label></>}
      <label>Email address<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" autoComplete="email"/></label>
      <label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} required minLength={mode === 'register' ? 10 : 1} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
      {error && <div className="auth-error">{error}</div>}{notice && <div className="auth-notice">{notice}</div>}
      <button className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account & start trial'}</button>
    </form>
    <div className="auth-switch">{mode === 'login' ? 'New to MrSa Blaster?' : 'Already have an account?'}<button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }}> {mode === 'login' ? 'Start free trial' : 'Sign in'}</button></div>
    <div className="trial-points"><span><ShieldCheck size={15}/> Secure role-based access</span><span><Clock3 size={15}/> 30 days free</span><span><Users size={15}/> Admin & team accounts</span></div>
    <div className="auth-price">After trial: <b>₹299 / month</b> · Cancel anytime</div>
  </div></div>;
}