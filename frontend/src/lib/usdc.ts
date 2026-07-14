// USDC helpers — conversions and balance reads.
//
// Canonical decimals (README §10): Stellar USDC has 7 decimal places.
//   1 USDC = 10_000_000 stroops (1e7)

import {
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
} from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE } from './stellar';

export const USDC_DECIMALS = 7;
export const STROOPS_PER_USDC = 10_000_000n; // 1e7

/**
 * Convert a human USDC amount ("12.5", 100) to stroops without float drift.
 * Throws on malformed or negative input.
 */
export function usdcToStroops(amount: string | number): bigint {
  const raw = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid USDC amount: "${amount}"`);
  }
  const [whole, frac = ''] = raw.split('.');
  const fracPadded = (frac + '0'.repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * STROOPS_PER_USDC + BigInt(fracPadded);
}

/** Convert stroops (bigint | number | numeric string) to a USDC number. */
export function stroopsToUsdc(stroops: bigint | number | string): number {
  try {
    return Number(BigInt(stroops)) / Number(STROOPS_PER_USDC);
  } catch {
    const n = Number(stroops);
    return Number.isFinite(n) ? n / Number(STROOPS_PER_USDC) : 0;
  }
}

/** Format stroops as a display string, e.g. 1_234_500_000n -> "123.45". */
export function formatUsdc(
  stroops: bigint | number | string,
  opts: { decimals?: number; compact?: boolean } = {},
): string {
  const value = stroopsToUsdc(stroops);
  const decimals = opts.decimals ?? 2;
  if (opts.compact && Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Read a USDC balance via a simulated `balance(address)` call on the token
 * contract. Returns null when the USDC contract id is not configured or the
 * read fails (account unfunded, RPC down, …) — callers degrade gracefully.
 */
export async function fetchUsdcBalance(address: string): Promise<bigint | null> {
  const usdcId = process.env.NEXT_PUBLIC_USDC_CONTRACT_ID;
  if (!usdcId || !address) return null;

  try {
    const server = getRpcServer();
    const account = await server.getAccount(address);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        new Contract(usdcId).call(
          'balance',
          nativeToScVal(address, { type: 'address' }),
        ),
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const native = scValToNative(sim.result.retval);
      return typeof native === 'bigint' ? native : BigInt(native ?? 0);
    }
    return null;
  } catch {
    return null;
  }
}
