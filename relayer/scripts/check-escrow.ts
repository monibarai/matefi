// scripts/check-escrow.ts — read escrow deposit records + the vault's actual
// USDC balance, to explain why settlement release fails.
import { nativeToScVal, Address } from '@stellar/stellar-sdk';
import { config } from '../src/config';
import { readContract } from '../src/stellar/client';
import { closeDb } from '../src/db/client';

async function main() {
  const escrow = config.ESCROW_VAULT_CONTRACT_ID;
  console.log(`Escrow vault: ${escrow}`);

  // Actual USDC the escrow contract holds.
  const bal = await readContract(config.USDC_CONTRACT_ID, 'balance', [
    nativeToScVal(Address.fromString(escrow), { type: 'address' }),
  ]);
  console.log(`Escrow USDC balance: ${bal} stroops`);

  for (const matchId of ['3', '5', '6', '7', '8']) {
    try {
      const rec = await readContract(escrow, 'get_record', [
        nativeToScVal(BigInt(matchId), { type: 'u64' }),
      ]);
      console.log(`  #${matchId} deposit record:`, JSON.stringify(rec, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    } catch (e) {
      console.log(`  #${matchId} get_record error:`, (e as Error).message);
    }
  }
}

main().catch((e) => console.error(e)).finally(() => closeDb());
