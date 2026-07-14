// src/db/migrate.ts — minimal forward-only migration runner.
// Usage: npm run migrate
import fs from 'fs';
import path from 'path';
import { db, closeDb } from './client';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations(): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRes = await db.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r: { name: string }) => r.name));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
      console.log(`[migrate] applied ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  if (ran.length === 0) console.log('[migrate] nothing to do — schema is up to date');
  return ran;
}

if (require.main === module) {
  runMigrations()
    .then(() => closeDb())
    .catch((e) => {
      console.error('[migrate] failed:', e);
      process.exit(1);
    });
}
