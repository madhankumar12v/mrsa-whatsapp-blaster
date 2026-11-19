import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, initDb } from './db.js';
import { signToken, requireAuth, requireRole } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(x => x.trim()), credentials: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api/auth', authLimiter);

// Razorpay webhook must receive the untouched request bytes for signature verification.
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json', limit: '1mb' }), async (req,res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  if (!secret || !signature || !Buffer.isBuffer(req.body)) return res.status(400).send('Webhook not configured.');
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).send('Invalid signature.');
  try {
    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      const orderId = payment?.order_id || event.payload?.order?.entity?.id;
      const paymentId = payment?.id;
      if (orderId && paymentId) await activatePaidOrder(orderId,paymentId);
    }
    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) await pool.query("UPDATE payment_orders SET status='failed' WHERE provider_order_id=$1 AND status='created'",[payment.order_id]);
    }
    return res.json({ received:true });
  } catch (e) { console.error('Razorpay webhook processing failed:',e); return res.status(500).send('Webhook processing failed.'); }
});

app.use(express.json({ limit: '100kb' }));
app.use((req, _res, next) => { req.db = pool; next(); });
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), workspaceName: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(10).max(72) });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(72) });
const cleanUser = u => ({ id: String(u.id), name: u.name, email: u.email, role: u.role, workspaceId: u.workspace_id ? String(u.workspace_id) : null });

async function activatePaidOrder(orderId,paymentId) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const found=await client.query('SELECT * FROM payment_orders WHERE provider_order_id=$1 FOR UPDATE',[orderId]);
    const order=found.rows[0];
    if (!order) { await client.query('ROLLBACK'); return false; }
    if (order.status !== 'paid') {
      await client.query("UPDATE payment_orders SET status='paid',provider_payment_id=$2,paid_at=NOW() WHERE id=$1",[order.id,paymentId]);
      await client.query("UPDATE workspaces SET subscription_status='active',paid_through=GREATEST(COALESCE(paid_through,NOW()),NOW())+INTERVAL '30 days' WHERE id=$1",[order.workspace_id]);
    }
    await client.query('COMMIT'); return true;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

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
      await pool.query("UPDATE workspaces SET subscription_status='expired' WHERE id=$1 AND subscription_status='trialing' AND trial_ends_at<=NOW()",[user.workspace_id]);
      await pool.query("UPDATE workspaces SET subscription_status='expired' WHERE id=$1 AND subscription_status='active' AND paid_through IS NOT NULL AND paid_through<=NOW()",[user.workspace_id]);
      const ws = await pool.query('SELECT id,name,trial_started_at,trial_ends_at,subscription_status,plan_name,monthly_price_paise,paid_through FROM workspaces WHERE id=$1',[user.workspace_id]);
      workspace = ws.rows[0] || null;
    }
    return res.json({ token: signToken(user), user: cleanUser(user), workspace });
  } catch(e) { next(e); }
});

app.get('/api/auth/me', requireAuth, (req,res) => {
  const w = req.workspace;
  res.json({ user: cleanUser(req.user), workspace: w ? { id:String(w.id), name:w.name, trialStartedAt:w.trial_started_at, trialEndsAt:w.trial_ends_at, subscriptionStatus:w.subscription_status, planName:w.plan_name, monthlyPricePaise:w.monthly_price_paise, paidThrough:w.paid_through } : null });
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

// Create a one-month ₹299 order. Activation happens only after signature verification or a valid webhook.
app.post('/api/billing/order', requireAuth, async (req,res,next) => {
  if (req.user.role === 'super_admin' || !req.user.workspace_id) return res.status(403).json({error:'A customer workspace is required.'});
  const keyId=process.env.RAZORPAY_KEY_ID, keySecret=process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return res.status(503).json({error:'Online payments are not configured yet. Please contact MrSa Solutions.'});
  try {
    const ws=await pool.query('SELECT id,monthly_price_paise FROM workspaces WHERE id=$1',[req.user.workspace_id]);
    if (!ws.rows[0]) return res.status(404).json({error:'Workspace not found.'});
    const amount=29900;
    const response=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(keyId+':'+keySecret).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({amount,currency:'INR',receipt:'mrsa_ws_'+req.user.workspace_id+'_'+Date.now(),notes:{workspace_id:String(req.user.workspace_id),plan:'Starter Monthly'}})});
    const order=await response.json();
    if (!response.ok) { console.error('Razorpay order creation failed:',order); return res.status(502).json({error:'Unable to create payment order. Please try again.'}); }
    await pool.query("INSERT INTO payment_orders(workspace_id,provider_order_id,amount_paise,currency,status) VALUES($1,$2,$3,'INR','created')",[req.user.workspace_id,order.id,amount]);
    res.status(201).json({order:{id:order.id,amount:order.amount,currency:order.currency},keyId,plan:{name:'Starter',amount:29900,currency:'INR',billingCycle:'Monthly'}});
  } catch(e) { next(e); }
});

app.post('/api/billing/verify', requireAuth, async (req,res,next) => {
  const schema=z.object({razorpay_order_id:z.string().min(5),razorpay_payment_id:z.string().min(5),razorpay_signature:z.string().min(10)});
  const parsed=schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:'Payment verification details are incomplete.'});
  const secret=process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return res.status(503).json({error:'Payment verification is not configured.'});
  try {
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=parsed.data;
    const expected=crypto.createHmac('sha256',secret).update(razorpay_order_id+'|'+razorpay_payment_id).digest('hex');
    const a=Buffer.from(expected),b=Buffer.from(razorpay_signature);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(400).json({error:'Payment signature is invalid.'});
    const order=await pool.query('SELECT id,amount_paise,currency FROM payment_orders WHERE provider_order_id=$1 AND workspace_id=$2',[razorpay_order_id,req.user.workspace_id]);
    if(!order.rows[0]) return res.status(404).json({error:'Payment order not found for this workspace.'});
    const paymentResponse=await fetch('https://api.razorpay.com/v1/payments/'+encodeURIComponent(razorpay_payment_id),{headers:{Authorization:'Basic '+Buffer.from(process.env.RAZORPAY_KEY_ID+':'+secret).toString('base64')}});
    const payment=await paymentResponse.json();
    if(!paymentResponse.ok || payment.order_id!==razorpay_order_id || payment.status!=='captured' || payment.amount!==order.rows[0].amount_paise || payment.currency!==order.rows[0].currency) {
      return res.status(402).json({error:'Payment is not captured or does not match this subscription order yet. Please wait briefly and retry.'});
    }
    await activatePaidOrder(razorpay_order_id,razorpay_payment_id);
    const ws=await pool.query('SELECT subscription_status,paid_through FROM workspaces WHERE id=$1',[req.user.workspace_id]);
    res.json({verified:true,subscriptionStatus:ws.rows[0].subscription_status,paidThrough:ws.rows[0].paid_through});
  } catch(e) { next(e); }
});

app.get('/api/billing/history', requireAuth, async (req,res,next) => {
  if(!req.user.workspace_id) return res.json({payments:[]});
  try {
    const {rows}=await pool.query('SELECT provider_order_id,provider_payment_id,amount_paise,currency,status,created_at,paid_at FROM payment_orders WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 25',[req.user.workspace_id]);
    res.json({payments:rows});
  } catch(e) { next(e); }
});

app.get('/api/admin/workspaces', requireAuth, requireRole('super_admin'), async (_req,res,next) => {
  try {
    const { rows } = await pool.query(`SELECT w.id,w.name,w.owner_email,w.trial_started_at,w.trial_ends_at,w.subscription_status,w.plan_name,w.monthly_price_paise,w.paid_through,COUNT(u.id)::int AS user_count
      FROM workspaces w LEFT JOIN users u ON u.workspace_id=w.id GROUP BY w.id ORDER BY w.created_at DESC`);
    res.json({ workspaces:rows.map(w=>({...w,id:String(w.id)})) });
  } catch(e) { next(e); }
});

// Serve the built Vite frontend from the same Render web service.
const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(frontendDist));
app.get(/^\\/(?!api(?:\\/|$)).*/, (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

app.use((err,_req,res,_next) => {
  if (err.code === '23505') return res.status(409).json({ error:'This email is already registered.' });
  console.error(err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
});

const port = Number(process.env.PORT || 4000);
initDb().then(() => app.listen(port, () => console.log(`MrSa API listening on :${port}`))).catch(err => { console.error('Database initialization failed:',err); process.exit(1); });
