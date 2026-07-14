// scripts/check-settlement.ts — read-only on-chain settlement audit.
// For each completed numeric match, prints whether the on-chain prediction
// market is locked/settled. `settled=false` means the winner was NOT paid yet.
import { predictionPool } from '../src/stellar/contracts/predictionPool';
import * as matchesDb from '../src/db/queries/matches';
import { closeDb } from '../src/db/client';

async function main() {
  const completed = await matchesDb.listCompletedGames(100);
  const onchain = completed.filter((g) => /^\d+$/.test(g.match_id));
  console.log(`Auditing ${onchain.length} completed on-chain match(es):\n`);

  for (const g of onchain) {
    const market = await predictionPool.getMarket(g.match_id);
    if (!market) {
      console.log(`  #${g.match_id}: no on-chain market found`);
      continue;
    }
    console.log(
      `  #${g.match_id} winner=${g.winner} ` +
        `locked=${market.locked} settled=${market.settled} ` +
        `pools(A/B/Draw)=${market.pool_a}/${market.pool_b}/${market.pool_draw} ` +
        `vol=${market.total_volume}`
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => closeDb());
