// scripts/reconcile-settlements.ts — manually settle any completed on-chain
// match whose on-chain settlement never executed (winner unpaid, no tx).
//
//   npm run reconcile
//
// Safe to run repeatedly: already-settled matches are skipped. This moves funds
// on-chain (pays winners + winning traders), so it requires a funded relayer
// key and configured contracts.
import { reconcileSettlements } from '../src/stellar/reconcile';
import { closeDb } from '../src/db/client';

reconcileSettlements()
  .then((results) => {
    console.table(
      results.map((r) => ({ match: r.matchId, winner: r.winner, status: r.status, tx: r.txHash ?? r.detail ?? '' }))
    );
  })
  .catch((e) => console.error('[reconcile] fatal:', e))
  .finally(() => closeDb());
