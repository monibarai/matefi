// src/stellar/contracts/settlement.ts — settlement helpers.
//
// Settlement.submit_result() is triggered on-chain by OracleGateway.post_result();
// the relayer never calls it directly. What the relayer DOES call directly is
// `finalize` — permissionless, invoked by the dispute-window keeper
// (`jobs/disputeWindowKeeper.ts`) once a submitted result's challenge window
// has elapsed with no dispute — and, after settlement, run the permissionless
// pay_trader claims for every winning trader recorded in the local `traders`
// table (README step 7.9).
import { nativeToScVal } from '@stellar/stellar-sdk';
import { config } from '../../config';
import { contractCallEnabled, invokeContractTx } from '../client';
import { listWinningTraders } from '../../db/queries/traders';
import { predictionPool, Outcome } from './predictionPool';

export interface TraderPayout {
  trader: string;
  payoutStroops: bigint;
}

/** Numeric on-chain match IDs only; dev/off-chain match IDs (uuids) are skipped. */
function toU64(matchId: string, label: string): bigint | null {
  if (!/^\d+$/.test(matchId)) {
    console.warn(`[stellar] ${label}: matchId "${matchId}" is not an on-chain u64 — skipping (no-op)`);
    return null;
  }
  return BigInt(matchId);
}

export const settlement = {
  /**
   * finalize(match_id) — permissionless. Runs the settlement cascade for a
   * match whose challenge window has elapsed with no dispute. Returns the tx
   * hash, or null when the call is a no-op (contracts unconfigured, dev
   * match id, or the on-chain call reverts because the window hasn't
   * elapsed / the match isn't PendingFinalization — callers should only
   * invoke this once `dispute_state` confirms the window has passed).
   */
  async finalize(matchId: string): Promise<string | null> {
    if (!contractCallEnabled(config.SETTLEMENT_CONTRACT_ID, 'settlement.finalize')) return null;
    const id = toU64(matchId, 'settlement.finalize');
    if (id === null) return null;

    const { hash } = await invokeContractTx(config.SETTLEMENT_CONTRACT_ID, 'finalize', [
      nativeToScVal(id, { type: 'u64' }),
    ]);
    return hash;
  },

  /**
   * Claim payouts for all winning traders of a settled match.
   * No-ops (with warnings) when contracts are unconfigured.
   */
  async payWinningTraders(matchId: string, winner: Outcome): Promise<TraderPayout[]> {
    const winners = await listWinningTraders(matchId, winner);
    if (winners.length === 0) {
      console.log(`[settlement] match ${matchId}: no winning traders to pay`);
      return [];
    }

    const payouts: TraderPayout[] = [];
    for (const trader of winners) {
      try {
        const payout = await predictionPool.payTrader(matchId, trader, winner);
        if (payout !== null) {
          payouts.push({ trader, payoutStroops: payout });
          console.log(`[settlement] match ${matchId}: paid trader ${trader} ${payout} stroops`);
        }
      } catch (e) {
        console.error(`[settlement] pay_trader failed for ${trader} on match ${matchId}:`, (e as Error).message);
      }
    }
    return payouts;
  },
};
