// Frontend Soroban contract helpers (README §7.9, adapted to SDK v12):
// simulate → assemble → sign with the wallets kit → send → poll.
//
// When the NEXT_PUBLIC_*_ID env vars are unset (pre-deployment) every entry
// point throws ContractsNotDeployedError so the UI can degrade gracefully.

import {
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
  rpc,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';
import { getKit, getRpcServer, NETWORK_PASSPHRASE } from './stellar';
import { usdcToStroops } from './usdc';
import { ensureKitWallet } from '@/hooks/useWallet';
import type { Outcome } from '@/types/trading';
import type { Winner, DisputeOutcome } from '@/types/anticheat';

// --- Contract ids (inlined by Next at build time) -----------------------------

const CONTRACT_IDS = {
  matchRegistry: process.env.NEXT_PUBLIC_MATCH_REGISTRY_ID,
  escrowVault: process.env.NEXT_PUBLIC_ESCROW_VAULT_ID,
  predictionPool: process.env.NEXT_PUBLIC_PREDICTION_POOL_ID,
  oracleGateway: process.env.NEXT_PUBLIC_ORACLE_GATEWAY_ID,
  settlement: process.env.NEXT_PUBLIC_SETTLEMENT_ID,
  usdc: process.env.NEXT_PUBLIC_USDC_CONTRACT_ID,
} as const;

export class ContractsNotDeployedError extends Error {
  constructor(envVar: string) {
    super(
      `Contracts not deployed yet — ${envVar} is not set. ` +
        'Deploy the Soroban contracts (scripts/deploy-all.sh) and add the ' +
        'contract ids to frontend/.env.local, then restart the dev server.',
    );
    this.name = 'ContractsNotDeployedError';
  }
}

function requireContractId(
  key: keyof typeof CONTRACT_IDS,
  envVar: string,
): string {
  const id = CONTRACT_IDS[key];
  if (!id) throw new ContractsNotDeployedError(envVar);
  return id;
}

/** True when the on-chain write path is usable (registry + pool + USDC set). */
export const contractsConfigured = Boolean(
  CONTRACT_IDS.matchRegistry && CONTRACT_IDS.predictionPool && CONTRACT_IDS.usdc,
);

// --- Core invoke pipeline ------------------------------------------------------

const CONFIRM_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_200;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Build, simulate, assemble, sign (via the wallets kit) and submit a contract
 * invocation, then poll until it is confirmed. Returns the native return value.
 */
async function invokeWithWallet(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerAddress: string,
): Promise<unknown> {
  const server = getRpcServer();
  const account = await server.getAccount(signerAddress);

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

  await ensureKitWallet(); // restore persisted wallet selection after reloads
  const kit = await getKit();
  const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: signerAddress,
  });

  const signed = TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error(
      `Transaction submission failed (${
        sent.errorResult ? sent.errorResult.result().switch().name : 'unknown'
      })`,
    );
  }

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let result = await server.getTransaction(sent.hash);
  while (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for transaction confirmation.');
    }
    await sleep(POLL_INTERVAL_MS);
    result = await server.getTransaction(sent.hash);
  }

  if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error('Transaction failed on-chain.');
  }

  return result.returnValue ? scValToNative(result.returnValue) : null;
}

// --- Public contract entry points ---------------------------------------------

/**
 * Approve USDC spending by a contract (SEP-41 `approve`). The expiration
 * ledger is derived from the live ledger height.
 */
export async function approveUsdc(
  owner: string,
  spender: string,
  amountStroops: bigint,
): Promise<void> {
  const usdcId = requireContractId('usdc', 'NEXT_PUBLIC_USDC_CONTRACT_ID');
  const server = getRpcServer();
  const latest = await server.getLatestLedger();
  // ~1 week of ledgers (5s each) — comfortably under the network max.
  const expirationLedger = latest.sequence + 120_000;

  await invokeWithWallet(
    usdcId,
    'approve',
    [
      nativeToScVal(owner, { type: 'address' }),
      nativeToScVal(spender, { type: 'address' }),
      nativeToScVal(amountStroops, { type: 'i128' }),
      nativeToScVal(expirationLedger, { type: 'u32' }),
    ],
    owner,
  );
}

/**
 * Create a match: approve USDC to MatchRegistry, then call `create_match`.
 * Returns the on-chain match id as a string.
 */
export async function createMatch(
  playerAddress: string,
  betAmountUsdc: number | string,
  timeControlSecs: number,
): Promise<string> {
  const registryId = requireContractId(
    'matchRegistry',
    'NEXT_PUBLIC_MATCH_REGISTRY_ID',
  );
  const betStroops = usdcToStroops(betAmountUsdc);

  await approveUsdc(playerAddress, registryId, betStroops);

  const matchId = await invokeWithWallet(
    registryId,
    'create_match',
    [
      nativeToScVal(playerAddress, { type: 'address' }),
      nativeToScVal(betStroops, { type: 'i128' }),
      nativeToScVal(timeControlSecs, { type: 'u32' }),
    ],
    playerAddress,
  );

  if (matchId === null || matchId === undefined) {
    throw new Error('create_match returned no match id.');
  }
  return String(matchId);
}

/** Join an open match: approve the same bet amount, then `join_match`. */
export async function joinMatch(
  playerAddress: string,
  matchId: string | bigint,
  betAmountStroops: bigint,
): Promise<void> {
  const registryId = requireContractId(
    'matchRegistry',
    'NEXT_PUBLIC_MATCH_REGISTRY_ID',
  );

  await approveUsdc(playerAddress, registryId, betAmountStroops);

  await invokeWithWallet(
    registryId,
    'join_match',
    [
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
      nativeToScVal(playerAddress, { type: 'address' }),
    ],
    playerAddress,
  );
}

/**
 * Place a parimutuel trade: approve USDC to PredictionPool, then
 * `buy_outcome(match_id, trader, outcome, amount)`.
 */
export async function placeTrade(
  matchId: string | bigint,
  traderAddress: string,
  outcome: Outcome,
  amountStroops: bigint,
): Promise<void> {
  const poolId = requireContractId(
    'predictionPool',
    'NEXT_PUBLIC_PREDICTION_POOL_ID',
  );

  await approveUsdc(traderAddress, poolId, amountStroops);

  // Soroban enum unit variants encode as Vec[Symbol].
  const outcomeScVal = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(outcome)]);

  await invokeWithWallet(
    poolId,
    'buy_outcome',
    [
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
      nativeToScVal(traderAddress, { type: 'address' }),
      outcomeScVal,
      nativeToScVal(amountStroops, { type: 'i128' }),
    ],
    traderAddress,
  );
}

// --- Dispute resolution ---------------------------------------------------

/** Soroban enum unit variants encode as Vec[Symbol]. */
function winnerScVal(winner: Winner): xdr.ScVal {
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(winner)]);
}

/**
 * Data-carrying enum variants encode as Vec[Symbol(variant), ...fields].
 * Mirrors `contracts::settlement::state::DisputeOutcome`.
 */
function disputeOutcomeScVal(outcome: DisputeOutcome): xdr.ScVal {
  if (outcome.tag === 'Uphold' || outcome.tag === 'Void') {
    return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(outcome.tag)]);
  }
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Reverse'), winnerScVal(outcome.winner)]);
}

/**
 * Open a dispute against a match's pending result, inside the challenge
 * window. Callable by either match player (or the arbiter). Player-signed —
 * mirrors `createMatch`/`placeTrade`, not a relayer-signed call.
 */
export async function dispute(
  matchId: string | bigint,
  disputerAddress: string,
  reason: string,
): Promise<void> {
  const settlementId = requireContractId('settlement', 'NEXT_PUBLIC_SETTLEMENT_ID');

  await invokeWithWallet(
    settlementId,
    'dispute',
    [
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
      nativeToScVal(disputerAddress, { type: 'address' }),
      nativeToScVal(Buffer.from(reason, 'utf8'), { type: 'bytes' }),
    ],
    disputerAddress,
  );
}

/**
 * Arbiter-only. Resolves a disputed match: uphold the original result,
 * reverse to a different winner, or void (settled as a Draw).
 */
export async function resolveDispute(
  matchId: string | bigint,
  arbiterAddress: string,
  outcome: DisputeOutcome,
): Promise<void> {
  const settlementId = requireContractId('settlement', 'NEXT_PUBLIC_SETTLEMENT_ID');

  await invokeWithWallet(
    settlementId,
    'resolve_dispute',
    [
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
      nativeToScVal(arbiterAddress, { type: 'address' }),
      disputeOutcomeScVal(outcome),
    ],
    arbiterAddress,
  );
}
