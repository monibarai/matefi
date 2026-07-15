// src/db/migrate.ts — MongoDB index/collection setup (idempotent).
// Usage: npm run migrate
import { getDb, closeDb } from './client';

export async function runMigrations(): Promise<string[]> {
  const db = await getDb();
  const done: string[] = [];

  // games — lobby filter + ordering
  await db.collection('games').createIndex({ status: 1 });
  await db.collection('games').createIndex({ created_at: -1 });
  await db.collection('games').createIndex({ completed_at: -1 });
  done.push('games indexes');

  // moves / evaluations — per-match ordered lookups
  await db.collection('moves').createIndex({ match_id: 1, move_number: 1 });
  await db.collection('evaluations').createIndex({ match_id: 1, move_number: 1 });
  done.push('moves + evaluations indexes');

  // traders — per-match listing + on-chain dedupe guard. The partial unique
  // index enforces idempotency for bets that carry a tx hash (replayed
  // BetPlaced events are no-ops); dev rows with no tx_hash are unconstrained.
  await db.collection('traders').createIndex({ match_id: 1 });
  await db.collection('traders').createIndex(
    { match_id: 1, trader_address: 1, outcome: 1, amount_stroops: 1, tx_hash: 1 },
    { unique: true, partialFilterExpression: { tx_hash: { $type: 'string' } } }
  );
  done.push('traders indexes (incl. on-chain dedupe)');

  console.log(`[migrate] ensured: ${done.join(', ')}`);
  return done;
}

if (require.main === module) {
  runMigrations()
    .then(() => closeDb())
    .catch((e) => {
      console.error('[migrate] failed:', e);
      process.exit(1);
    });
}
