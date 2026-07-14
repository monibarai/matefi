// src/stellar/contracts/escrowVault.ts — EscrowVault call wrappers.
//
// The vault has no relayer-facing write methods (deposits flow through
// MatchRegistry, releases through Settlement). Only the read path is exposed.
import { nativeToScVal } from '@stellar/stellar-sdk';
import { config } from '../../config';
import { contractCallEnabled, readContract } from '../client';

export interface DepositRecordView {
  player_a: string;
  player_b: string | null;
  amount_each: bigint;
  total_locked: bigint;
  released: boolean;
}

export const escrowVault = {
  /** Read-only: get_record(match_id). */
  async getRecord(matchId: string): Promise<DepositRecordView | null> {
    if (!contractCallEnabled(config.ESCROW_VAULT_CONTRACT_ID, 'escrow.getRecord')) return null;
    if (!/^\d+$/.test(matchId)) {
      console.warn(`[stellar] escrow.getRecord: matchId "${matchId}" is not an on-chain u64 — skipping`);
      return null;
    }
    const result = await readContract(config.ESCROW_VAULT_CONTRACT_ID, 'get_record', [
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
    ]);
    return (result as DepositRecordView) ?? null;
  },
};
