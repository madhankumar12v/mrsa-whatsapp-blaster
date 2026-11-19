import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, initDb } from './db.js';
import { signToken, requireAuth, requireRole } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(x => x.trim()), credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use((req, _res, next) => { req.db = pool; next(); });
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), workspaceName: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(10).max(72) });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72) });
const cleanUser = u => ({ id: String(u.id), name: u.name, email: u.email, role: u.role, workspaceId: u.workspace_id ? String(u.workspace_id) : null });

app.get('/api/health', (_req,res) => res.json({ ok: true, service: 'MrSa WhatsApp Blaster API' }));

app.post('/api/auth/register', async (req,res,next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name, workspace, email and password (at least 10 characters).' });
  const { name, workspaceName, email } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM users WHERE email=$1', [email.toLowerCase()]);
    if (exists.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'An account with this email already exists.' }); }
    const ws = await client.query(`INSERT INTO workspaces(name,owner_email,trial_started_at,trial_ends_at,subscription_status,plan_name,monthly_price_paise)
      VALUES($1,$2,NOW(),NOW()+INTERVAL '30 days','trialing','Starter',29900) RETURNING *`, [workspaceName,email.toLowerCase()]);
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const created = await client.query(`INSERT INTO users(workspace_id,name,email,password_hash,role)
      VALUES($1,$2,$3,$4,'admin') RETURNING id,workspace_id,name,email,role`, [ws.rows[0].id,name,email.toLowerCase(),hash]);
    await client.query('COMMIT');
    const user = created.rows[0];
    return res.status(201).json({ token: signToken(user), user: cleanUser(user), workspace: ws.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

app.post('/api/auth/login', async (req,res,next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [parsed.data.email.toLowerCase()]);
    const user = rows[0];
    if (!user || !user.is_active || !(await bcrypt.compare(parsed.data.password,user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    let workspace = null;
    if (user.workspace_id) {
      const result = await pool.query(`UPDATE workspaces SET subscription_status='expired'
        WHERE id=$1 AND subscription_status='trialing' AND trial_ends_at<=NOW() RETURNING id`, [user.workspace_id]);
      const ws = await pool.query('SELECT id,name,trial_started_at,trial_ends_at,subscription_status,plan_name,monthly_price_paise FROM workspaces WHERE id=$1',[user.workspace_id]);
      workspace = ws.rows[0] || null;
    }
    return res.json({ token: signToken(user), user: cleanUser(user), workspace });
  } catch(e) { next(e); }
});

app.get('/api/auth/me', requireAuth, (req,res) => {
  const w = req.workspace;
  res.json({ user: cleanUser(req.user), workspace: w ? { id:String(w.id), name:w.name, trialStartedAt:w.trial_started_at, trialEndsAt:w.trial_ends_at, subscriptionStatus:w.subscription_status, planName:w.plan_name, monthlyPricePaise:w.monthly_price_paise } : null });
});

app.post('/api/users', requireAuth, requireRole('admin'), async (req,res,next) => {
  const schema = z.object({ name:z.string().trim().min(2).max(80), email:z.string().trim().email(), password:z.string().min(10).max(72), role:z.enum(['admin','user']).default('user') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Enter a valid name, email, password (at least 10 characters) and role.' });
  try {
    const hash = await bcrypt.hash(parsed.data.password,12);
    const result = await pool.query(`INSERT INTO users(workspace_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)
      RETURNING id,workspace_id,name,email,role`,[req.user.workspace_id,parsed.data.name,parsed.data.email.toLowerCase(),hash,parsed.data.role]);
    res.status(201).json({ user:cleanUser(result.rows[0]) });
  } catch(e) { if(e.code==='23505') return res.status(409).json({error:'This email is already registered.'}); next(e); }
});

app.get('/api/admin/workspaces', requireAuth, requireRole('super_admin'), async (_req,res,next) => {
  try {
    const { rows } = await pool.query(`SELECT w.id,w.name,w.owner_email,w.trial_started_at,w.trial_ends_at,w.subscription_status,w.plan_name,w.monthly_price_paise,COUNT(u.id)::int AS user_count
      FROM workspaces w LEFT JOIN users u ON u.workspace_id=w.id GROUP BY w.id ORDER BY w.created_at DESC`);
    res.json({ workspaces:rows.map(w=>({...w,id:String(w.id)})) });
  } catch(e) { next(e); }
});

app.use((err,_req,res,_next) => {
  if (err.code === '23505') return res.status(409).json({ error:'This email is already registered.' });
  console.error(err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
});

const port = Number(process.env.PORT || 4000);
initDb().then(() => app.listen(port, () => console.log(`MrSa API listening on :${port}`))).catch(err => { console.error('Database initialization failed:',err); process.exit(1); });
