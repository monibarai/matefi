// Trading / prediction-market types (README §5.5, §9).

/** The three parimutuel outcomes — symbol names match the Soroban enum. */
export type Outcome = 'PlayerA' | 'PlayerB' | 'Draw';

export const OUTCOMES: Outcome[] = ['PlayerA', 'PlayerB', 'Draw'];

/** Pool sizes in USDC stroops (1 USDC = 1e7). */
export interface PoolState {
  poolA: number;
  poolB: number;
  poolDraw: number;
}

/**
 * Odds as produced by `PredictionPool.get_odds` — scaled by 100
 * (185 means a 1.85x return). 0 means "no liquidity in that bucket".
 */
export interface OddsState {
  oddsA: number;
  oddsB: number;
  oddsDraw: number;
}

/** A row from the relayer's `traders` table. */
export interface TraderRecord {
  id: number;
  match_id: string;
  trader_address: string;
  outcome: Outcome;
  amount_stroops: string | number;
  tx_hash: string | null;
  created_at: string;
}

export type MarketPhase = 'open' | 'locked' | 'settled';
