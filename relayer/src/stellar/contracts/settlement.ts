// src/stellar/contracts/settlement.ts — settlement helpers.
//
// Settlement.execute() is triggered on-chain by OracleGateway.post_result();
// the relayer never calls it directly. What the relayer DOES do after a match
// settles is run the permissionless pay_trader claims for every winning
// trader recorded in the local `traders` table (README step 7.9).
import { listWinningTraders } from '../../db/queries/traders';
import { predictionPool, Outcome } from './predictionPool';

export interface TraderPayout {
  trader: string;
  payoutStroops: bigint;
}

export const settlement = {
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
