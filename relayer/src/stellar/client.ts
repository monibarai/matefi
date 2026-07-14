// src/stellar/client.ts — Soroban RPC client + shared invoke/read helpers.
//
// @stellar/stellar-sdk v12 — SorobanRpc namespace (v13+ renamed it to `rpc`;
// pin ^12 or adapt the import if upgrading).
import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { config, isContractConfigured } from '../config';
import { getRelayerKeypair } from './signer';

let server: SorobanRpc.Server | null = null;

export function getRpcServer(): SorobanRpc.Server {
  if (!server) {
    server = new SorobanRpc.Server(config.SOROBAN_RPC_URL, {
      allowHttp: config.SOROBAN_RPC_URL.startsWith('http://'),
    });
  }
  return server;
}

/**
 * Guard used by every wrapper: when a contract ID is unconfigured (pre-deploy
 * local development) we log a warning and skip the call entirely.
 */
export function contractCallEnabled(contractId: string, label: string): boolean {
  if (!isContractConfigured(contractId)) {
    console.warn(`[stellar] ${label}: contract ID not configured — skipping on-chain call (no-op)`);
    return false;
  }
  if (!getRelayerKeypair()) {
    console.warn(`[stellar] ${label}: relayer keypair unavailable — skipping on-chain call (no-op)`);
    return false;
  }
  return true;
}

/** Result of a write-path invocation: the on-chain tx hash plus return value. */
export interface InvokeResult {
  /** The transaction hash — the canonical on-chain reference for this call. */
  hash: string;
  /** Native-decoded contract return value (or null). */
  returnValue: unknown;
}

/**
 * Full write-path invocation: simulate → assemble → sign → send → poll.
 * Returns the native-decoded return value (or null). Use {@link invokeContractTx}
 * when the caller also needs the transaction hash (e.g. to persist it).
 */
export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<unknown> {
  return (await invokeContractTx(contractId, method, args)).returnValue;
}

/**
 * Same as {@link invokeContract} but also returns the transaction hash. The
 * relayer submits this transaction itself, so its hash is the authoritative
 * reference for whatever the call triggered on-chain (e.g. `post_result`
 * atomically runs `Settlement.execute`, so this hash IS the settlement tx).
 */
export async function invokeContractTx(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<InvokeResult> {
  const rpc = getRpcServer();
  const keypair = getRelayerKeypair();
  if (!keypair) throw new Error('Relayer keypair not configured');

  const account = await rpc.getAccount(keypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: config.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed for ${method}: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(keypair);

  const sendResult = await rpc.sendTransaction(preparedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`sendTransaction failed for ${method}: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for confirmation
  let getResult = await rpc.getTransaction(sendResult.hash);
  let attempts = 0;
  while (getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 30) {
    await new Promise((r) => setTimeout(r, 1000));
    getResult = await rpc.getTransaction(sendResult.hash);
    attempts++;
  }

  if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Transaction ${sendResult.hash} failed on-chain (${method})`);
  }
  if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction ${sendResult.hash} not confirmed (${method})`);
  }

  const retval = getResult.returnValue;
  return { hash: sendResult.hash, returnValue: retval ? scValToNative(retval) : null };
}

/**
 * Read-only invocation via simulateTransaction (no fees, no signature needed
 * beyond a source account).
 */
export async function readContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<unknown> {
  const rpc = getRpcServer();
  const keypair = getRelayerKeypair();
  if (!keypair) throw new Error('Relayer keypair not configured');

  const account = await rpc.getAccount(keypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: config.NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await getRpcServer().simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationSuccess(sim) && sim.result) {
    return scValToNative(sim.result.retval);
  }
  return null;
}

/** Build an enum-unit ScVal like Outcome::PlayerA / Winner::Draw. */
export function enumScVal(variant: string): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]);
}
