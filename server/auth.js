import jwt from 'jsonwebtoken';
export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, workspaceId: user.workspace_id ? String(user.workspace_id) : null }, process.env.JWT_SECRET, { expiresIn: '12h', issuer: 'mrsa-whatsapp-blaster' });
}
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please log in to continue.' });
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET, { issuer: 'mrsa-whatsapp-blaster' });
    const { rows } = await req.db.query('SELECT id, workspace_id, name, email, role, is_active FROM users WHERE id=$1', [payload.sub]);
    const user = rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Account is unavailable.' });
    req.user = user;
    if (user.workspace_id) {
      const result = await req.db.query('SELECT id, name, trial_started_at, trial_ends_at, subscription_status, plan_name, monthly_price_paise, paid_through FROM workspaces WHERE id=$1', [user.workspace_id]);
      req.workspace = result.rows[0] || null;
      if (req.workspace?.subscription_status === 'trialing' && new Date(req.workspace.trial_ends_at) <= new Date()) {
        await req.db.query("UPDATE workspaces SET subscription_status='expired' WHERE id=$1 AND subscription_status='trialing'",[user.workspace_id]);
        req.workspace.subscription_status = 'expired';
      }
      if (req.workspace?.subscription_status === 'active' && req.workspace.paid_through && new Date(req.workspace.paid_through) <= new Date()) {
        await req.db.query("UPDATE workspaces SET subscription_status='expired' WHERE id=$1 AND subscription_status='active'",[user.workspace_id]);
        req.workspace.subscription_status = 'expired';
      }
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}
export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'You do not have permission to perform this action.' });
}
export function requireActiveSubscription(req, res, next) {
  if (req.user?.role === 'super_admin') return next();
  const active = req.workspace?.subscription_status === 'active';
  const trial = req.workspace?.subscription_status === 'trialing' && new Date(req.workspace.trial_ends_at) > new Date();
  if (active || trial) return next();
  return res.status(402).json({ code: 'TRIAL_EXPIRED', error: 'Your free trial has ended. Please renew your subscription to continue.' });
}
