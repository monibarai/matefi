// src/db/queries/traders.ts — query helpers for the traders table.
import { db } from '../client';

export interface TraderRow {
  id: number;
  match_id: string;
  trader_address: string;
  outcome: 'PlayerA' | 'PlayerB' | 'Draw';
  amount_stroops: string; // BIGINT as string
  tx_hash: string | null;
  created_at: Date;
}

export async function insertTrader(params: {
  matchId: string;
  traderAddress: string;
  outcome: string;
  amountStroops: bigint | number | string;
  txHash?: string | null;
}): Promise<void> {
  // Idempotent for on-chain bets: the partial unique index on the natural key
  // (match_id, trader, outcome, amount, tx_hash) makes a replayed BetPlaced
  // event a no-op. Rows with a NULL tx_hash (dev inserts) are unconstrained.
  await db.query(
    `INSERT INTO traders (match_id, trader_address, outcome, amount_stroops, tx_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (match_id, trader_address, outcome, amount_stroops, tx_hash)
       WHERE tx_hash IS NOT NULL DO NOTHING`,
    [
      params.matchId,
      params.traderAddress,
      params.outcome,
      params.amountStroops.toString(),
      params.txHash ?? null,
    ]
  );
}

export async function listTraders(matchId: string): Promise<TraderRow[]> {
  const res = await db.query(
    'SELECT * FROM traders WHERE match_id = $1 ORDER BY created_at ASC',
    [matchId]
  );
  return res.rows;
}

/** Distinct winning traders for a settled match — used for permissionless pay_trader claims. */
export async function listWinningTraders(
  matchId: string,
  winningOutcome: 'PlayerA' | 'PlayerB' | 'Draw'
): Promise<string[]> {
  const res = await db.query(
    `SELECT DISTINCT trader_address FROM traders WHERE match_id = $1 AND outcome = $2`,
    [matchId, winningOutcome]
  );
  return res.rows.map((r: { trader_address: string }) => r.trader_address);
}
