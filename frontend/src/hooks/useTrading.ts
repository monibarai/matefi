'use client';

// Trading hook — odds math + on-chain bet placement via PredictionPool.

import { useCallback, useState } from 'react';
import { placeTrade, ContractsNotDeployedError } from '@/lib/contracts';
import { usdcToStroops } from '@/lib/usdc';
import { useWallet } from './useWallet';
import type { Outcome, OddsState, PoolState } from '@/types/trading';

/**
 * Client-side parimutuel odds (README §9): net = total × 0.97,
 * odds_x = net / pool_x, scaled by 100 like `PredictionPool.get_odds`.
 */
export function deriveOddsFromPools(pools: PoolState): OddsState {
  const total = pools.poolA + pools.poolB + pools.poolDraw;
  if (total <= 0) return { oddsA: 0, oddsB: 0, oddsDraw: 0 };
  const net = total * 0.97;
  return {
    oddsA: pools.poolA > 0 ? Math.round((net / pools.poolA) * 100) : 0,
    oddsB: pools.poolB > 0 ? Math.round((net / pools.poolB) * 100) : 0,
    oddsDraw: pools.poolDraw > 0 ? Math.round((net / pools.poolDraw) * 100) : 0,
  };
}

/** Implied probability of an outcome as a 0–100 percentage. */
export function impliedProbability(pool: number, total: number): number {
  if (total <= 0) return 0;
  return (pool / total) * 100;
}

export interface UseTradingResult {
  placeBet: (outcome: Outcome, amountUsdc: string) => Promise<boolean>;
  placing: boolean;
  error: string | null;
  success: boolean;
  reset: () => void;
}

export function useTrading(matchId: string): UseTradingResult {
  const { address } = useWallet();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  const placeBet = useCallback(
    async (outcome: Outcome, amountUsdc: string): Promise<boolean> => {
      setError(null);
      setSuccess(false);

      if (!address) {
        setError('Connect a wallet to place a trade.');
        return false;
      }

      let amountStroops: bigint;
      try {
        amountStroops = usdcToStroops(amountUsdc);
      } catch {
        setError('Enter a valid USDC amount.');
        return false;
      }
      if (amountStroops < usdcToStroops(1)) {
        setError('Minimum bet is 1 USDC.');
        return false;
      }

      setPlacing(true);
      try {
        await placeTrade(matchId, address, outcome, amountStroops);
        setSuccess(true);
        return true;
      } catch (e) {
        if (e instanceof ContractsNotDeployedError) {
          setError(e.message);
        } else {
          setError(e instanceof Error ? e.message : 'Transaction failed.');
        }
        return false;
      } finally {
        setPlacing(false);
      }
    },
    [address, matchId],
  );

  return { placeBet, placing, error, success, reset };
}
