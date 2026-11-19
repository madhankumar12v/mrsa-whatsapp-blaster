import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, initDb } from './db.js';
await initDb();
const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;
const name = process.env.SUPER_ADMIN_NAME || 'MrSa Super Admin';
if (!email || !password || password.length < 12) {
  console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (at least 12 characters) in server environment.');
  process.exit(1);
}
const hash = await bcrypt.hash(password,12);
await pool.query(`INSERT INTO users(workspace_id,name,email,password_hash,role)
VALUES(NULL,$1,$2,$3,'super_admin')
ON CONFLICT(email) DO NOTHING`,[name,email,hash]);
console.log('Super Admin account ensured for',email);
await pool.end();
