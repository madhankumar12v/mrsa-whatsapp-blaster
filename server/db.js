import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
export async function initDb() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schema = await fs.readFile(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(schema);
}
