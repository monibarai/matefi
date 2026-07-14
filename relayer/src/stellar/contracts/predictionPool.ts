// src/stellar/contracts/predictionPool.ts — PredictionPool call wrappers.
import { nativeToScVal } from '@stellar/stellar-sdk';
import { config } from '../../config';
import { contractCallEnabled, enumScVal, invokeContract, readContract } from '../client';

export type Outcome = 'PlayerA' | 'PlayerB' | 'Draw';

export interface MarketView {
  match_id: bigint;
  player_a: string;
  player_b: string;
  pool_a: bigint;
  pool_b: bigint;
  pool_draw: bigint;
  total_volume: bigint;
  locked: boolean;
  lock_eval_score: number | null;
  settled: boolean;
}

function toU64(matchId: string, label: string): bigint | null {
  if (!/^\d+$/.test(matchId)) {
    console.warn(`[stellar] ${label}: matchId "${matchId}" is not an on-chain u64 — skipping (no-op)`);
    return null;
  }
  return BigInt(matchId);
}

export const predictionPool = {
  /** Read-only: get_market(match_id). */
  async getMarket(matchId: string): Promise<MarketView | null> {
    if (!contractCallEnabled(config.PREDICTION_POOL_CONTRACT_ID, 'pool.getMarket')) return null;
    const id = toU64(matchId, 'pool.getMarket');
    if (id === null) return null;

    const result = await readContract(config.PREDICTION_POOL_CONTRACT_ID, 'get_market', [
      nativeToScVal(id, { type: 'u64' }),
    ]);
    return (result as MarketView) ?? null;
  },

  /** Read-only: get_odds(match_id) → [oddsA, oddsB, oddsDraw] scaled by 100. */
  async getOdds(matchId: string): Promise<[number, number, number] | null> {
    if (!contractCallEnabled(config.PREDICTION_POOL_CONTRACT_ID, 'pool.getOdds')) return null;
    const id = toU64(matchId, 'pool.getOdds');
    if (id === null) return null;

    const result = await readContract(config.PREDICTION_POOL_CONTRACT_ID, 'get_odds', [
      nativeToScVal(id, { type: 'u64' }),
    ]);
    if (!result) return null;
    const [a, b, d] = result as Array<number | bigint>;
    return [Number(a), Number(b), Number(d)];
  },

  /**
   * pay_trader(match_id, trader, outcome) — permissionless claim executed by
   * the relayer after settlement, once per winning trader recorded in the
   * local `traders` table. Returns the payout in stroops (or null on no-op).
   */
  async payTrader(matchId: string, trader: string, outcome: Outcome): Promise<bigint | null> {
    if (!contractCallEnabled(config.PREDICTION_POOL_CONTRACT_ID, 'pool.payTrader')) return null;
    const id = toU64(matchId, 'pool.payTrader');
    if (id === null) return null;

    const result = await invokeContract(config.PREDICTION_POOL_CONTRACT_ID, 'pay_trader', [
      nativeToScVal(id, { type: 'u64' }),
      nativeToScVal(trader, { type: 'address' }),
      enumScVal(outcome),
    ]);
    return result === null || result === undefined ? null : BigInt(result as string | number | bigint);
  },
};
