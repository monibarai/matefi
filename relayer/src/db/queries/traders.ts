// src/db/queries/traders.ts — query helpers for the traders collection.
import { collection, nextSeq } from '../client';

export interface TraderRow {
  id: number;
  match_id: string;
  trader_address: string;
  outcome: 'PlayerA' | 'PlayerB' | 'Draw';
  amount_stroops: string; // stored as string to preserve exact stroop precision
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
  const col = await collection('traders');
  const amount = params.amountStroops.toString();
  const txHash = params.txHash ?? null;

  if (txHash !== null) {
    // Idempotent for on-chain bets: the unique partial index on the natural key
    // makes a replayed BetPlaced event a no-op (== ON CONFLICT DO NOTHING).
    await col.updateOne(
      {
        match_id: params.matchId,
        trader_address: params.traderAddress,
        outcome: params.outcome,
        amount_stroops: amount,
        tx_hash: txHash,
      },
      {
        $setOnInsert: {
          id: await nextSeq('traders'),
          match_id: params.matchId,
          trader_address: params.traderAddress,
          outcome: params.outcome,
          amount_stroops: amount,
          tx_hash: txHash,
          created_at: new Date(),
        },
      },
      { upsert: true }
    );
    return;
  }

  // Dev insert (no tx hash) — unconstrained, mirrors the old NULL-tx_hash rows.
  await col.insertOne({
    id: await nextSeq('traders'),
    match_id: params.matchId,
    trader_address: params.traderAddress,
    outcome: params.outcome,
    amount_stroops: amount,
    tx_hash: null,
    created_at: new Date(),
  });
}

export async function listTraders(matchId: string): Promise<TraderRow[]> {
  const col = await collection('traders');
  const rows = await col
    .find({ match_id: matchId }, { projection: { _id: 0 } })
    .sort({ created_at: 1 })
    .toArray();
  return rows as unknown as TraderRow[];
}

/** Distinct winning traders for a settled match — used for permissionless pay_trader claims. */
export async function listWinningTraders(
  matchId: string,
  winningOutcome: 'PlayerA' | 'PlayerB' | 'Draw'
): Promise<string[]> {
  const col = await collection('traders');
  const addresses = await col.distinct('trader_address', {
    match_id: matchId,
    outcome: winningOutcome,
  });
  return addresses as string[];
}
