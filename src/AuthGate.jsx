import { useEffect, useState } from 'react';
import { Zap, ShieldCheck, Users, Clock3, LogOut, Eye, EyeOff } from 'lucide-react';
const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
async function request(path, options={}) {
  const response = await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
export default function AuthGate({App}) {
  const [token,setToken]=useState(()=>localStorage.getItem('mrsa-auth-token')||'');
  const [user,setUser]=useState(null),[workspace,setWorkspace]=useState(null);
  const [mode,setMode]=useState('login'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [form,setForm]=useState({name:'',workspaceName:'',email:'',password:''});
  const [checking,setChecking]=useState(Boolean(token));
  useEffect(()=>{if(!token){setChecking(false);return;}request('/auth/me',{headers:{Authorization:'Bearer '+token}}).then(d=>{setUser(d.user);setWorkspace(d.workspace);}).catch(()=>{localStorage.removeItem('mrsa-auth-token');setToken('');}).finally(()=>setChecking(false));},[]);
  async function submit(e){
    e.preventDefault();setError('');setBusy(true);
    try{
      const data=await request('/auth/'+mode,{method:'POST',body:JSON.stringify(form)});
      localStorage.setItem('mrsa-auth-token',data.token);setToken(data.token);setUser(data.user);
      const me=await request('/auth/me',{headers:{Authorization:'Bearer '+data.token}});setWorkspace(me.workspace);
    }catch(err){setError(err.message);}finally{setBusy(false);}
  }
  function logout(){localStorage.removeItem('mrsa-auth-token');setToken('');setUser(null);setWorkspace(null);}
  if(checking)return <div className="auth-screen"><div className="auth-card">Checking your secure session…</div></div>;
  if(user)return <><div className="trial-ribbon"><span><Clock3 size={15}/>{workspace?.subscriptionStatus==='trialing'?'Free trial ends '+new Date(workspace.trialEndsAt).toLocaleDateString('en-IN')+' · '+Math.max(0,Math.ceil((new Date(workspace.trialEndsAt)-Date.now())/86400000))+' days remaining':workspace?.subscriptionStatus==='active'?'Subscription active':workspace?.subscriptionStatus==='expired'?'Trial expired · Subscription required':'MrSa Super Admin'}</span><button onClick={logout}><LogOut size={14}/> Sign out</button></div>{workspace?.subscriptionStatus==='expired'&&<div className="trial-expired">Your 30-day free trial has ended. Paid features will require an active ₹299/month subscription. Payment activation will be connected in the billing milestone. Contact MrSa Solutions for renewal.</div>}<App currentUser={user} onLogout={logout} workspace={workspace}/></>;
  return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><div className="auth-mark"><Zap size={23} fill="currentColor"/></div><div><b>MrSa<span>Blaster</span></b><small>MRSA SOLUTIONS</small></div></div><div className="auth-intro"><div className="auth-eyebrow">BUSINESS MESSAGING WORKSPACE</div><h1>{mode==='login'?'Welcome back':'Start your free trial'}</h1><p>{mode==='login'?'Sign in to manage your WhatsApp business workspace.':'Create your workspace and get 30 days free. No payment details required to start.'}</p></div><form onSubmit={submit} className="auth-form">
  {mode==='register'&&<><label>Your full name<input required minLength="2" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name"/></label><label>Business / workspace name<input required minLength="2" value={form.workspaceName} onChange={e=>setForm({...form,workspaceName:e.target.value})} placeholder="Your business name"/></label></>}
  <label>Email address<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@company.com" autoComplete="email"/></label>
  <label>Password<div className="password-wrap"><input type={showPassword?'text':'password'} required minLength={mode==='register'?10:1} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={mode==='register'?'At least 10 characters':'Your password'} autoComplete={mode==='login'?'current-password':'new-password'}/><button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
  {error&&<div className="auth-error">{error}</div>}<button className="auth-submit" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':'Create account & start trial'}</button>
  </form><div className="auth-switch">{mode==='login'?"New to MrSa Blaster?":"Already have an account?"}<button onClick={()=>{setMode(mode==='login'?'register':'login');setError('');}}> {mode==='login'?'Start free trial':'Sign in'}</button></div><div className="trial-points"><span><ShieldCheck size={15}/> Secure role-based access</span><span><Clock3 size={15}/> 30 days free</span><span><Users size={15}/> Admin & team accounts</span></div><div className="auth-price">After trial: <b>₹299 / month</b> · Cancel anytime</div></div></div>;
}
