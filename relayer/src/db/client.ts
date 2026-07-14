// src/db/client.ts — PostgreSQL connection pool.
import { Pool } from 'pg';
import { config } from '../config';

export const db = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
});

db.on('error', (err) => {
  console.error('[db] idle client error:', err.message);
});

export async function closeDb(): Promise<void> {
  await db.end();
}
