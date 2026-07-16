// src/jobs/disputeWindowKeeper.ts — polls for matches whose Settlement
// challenge window has elapsed with no dispute and calls `finalize` on their
// behalf. `finalize` is permissionless on-chain (see contracts/settlement),
// so this is one possible caller among many — running it here just means no
// match gets stuck waiting for a human to notice. Addresses the README's
// former "manual settlement trigger, relayer must be online" limitation with
// real redundancy potential: any process holding a funded Stellar account can
// run this same loop.
import { config, isContractConfigured } from '../config';
import { listPendingPastWindow } from '../db/queries/disputeState';
import { settlement } from '../stellar/contracts/settlement';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startDisputeWindowKeeper(): void {
  if (!isContractConfigured(config.SETTLEMENT_CONTRACT_ID)) {
    console.warn('[keeper] settlement contract not configured — dispute window keeper disabled');
    return;
  }
  console.log(`[keeper] dispute window keeper polling every ${config.DISPUTE_KEEPER_INTERVAL_MS}ms`);
  timer = setInterval(() => void tick(), config.DISPUTE_KEEPER_INTERVAL_MS);
}

export function stopDisputeWindowKeeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  if (running) return; // skip overlapping ticks
  running = true;
  try {
    const due = await listPendingPastWindow(new Date());
    for (const matchId of due) {
      try {
        const hash = await settlement.finalize(matchId);
        if (hash) console.log(`[keeper] finalized #${matchId} (tx ${hash})`);
      } catch (e) {
        // Expected occasionally: another caller (a player, another keeper
        // instance) may have already finalized or disputed this match
        // between our read and this call — not an error worth alarming on.
        console.warn(`[keeper] finalize failed for #${matchId}:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error('[keeper] tick failed:', (e as Error).message);
  } finally {
    running = false;
  }
}
