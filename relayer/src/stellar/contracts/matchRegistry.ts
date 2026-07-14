// src/stellar/contracts/matchRegistry.ts — MatchRegistry call wrappers.
import { nativeToScVal } from '@stellar/stellar-sdk';
import { config } from '../../config';
import { contractCallEnabled, readContract } from '../client';

export interface MatchView {
  match_id: bigint;
  player_a: string;
  player_b: string | null;
  bet_amount: bigint;
  time_control_secs: number;
  state: string;
  created_at: bigint;
  started_at: bigint | null;
}

export const matchRegistry = {
  /** Read-only: get_match(match_id). */
  async getMatch(matchId: string): Promise<MatchView | null> {
    if (!contractCallEnabled(config.MATCH_REGISTRY_CONTRACT_ID, 'registry.getMatch')) return null;
    if (!/^\d+$/.test(matchId)) {
      console.warn(`[stellar] registry.getMatch: matchId "${matchId}" is not an on-chain u64 — skipping`);
      return null;
    }
    const result = await readContract(config.MATCH_REGISTRY_CONTRACT_ID, 'get_match', [
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
    ]);
    return (result as MatchView) ?? null;
  },
};
