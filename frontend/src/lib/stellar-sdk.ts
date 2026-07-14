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
