// Re-export Soroban RPC server, network passphrase, and the full SDK
// from the canonical stellar.ts configuration.  Components may import
// from here when they want a single "bring everything" entry point.

export { getRpcServer as server, NETWORK_PASSPHRASE as networkPassphrase } from './stellar';

// Named convenience re-exports for components that need raw SDK types.
export {
  rpc,
  Contract,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Level 1 spec API — XLM balance + payment helpers via @stellar/stellar-sdk.
// Explicit imports, Testnet-only, each async call error-handled by the caller.
// ─────────────────────────────────────────────────────────────────────────────

import { Horizon, TransactionBuilder as TxBuilder, Operation as Op, Asset as StellarAsset, Networks as Net, BASE_FEE as BaseFee } from '@stellar/stellar-sdk';
import { HORIZON_TESTNET_URL } from './stellar-wallet';

interface HorizonBalanceLine {
  asset_type: string;
  balance: string;
}

/**
 * Fetch the native XLM balance for an account from Horizon Testnet.
 * Returns "0" for an unfunded account (HTTP 404).
 */
export async function fetchXlmBalance(address: string): Promise<string> {
  const res = await fetch(`${HORIZON_TESTNET_URL}/accounts/${address}`);
  if (res.status === 404) {
    return '0';
  }
  if (!res.ok) {
    throw new Error(`Horizon error: HTTP ${res.status}`);
  }
  const data: { balances: HorizonBalanceLine[] } = await res.json();
  const native = data.balances.find((b) => b.asset_type === 'native');
  return native?.balance ?? '0';
}

/**
 * Build an unsigned native-payment transaction and return its base64 XDR.
 * Loads the source account from Horizon Testnet.
 */
export async function buildPaymentXdr(from: string, to: string, amount: string): Promise<string> {
  const server = new Horizon.Server(HORIZON_TESTNET_URL);
  const account = await server.loadAccount(from);
  const transaction = new TxBuilder(account, {
    fee: BaseFee,
    networkPassphrase: Net.TESTNET,
  })
    .addOperation(
      Op.payment({
        destination: to,
        asset: StellarAsset.native(),
        amount,
      }),
    )
    .setTimeout(30)
    .build();
  return transaction.toXDR();
}

/** Submit a signed transaction XDR to Horizon Testnet, returning the tx hash. */
export async function submitSignedTx(signedXdr: string): Promise<{ hash: string }> {
  const server = new Horizon.Server(HORIZON_TESTNET_URL);
  const tx = TxBuilder.fromXDR(signedXdr, Net.TESTNET);
  const response = await server.submitTransaction(tx);
  return { hash: response.hash };
}
