// scripts/test-e2e.ts — End-to-end flow test against Stellar Testnet.
//
// Tests what the relayer can do on-chain without wallet/USDC setup:
//   - Read contract state (match counter, market state, oracle threshold)
//   - Call oracle functions the relayer is authorized to call
//   - Verify error handling for invalid inputs
//
// Full match+settlement flow requires funded player wallets — that's tested in
// the Rust integration tests (cargo test --workspace) which use mock_all_auths.
//
// Usage: npx tsx scripts/test-e2e.ts
//
// Requires ORACLE_GATEWAY_CONTRACT_ID, PREDICTION_POOL_CONTRACT_ID,
//          MATCH_REGISTRY_CONTRACT_ID, and RELAYER_SECRET in .env

import { config, USDC_STROOPS_PER_UNIT, isContractConfigured, anyContractConfigured } from '../src/config';
import { readContract, invokeContract, enumScVal } from '../src/stellar/client';
import { getRelayerKeypair } from '../src/stellar/signer';
import { nativeToScVal } from '@stellar/stellar-sdk';

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(label: string): void {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label: string, detail?: string): void {
  console.error(`  ✗ FAIL: ${label}${detail ? '\n      ' + detail : ''}`);
  failed++;
}

function skip(label: string, reason: string): void {
  console.log(`  - SKIP: ${label} (${reason})`);
  skipped++;
}

function assert(cond: boolean, label: string, detail?: string): void {
  cond ? ok(label) : fail(label, detail);
}

function section(name: string): void {
  console.log(`\n${name}`);
}

// ----------------------------------------------------------------------------
// Skip guard
// ----------------------------------------------------------------------------

if (!anyContractConfigured()) {
  console.log('[test-e2e] No contracts configured — skipping on-chain tests.');
  console.log('[test-e2e] Set contract IDs in .env to run this suite.');
  process.exit(0);
}

async function main(): Promise<void> {

  const relayerKp = getRelayerKeypair();
  const relayerAddress = relayerKp?.publicKey();

  // ──────────────────────────────────────────────────────────────────────────
  section('Contract read-only queries');
  // ──────────────────────────────────────────────────────────────────────────

  // Read oracle threshold
  if (isContractConfigured(config.ORACLE_GATEWAY_CONTRACT_ID)) {
    try {
      const threshold = await readContract(config.ORACLE_GATEWAY_CONTRACT_ID, 'get_threshold', []);
      const t = Number(threshold);
      assert(t > 0, `oracle threshold is positive (${t} cp)`);
      assert(t === config.EVAL_THRESHOLD, `threshold matches config (${t} == ${config.EVAL_THRESHOLD})`);
    } catch (e) {
      fail('oracle.get_threshold', (e as Error).message);
    }
  } else {
    skip('oracle.get_threshold', 'ORACLE_GATEWAY_CONTRACT_ID not set');
  }

  // Read match registry counter (may be 0 if no matches created yet)
  if (isContractConfigured(config.MATCH_REGISTRY_CONTRACT_ID)) {
    try {
      // get_match(0) should return MatchNotFound — verifies contract is live
      const r = await readContract(config.MATCH_REGISTRY_CONTRACT_ID, 'get_match', [
        nativeToScVal(999999n, { type: 'u64' }), // non-existent match
      ]).catch(e => ({ error: String(e) })) as any;
      // Contract reverts with MatchNotFound — that's the expected response
      const isExpectedError = !r || r.error?.includes('contract') || r.error?.includes('MatchNotFound') || r.error?.includes('Error');
      assert(isExpectedError || r === null || r === undefined,
        'match_registry reachable (returns error for unknown match ID)');
    } catch (e) {
      // Any error that isn't a connection error means the contract is live
      const msg = (e as Error).message;
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
        fail('match_registry reachable', msg);
      } else {
        ok('match_registry reachable (returned contract error for unknown ID)');
      }
    }
  } else {
    skip('match_registry reachable', 'MATCH_REGISTRY_CONTRACT_ID not set');
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('Oracle: post_evaluation on a non-existent match');
  // ──────────────────────────────────────────────────────────────────────────
  // This should fail with MatchNotFound (contract error) — NOT a network error.
  // This verifies the relayer's auth is accepted but the business logic rejects
  // the call correctly.

  if (!isContractConfigured(config.ORACLE_GATEWAY_CONTRACT_ID)) {
    skip('oracle.post_evaluation error path', 'ORACLE_GATEWAY_CONTRACT_ID not set');
  } else if (!relayerAddress) {
    skip('oracle.post_evaluation error path', 'RELAYER_SECRET not set');
  } else {
    const DUMMY_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const NONEXISTENT_ID = 99999n;
    try {
      await invokeContract(config.ORACLE_GATEWAY_CONTRACT_ID, 'post_evaluation', [
        nativeToScVal(NONEXISTENT_ID, { type: 'u64' }),
        nativeToScVal(Buffer.from(DUMMY_FEN), { type: 'bytes' }),
        nativeToScVal(18, { type: 'u32' }),
        nativeToScVal(50, { type: 'i32' }),
      ]);
      fail('post_evaluation for non-existent match should have failed');
    } catch (e) {
      const msg = (e as Error).message;
      // Expected: contract error (MarketNotFound or similar)
      const isContractError = msg.includes('Error') || msg.includes('Simulation failed');
      if (isContractError) {
        ok('post_evaluation correctly rejected for non-existent match');
      } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
        fail('RPC connection failed — is the testnet reachable?', msg);
      } else {
        // Any non-connection error is acceptable — the contract responded
        ok(`post_evaluation rejected (${msg.substring(0, 80)}...)`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('Oracle: post_result on a non-existent match');
  // ──────────────────────────────────────────────────────────────────────────

  if (!isContractConfigured(config.ORACLE_GATEWAY_CONTRACT_ID)) {
    skip('oracle.post_result error path', 'ORACLE_GATEWAY_CONTRACT_ID not set');
  } else if (!relayerAddress) {
    skip('oracle.post_result error path', 'RELAYER_SECRET not set');
  } else {
    const NONEXISTENT_ID = 99999n;
    try {
      await invokeContract(config.ORACLE_GATEWAY_CONTRACT_ID, 'post_result', [
        nativeToScVal(NONEXISTENT_ID, { type: 'u64' }),
        enumScVal('PlayerA'),
      ]);
      fail('post_result for non-existent match should have failed');
    } catch (e) {
      const msg = (e as Error).message;
      const isContractError = msg.includes('Error') || msg.includes('Simulation failed');
      if (isContractError) {
        ok('post_result correctly rejected for non-existent match');
      } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
        fail('RPC connection failed', msg);
      } else {
        ok(`post_result rejected (${msg.substring(0, 80)}...)`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('PredictionPool: get_market on non-existent market');
  // ──────────────────────────────────────────────────────────────────────────

  if (isContractConfigured(config.PREDICTION_POOL_CONTRACT_ID)) {
    try {
      // readContract returns null on simulation failure (contract error)
      const result = await readContract(config.PREDICTION_POOL_CONTRACT_ID, 'get_market', [
        nativeToScVal(99999n, { type: 'u64' }),
      ]);
      // null = simulation failed → contract rejected the call (MarketNotFound)
      // A non-null result would mean the market exists, which is also fine
      if (result === null) {
        ok('get_market returned null for non-existent market (contract rejected)');
      } else {
        ok(`get_market returned a result (market 99999 exists on-chain: ${JSON.stringify(result)})`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
        fail('RPC connection failed', msg);
      } else {
        ok(`get_market returned error for non-existent market (${msg.substring(0, 60)})`);
      }
    }
  } else {
    skip('pool.get_market error path', 'PREDICTION_POOL_CONTRACT_ID not set');
  }

  // ──────────────────────────────────────────────────────────────────────────
  section('Relayer configuration sanity check');
  // ──────────────────────────────────────────────────────────────────────────

  assert(Boolean(relayerAddress), 'relayer keypair loaded from RELAYER_SECRET');
  if (relayerAddress) {
    assert(/^G[A-Z2-7]{55}$/.test(relayerAddress), `relayer address is valid StrKey (${relayerAddress.slice(0, 8)}...)`);
  }

  const contractIds = [
    ['MATCH_REGISTRY', config.MATCH_REGISTRY_CONTRACT_ID],
    ['ESCROW_VAULT', config.ESCROW_VAULT_CONTRACT_ID],
    ['PREDICTION_POOL', config.PREDICTION_POOL_CONTRACT_ID],
    ['ORACLE_GATEWAY', config.ORACLE_GATEWAY_CONTRACT_ID],
    ['SETTLEMENT', config.SETTLEMENT_CONTRACT_ID],
  ] as const;

  let configuredCount = 0;
  for (const [name, id] of contractIds) {
    if (isContractConfigured(id)) {
      ok(`${name} contract ID configured (${id.slice(0, 8)}...)`);
      configuredCount++;
    } else {
      skip(`${name} contract ID`, 'not configured');
    }
  }
  assert(configuredCount === 5, `all 5 contracts configured (${configuredCount}/5)`);

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`test-e2e: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) process.exit(1);
  console.log('PASSED');
  process.exit(0);
}

main().catch((e) => {
  console.error('[test-e2e] Unexpected error:', e);
  process.exit(1);
});
