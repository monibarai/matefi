// src/stellar/reconcile.ts — settlement reconciler.
//
// A match can be marked `completed` in the local DB while its on-chain
// settlement never executed — e.g. the relayer was down when the game ended, or
// `post_result` failed and the error was swallowed. The winner is then NEVER
// PAID and no settlement tx exists (so match history has no tx id).
//
// This reconciler closes that gap: for every completed on-chain match whose
// PredictionPool market is not yet `settled`, it (re)posts the result — which
// atomically runs Settlement.execute, paying the winner — records the
// settlement row with the resulting tx hash, and pays any winning traders.
// It is idempotent: already-settled matches are skipped, so it is safe to run
// repeatedly (on startup, on a timer, or manually via `npm run reconcile`).
import { oracleGateway, Winner } from './contracts/oracleGateway';
import { predictionPool } from './contracts/predictionPool';
import { settlement } from './contracts/settlement';
import * as matchesDb from '../db/queries/matches';

export interface ReconcileResult {
  matchId: string;
  winner: Winner;
  txHash: string | null;
  status: 'settled' | 'already-settled' | 'skipped' | 'error';
  detail?: string;
}

/** Reconcile a single completed match's on-chain settlement. */
async function reconcileOne(matchId: string, winner: Winner): Promise<ReconcileResult> {
  const market = await predictionPool.getMarket(matchId);
  if (market === null) {
    return { matchId, winner, txHash: null, status: 'skipped', detail: 'no on-chain market' };
  }
  if (market.settled) {
    return { matchId, winner, txHash: null, status: 'already-settled' };
  }

  // Not settled on-chain — post the result now. This triggers Settlement.execute
  // and pays the winning player; the returned hash is the settlement tx.
  const txHash = await oracleGateway.postResult(matchId, winner);
  await matchesDb.recordSettlement({ matchId, winner, txHash });

  // Pay winning prediction-market traders (permissionless per-trader claims).
  await settlement.payWinningTraders(matchId, winner);

  return { matchId, winner, txHash, status: 'settled' };
}

/**
 * Find completed on-chain matches that are not yet settled and settle them.
 * Errors are isolated per match so one failure does not block the rest.
 */
export async function reconcileSettlements(limit = 100): Promise<ReconcileResult[]> {
  const completed = await matchesDb.listCompletedGames(limit);
  const results: ReconcileResult[] = [];

  for (const g of completed) {
    // Only on-chain (numeric) matches with a decisive winner are settleable.
    if (!/^\d+$/.test(g.match_id) || !g.winner) continue;
    // Skip rows we already have a settlement tx for.
    if (g.settlement_tx_hash) continue;

    try {
      const r = await reconcileOne(g.match_id, g.winner as Winner);
      results.push(r);
      if (r.status === 'settled') {
        console.log(`[reconcile] settled #${r.matchId} (winner ${r.winner}) tx ${r.txHash}`);
      }
    } catch (e) {
      const detail = (e as Error).message;
      results.push({ matchId: g.match_id, winner: g.winner as Winner, txHash: null, status: 'error', detail });
      console.error(`[reconcile] failed to settle #${g.match_id}:`, detail);
    }
  }

  const settled = results.filter((r) => r.status === 'settled').length;
  const errors = results.filter((r) => r.status === 'error').length;
  if (settled || errors) {
    console.log(`[reconcile] done — ${settled} settled, ${errors} error(s)`);
  }
  return results;
}
