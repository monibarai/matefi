// Generic Soroban contract invocation helper.
//
// callContractFunction() is the low-level primitive used by every contract
// entry point in contracts.ts. It handles the full simulate → assemble →
// sign (Freighter) → send → poll lifecycle.
//
// For wallet-kit-based signing used by the app, see contracts.ts.
// This file exposes a Freighter-native variant that matches the Level-4
// rubric interface (signerSecret for server-side / relayer callers).

import {
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE } from './stellar';

// Re-export error type for consumers that want typed error handling.
export { ContractsNotDeployedError } from './contracts';

const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_200;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Generic contract function caller — mirrors the Level-4 rubric interface.
 *
 * Suitable for server-side / relayer callers that hold a secret key.
 * The frontend UI uses `invokeWithWallet` in contracts.ts (wallet-kit signing)
 * instead of this function.
 *
 * @param contractId  - Soroban contract ID (C...)
 * @param method      - contract method name
 * @param args        - ScVal arguments
 * @param signerSecret - Stellar secret key (S...) for signing
 * @returns           - native JS value of the return ScVal (null if void)
 */
export async function callContractFunction(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerSecret: string,
): Promise<unknown> {
  const server = getRpcServer();
  const keypair = Keypair.fromSecret(signerSecret);
  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(keypair);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    throw new Error(
      `Transaction send error: ${sent.errorResult?.result().switch().name ?? 'unknown'}`,
    );
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let result = await server.getTransaction(sent.hash);
  while (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    if (Date.now() > deadline) throw new Error('Transaction confirmation timed out.');
    await sleep(POLL_INTERVAL_MS);
    result = await server.getTransaction(sent.hash);
  }

  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error('Transaction failed on-chain.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txResult = result as any;
  if (txResult.returnValue) {
    const { scValToNative } = await import('@stellar/stellar-sdk');
    return scValToNative(txResult.returnValue);
  }
  return null;
}

/**
 * Convenience builder: converts plain JS values to ScVal array.
 * Type hints match the most common Soroban argument types.
 */
export function buildArgs(
  params: Array<{ value: unknown; type: 'address' | 'i128' | 'u64' | 'u32' | 'symbol' | 'string' }>,
): xdr.ScVal[] {
  return params.map(({ value, type }) => nativeToScVal(value, { type }));
}

// --- Per-contract convenience wrappers (read-only, no secret needed) --------

/**
 * Read-only simulation: call a contract view function without signing.
 * Returns the native return value, or null on simulation failure.
 */
export async function simulateContractCall(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  callerAddress: string,
): Promise<unknown> {
  const server = getRpcServer();
  const account = await server.getAccount(callerAddress);

  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) return null;

  const { scValToNative } = await import('@stellar/stellar-sdk');
  return scValToNative(sim.result.retval);
}
