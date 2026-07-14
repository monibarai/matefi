// src/db/client.ts — PostgreSQL connection pool.
import { Pool } from 'pg';
import { config } from '../config';

// Render's *Internal* Database URL needs no SSL; the *External* URL requires
// it. Enable SSL when the connection string asks for it (sslmode=require) or
// when DATABASE_SSL=true, so either Render URL works without code changes.
const wantsSsl =
  /sslmode=require/i.test(config.DATABASE_URL) ||
  process.env.DATABASE_SSL?.toLowerCase() === 'true';

export const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
});

db.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export async function closeDb(): Promise<void> {
  await db.end();
}
