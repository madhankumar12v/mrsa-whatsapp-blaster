import React, { useEffect, useState } from 'react';
import { Activity, Building2, CreditCard, LayoutDashboard, LogOut, ShieldCheck, Users, RefreshCw, AlertCircle, MessageCircle, ContactRound, UserCircle2 } from 'lucide-react';
import { supabase } from './lib/supabase.js';

function Metric({ icon: Icon, label, value, note }) {
  return <section className="stat"><div className="stat-label">{label}<span className="stat-icon blue"><Icon size={17}/></span></div><strong>{value}</strong><small>{note}</small></section>;
}

export function SuperAdminDashboard({ currentUser, onLogout }) {
  const [data, setData] = useState({ workspaces: [], profiles: [], memberships: [], subscriptions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activePage, setActivePage] = useState('Overview');

  async function loadPlatformData() {
    setLoading(true); setError('');
    try {
      const [workspaces, profiles, memberships, subscriptions] = await Promise.all([
        supabase.from('workspaces').select('id,name,created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('profiles').select('id,full_name,email,platform_role,created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('workspace_memberships').select('id,role,workspace_id').limit(1000),
        supabase.from('workspace_subscriptions').select('workspace_id,status,trial_ends_at,paid_through,plan_name').limit(500)
      ]);
      const failure = [workspaces, profiles, memberships, subscriptions].find(result => result.error);
      if (failure) throw failure.error;
      setData({ workspaces: workspaces.data || [], profiles: profiles.data || [], memberships: memberships.data || [], subscriptions: subscriptions.data || [] });
    } catch (err) {
      setError(err.message || 'Platform data could not be loaded. Check your Supabase Row Level Security policies for Super Admin access.');
    } finally { setLoading(false); }
  }

  useEffect(() => { loadPlatformData(); }, []);
  const admins = data.memberships.filter(item => item.role === 'admin').length;
  const users = data.memberships.filter(item => item.role === 'user').length;
  const active = data.subscriptions.filter(item => item.status === 'active').length;
  const trials = data.subscriptions.filter(item => item.status === 'trialing').length;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={21}/></div><div><b>MrSa<span>Blaster</span></b><small>PLATFORM CONTROL</small></div></div>
      <div className="workspace"><div className="workspace-mark">S</div><div><b>Platform</b><small>Super Admin</small></div></div>
      <div className="nav-label">PLATFORM</div>
      <nav>
        <button className={`nav-item ${activePage === 'Overview' ? 'active' : ''}`} onClick={() => setActivePage('Overview')}><LayoutDashboard size={18}/>Overview</button>
        <button className={`nav-item ${activePage === 'Workspaces' ? 'active' : ''}`} onClick={() => setActivePage('Workspaces')}><Building2 size={18}/>Workspaces</button>
        <button className={`nav-item ${activePage === 'Accounts & roles' ? 'active' : ''}`} onClick={() => setActivePage('Accounts & roles')}><Users size={18}/>Accounts &amp; roles</button>
        <button className={`nav-item ${activePage === 'Subscriptions' ? 'active' : ''}`} onClick={() => setActivePage('Subscriptions')}><CreditCard size={18}/>Subscriptions</button>
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><ShieldCheck size={18}/><b>Platform access</b><p>Super Admin controls the overall MrSa Blaster platform.</p></div><div className="profile"><div className="profile-avatar">{(currentUser?.name || 'S').slice(0,1).toUpperCase()}</div><div><b>{currentUser?.name || 'Super Admin'}</b><small>{currentUser?.email}</small></div><button className="profile-logout" onClick={onLogout} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Platform <span>/</span> <b>{activePage}</b></div><div className="top-actions"><div className="demo-pill"><i/> Super Admin</div><button className="button light" onClick={loadPlatformData}><RefreshCw size={14}/> Refresh</button></div></header>
      <div className="content">
        {activePage === 'Overview' && <>
          <div className="page-head"><div><div className="eyebrow">PLATFORM MANAGEMENT</div><h1>Super Admin Dashboard</h1><p>Monitor all MrSa Blaster workspaces, accounts and subscriptions.</p></div></div>
          {error && <div className="compliance" style={{ background: '#fff6ed', borderColor: '#f5dfc8', color: '#b97732' }}><AlertCircle size={18}/><div><b>Platform data access needs attention</b><span>{error}</span></div></div>}
          <section className="stats">
            <Metric icon={Building2} label="Workspaces" value={loading ? '—' : data.workspaces.length} note="Latest 100 workspaces"/>
            <Metric icon={Users} label="Admin accounts" value={loading ? '—' : admins} note="Workspace admins"/>
            <Metric icon={UserCircle2} label="User accounts" value={loading ? '—' : users} note="Workspace team members"/>
            <Metric icon={CreditCard} label="Active subscriptions" value={loading ? '—' : active} note={loading ? 'Loading subscription data' : trials + ' free trials currently running'}/>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>Registered workspaces</h2><p>Newest workspaces on the platform.</p></div><span className="count">{data.workspaces.length} shown</span></div>
            <div className="table-scroll"><table><thead><tr><th>WORKSPACE</th><th>CREATED</th><th>SUBSCRIPTION</th><th>MEMBERS</th></tr></thead><tbody>
              {data.workspaces.map(workspace => { const subscription = data.subscriptions.find(item => item.workspace_id === workspace.id); const members = data.memberships.filter(item => item.workspace_id === workspace.id).length; return <tr key={workspace.id}><td><b style={{ color: '#263349' }}>{workspace.name}</b></td><td>{workspace.created_at ? new Date(workspace.created_at).toLocaleDateString('en-IN') : '—'}</td><td>{subscription?.status || 'Not configured'}</td><td>{members}</td></tr>; })}
            </tbody></table>{!loading && !error && data.workspaces.length === 0 && <div className="empty"><Building2 size={26}/><b>No workspaces found</b></div>}{loading && <div className="empty">Loading platform data…</div>}</div>
            <div className="table-foot"><span>Platform role: <b>super_admin</b></span><span><ShieldCheck size={13}/> Restricted platform access</span></div>
          </section>
          <div className="compliance"><ShieldCheck size={18}/><div><b>Security reminder</b><span>Dashboard visibility is not a security boundary. Enforce Super Admin access with Supabase Row Level Security policies and backend authorization.</span></div></div>
        </>}
        {activePage === 'Workspaces' && <section className="panel">
          <div className="panel-head"><div><h2>All workspaces</h2><p>Registered business workspaces on MrSa Blaster.</p></div><span className="count">{data.workspaces.length} workspaces</span></div>
          {error && <div className="empty">{error}</div>}
          <div className="table-scroll"><table><thead><tr><th>WORKSPACE</th><th>CREATED</th><th>SUBSCRIPTION</th><th>MEMBERS</th></tr></thead><tbody>
            {data.workspaces.map(w => <tr key={w.id}><td><b>{w.name}</b></td><td>{w.created_at ? new Date(w.created_at).toLocaleDateString('en-IN') : '—'}</td><td>{data.subscriptions.find(x => x.workspace_id === w.id)?.status || 'Not configured'}</td><td>{data.memberships.filter(x => x.workspace_id === w.id).length}</td></tr>)}
          </tbody></table>{!loading && data.workspaces.length === 0 && <div className="empty">No workspaces found.</div>}{loading && <div className="empty">Loading workspaces…</div>}</div>
        </section>}
        {activePage === 'Accounts & roles' && <section className="panel">
          <div className="panel-head"><div><h2>Accounts &amp; roles</h2><p>Platform accounts and their workspace access.</p></div><span className="count">{data.profiles.length} accounts</span></div>
          {error && <div className="empty">{error}</div>}
          <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>PLATFORM ROLE</th><th>WORKSPACE ROLE</th><th>WORKSPACE</th></tr></thead><tbody>
            {data.profiles.map(p => { const memberships = data.memberships.filter(m => m.user_id === p.id); return memberships.length ? memberships.map(m => <tr key={p.id + m.id}><td><b>{p.full_name || '—'}</b></td><td>{p.email || '—'}</td><td>{p.platform_role || 'user'}</td><td>{m.role}</td><td>{data.workspaces.find(w => w.id === m.workspace_id)?.name || '—'}</td></tr>) : <tr key={p.id}><td><b>{p.full_name || '—'}</b></td><td>{p.email || '—'}</td><td>{p.platform_role || 'user'}</td><td>—</td><td>—</td></tr>; })}
          </tbody></table>{!loading && data.profiles.length === 0 && <div className="empty">No accounts found.</div>}{loading && <div className="empty">Loading accounts…</div>}</div>
          <div className="table-foot"><span>Role changes are not enabled in this view.</span><span><ShieldCheck size={13}/> Read-only</span></div>
        </section>}
        {activePage === 'Subscriptions' && <section className="panel">
          <div className="panel-head"><div><h2>Subscriptions</h2><p>Trial and paid plan status for each workspace.</p></div><span className="count">{data.subscriptions.length} records</span></div>
          {error && <div className="empty">{error}</div>}
          <div className="table-scroll"><table><thead><tr><th>WORKSPACE</th><th>PLAN</th><th>STATUS</th><th>TRIAL ENDS</th><th>PAID THROUGH</th></tr></thead><tbody>
            {data.subscriptions.map((sub, i) => <tr key={sub.workspace_id || i}><td><b>{data.workspaces.find(w => w.id === sub.workspace_id)?.name || '—'}</b></td><td>{sub.plan_name || '—'}</td><td>{sub.status || '—'}</td><td>{sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString('en-IN') : '—'}</td><td>{sub.paid_through ? new Date(sub.paid_through).toLocaleDateString('en-IN') : '—'}</td></tr>)}
          </tbody></table>{!loading && data.subscriptions.length === 0 && <div className="empty">No subscription records found.</div>}{loading && <div className="empty">Loading subscriptions…</div>}</div>
          <div className="table-foot"><span>Subscription management actions are not enabled yet.</span><span><ShieldCheck size={13}/> Read-only</span></div>
        </section>}
      </div>
      <footer><span>© 2026 MrSa Solutions</span><span><i/> Platform console</span></footer>
    </main>
  </div>;
}

export function UserDashboard({ currentUser, workspace, onLogout }) {
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><MessageCircle size={21}/></div><div><b>MrSa<span>Blaster</span></b><small>TEAM WORKSPACE</small></div></div>
      <div className="workspace"><div className="workspace-mark">M</div><div><b>{workspace?.name || 'Workspace'}</b><small>Team Member</small></div></div>
      <div className="nav-label">MY WORKSPACE</div>
      <nav><div className="nav-item active"><LayoutDashboard size={18}/>My dashboard</div><div className="nav-item"><ContactRound size={18}/>Contacts</div><div className="nav-item"><Activity size={18}/>My activity</div></nav>
      <div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">{(currentUser?.name || 'U').slice(0,1).toUpperCase()}</div><div><b>{currentUser?.name || 'Team member'}</b><small>{currentUser?.email}</small></div><button className="profile-logout" onClick={onLogout} title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>My dashboard</b></div><div className="top-actions"><div className="demo-pill"><i/> Team Member</div><div className="top-avatar">{(currentUser?.name || 'U').slice(0,1).toUpperCase()}</div></div></header>
      <div className="content">
        <div className="page-head"><div><div className="eyebrow">TEAM MEMBER WORKSPACE</div><h1>Welcome, {currentUser?.name || 'there'}</h1><p>Use the tools and information made available by your workspace Admin.</p></div></div>
        <section className="stats">
          <Metric icon={Building2} label="Workspace" value={workspace?.name || '—'} note="Your assigned business"/>
          <Metric icon={ShieldCheck} label="Account role" value="User" note="Standard team access"/>
          <Metric icon={ContactRound} label="Contact tools" value="Available" note="Subject to Admin permissions"/>
          <Metric icon={Activity} label="Activity" value="—" note="Activity reporting will be added in a future update"/>
        </section>
        <section className="panel"><div className="panel-head"><div><h2>Your workspace tools</h2><p>Your access is limited to the permissions assigned by your Admin.</p></div></div><div style={{ padding: 20, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}><div className="stat"><div className="stat-label">Contacts <ContactRound size={17}/></div><p style={{ fontSize: 11, color: '#8994a5' }}>Contact access is managed by your workspace Admin.</p></div><div className="stat"><div className="stat-label">Campaigns <MessageCircle size={17}/></div><p style={{ fontSize: 11, color: '#8994a5' }}>Campaign access depends on your assigned permissions.</p></div><div className="stat"><div className="stat-label">My activity <Activity size={17}/></div><p style={{ fontSize: 11, color: '#8994a5' }}>Activity history will appear here when enabled.</p></div></div></section>
        <div className="compliance"><ShieldCheck size={18}/><div><b>Workspace permissions</b><span>Your Admin controls which workspace resources you can access. Contact your Admin if you need additional permissions.</span></div></div>
      </div>
      <footer><span>© 2026 MrSa Solutions</span><span><i/> Team workspace</span></footer>
    </main>
  </div>;
}
