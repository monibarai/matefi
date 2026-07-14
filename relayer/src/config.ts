// src/config.ts — env vars, contract addresses, shared constants.
import dotenv from 'dotenv';

dotenv.config();

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function intEnv(name: string, fallback: number): number {
  const v = Number.parseInt(env(name), 10);
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  // Stellar
  SOROBAN_RPC_URL: env('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),
  NETWORK_PASSPHRASE: env('NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015'),
  RELAYER_SECRET: env('RELAYER_SECRET'),

  // Contract addresses (empty until deployed — all calls no-op with a warning)
  MATCH_REGISTRY_CONTRACT_ID: env('MATCH_REGISTRY_CONTRACT_ID'),
  ESCROW_VAULT_CONTRACT_ID: env('ESCROW_VAULT_CONTRACT_ID'),
  PREDICTION_POOL_CONTRACT_ID: env('PREDICTION_POOL_CONTRACT_ID'),
  ORACLE_GATEWAY_CONTRACT_ID: env('ORACLE_GATEWAY_CONTRACT_ID'),
  SETTLEMENT_CONTRACT_ID: env('SETTLEMENT_CONTRACT_ID'),
  USDC_CONTRACT_ID: env('USDC_CONTRACT_ID'),
  TREASURY_ADDRESS: env('TREASURY_ADDRESS'),

  // Database
  DATABASE_URL: env('DATABASE_URL', 'postgresql://matefi:matefi@localhost:5432/matefi'),

  // Server
  PORT: intEnv('PORT', 3000),
  WS_PORT: intEnv('WS_PORT', 3001),

  // Relayer behaviour
  DEV_MODE: env('DEV_MODE', 'false').toLowerCase() === 'true',
  STOCKFISH_DEPTH: intEnv('STOCKFISH_DEPTH', 18),
  EVAL_THRESHOLD: intEnv('EVAL_THRESHOLD', 250),
  // The market locks only after the decisive advantage (|eval| ≥ threshold)
  // holds for this many *consecutive* evaluations on the same side. A single
  // move (e.g. a capture before the recapture) produces a one-ply eval spike
  // that should NOT close the market — chess games are not decided by one move.
  // A forced mate bypasses this and locks immediately.
  EVAL_LOCK_CONFIRMATIONS: Math.max(1, intEnv('EVAL_LOCK_CONFIRMATIONS', 3)),
  EVENT_POLL_INTERVAL_MS: intEnv('EVENT_POLL_INTERVAL_MS', 5000),
  // On startup the event listener begins polling this many ledgers *before* the
  // current one, so settlements/bets emitted while the relayer was down are not
  // missed (and recent ones are backfilled). ~12h at 5s/ledger by default;
  // clamped to whatever the RPC still retains. 0 = start at the current ledger.
  EVENT_START_LOOKBACK_LEDGERS: Math.max(0, intEnv('EVENT_START_LOOKBACK_LEDGERS', 8640)),
  // When true, on startup the relayer settles any completed on-chain match whose
  // settlement never executed (winner unpaid, no settlement tx). This moves
  // funds on-chain, so it is opt-in; run `npm run reconcile` manually otherwise.
  RECONCILE_ON_START: env('RECONCILE_ON_START', 'false').toLowerCase() === 'true',
};

/**
 * Canonical USDC precision on Stellar: 7 decimal places.
 * 1 USDC = 10_000_000 stroops (1e7). README section 10.
 * (Some README pseudocode snippets wrongly used 1e6 — 1e7 is correct.)
 */
export const USDC_STROOPS_PER_UNIT = 10_000_000;

/** A Soroban contract ID is a 56-char StrKey starting with 'C'. */
export function isContractConfigured(id: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(id);
}

export function anyContractConfigured(): boolean {
  return [
    config.MATCH_REGISTRY_CONTRACT_ID,
    config.ESCROW_VAULT_CONTRACT_ID,
    config.PREDICTION_POOL_CONTRACT_ID,
    config.ORACLE_GATEWAY_CONTRACT_ID,
    config.SETTLEMENT_CONTRACT_ID,
  ].some(isContractConfigured);
}
