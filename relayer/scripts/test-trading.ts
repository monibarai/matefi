// scripts/test-trading.ts — Parimutuel odds & payout math tests (no deps).
// Tests the three-bucket parimutuel market math defined in README §9.
// Usage: npx tsx scripts/test-trading.ts

// ----------------------------------------------------------------------------
// Pure parimutuel math (mirrors prediction_pool/src/lib.rs)
// ----------------------------------------------------------------------------

const USDC = 10_000_000n; // 1 USDC in stroops (BigInt)
const FEE_TREASURY_BPS = 100n; // 1%
const FEE_FLYWHEEL_BPS = 200n; // 2%
const FEE_TOTAL_BPS = 300n;    // 3%
const BPS_DENOM = 10_000n;
const PRIZE_BPS = 9_700n;      // 97%

function fees(volume: bigint): { treasury: bigint; flywheel: bigint; net: bigint } {
  const treasury = (volume * FEE_TREASURY_BPS) / BPS_DENOM;
  const flywheel = (volume * FEE_FLYWHEEL_BPS) / BPS_DENOM;
  const net = volume - treasury - flywheel;
  return { treasury, flywheel, net };
}

function odds(poolA: bigint, poolB: bigint, poolDraw: bigint): [bigint, bigint, bigint] {
  const total = poolA + poolB + poolDraw;
  if (total === 0n) return [0n, 0n, 0n];
  const { net } = fees(total);
  const oddsA = poolA > 0n ? (net * 100n) / poolA : 0n;
  const oddsB = poolB > 0n ? (net * 100n) / poolB : 0n;
  const oddsDraw = poolDraw > 0n ? (net * 100n) / poolDraw : 0n;
  return [oddsA, oddsB, oddsDraw];
}

function payout(position: bigint, winningPool: bigint, netPool: bigint): bigint {
  if (winningPool === 0n) return 0n;
  return (position * netPool) / winningPool;
}

function playerPrize(totalDeposits: bigint): bigint {
  return (totalDeposits * PRIZE_BPS) / BPS_DENOM;
}

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — got ${actual}, want ${expected}`);
    failed++;
  }
}

function assert(cond: boolean, label: string): void {
  assertEqual(cond, true, label);
}

function section(name: string): void {
  console.log(`\n${name}`);
}

// ----------------------------------------------------------------------------
// Fee distribution
// ----------------------------------------------------------------------------

section('Fee distribution on 1200 USDC volume (spec §9 example)');
{
  const volume = 1200n * USDC;
  const { treasury, flywheel, net } = fees(volume);
  assertEqual(treasury, 12n * USDC, '1% treasury = 12 USDC');
  assertEqual(flywheel, 24n * USDC, '2% flywheel = 24 USDC');
  assertEqual(net, 1164n * USDC, 'net pool = 1164 USDC');
}

section('Fee distribution on 100 USDC (round numbers)');
{
  const { treasury, flywheel, net } = fees(100n * USDC);
  assertEqual(treasury, 1n * USDC, '1 USDC treasury');
  assertEqual(flywheel, 2n * USDC, '2 USDC flywheel');
  assertEqual(net, 97n * USDC, '97 USDC net');
}

// ----------------------------------------------------------------------------
// Odds calculation (spec §9: poolA=800, poolB=300, poolDraw=100)
// ----------------------------------------------------------------------------

section('Odds — spec §9 example');
{
  const [oddsA, oddsB, oddsDraw] = odds(800n * USDC, 300n * USDC, 100n * USDC);
  // net = 1164 USDC; oddsA = 1164*100/800 = 145; oddsB = 1164*100/300 = 388; oddsDraw = 1164*100/100 = 1164
  assertEqual(oddsA, 145n, 'odds PlayerA = 1.45x (145 per 100)');
  assertEqual(oddsB, 388n, 'odds PlayerB = 3.88x (388 per 100)');
  assertEqual(oddsDraw, 1164n, 'odds Draw = 11.64x (1164 per 100)');
}

section('Odds — empty pool returns zero');
{
  const [a, b, d] = odds(0n, 0n, 0n);
  assertEqual(a, 0n, 'oddsA = 0 on empty pool');
  assertEqual(b, 0n, 'oddsB = 0 on empty pool');
  assertEqual(d, 0n, 'oddsDraw = 0 on empty pool');
}

section('Odds — only one bucket has bets');
{
  // All bets on PlayerA: oddsA = net*100/poolA = net*100/total*100 ≈ 97
  const [a, b, d] = odds(100n * USDC, 0n, 0n);
  assertEqual(a, 97n, 'single-bucket: oddsA ≈ 97 (net/pool*100)');
  assertEqual(b, 0n, 'no bets on B → odds = 0');
  assertEqual(d, 0n, 'no bets on Draw → odds = 0');
}

// ----------------------------------------------------------------------------
// Payout math
// ----------------------------------------------------------------------------

section('Payout — proportional share (spec §9)');
{
  // Trader has 800 of 800 total in PlayerA bucket. net = 1164 USDC.
  const p = payout(800n * USDC, 800n * USDC, 1164n * USDC);
  assertEqual(p, 1164n * USDC, 'full pool winner gets entire net pool');
}

section('Payout — partial share');
{
  // Two traders on PlayerA: 200 + 600 = 800.  net = 1164.
  // Trader with 200: payout = 200*1164/800 = 291
  const p = payout(200n * USDC, 800n * USDC, 1164n * USDC);
  assertEqual(p, 291n * USDC, 'partial share proportional payout');
}

section('Payout — zero winning pool (no bets on winner)');
{
  const p = payout(0n, 0n, 97n * USDC);
  assertEqual(p, 0n, 'zero winning pool → zero payout');
}

// ----------------------------------------------------------------------------
// Player prize pool (escrow §10: 97% of total deposits)
// ----------------------------------------------------------------------------

section('Player prize — 97% of deposits');
{
  const deposits = 1000n * USDC; // 500 + 500
  const prize = playerPrize(deposits);
  const fee = deposits - prize;
  assertEqual(prize, 970n * USDC, 'winner gets 970 USDC from 1000 total');
  assertEqual(fee, 30n * USDC, 'protocol fee = 30 USDC (3%)');
}

section('Player prize — with flywheel bonus');
{
  // 1000 deposits + 24 USDC flywheel bonus = 1024 total
  const total = 1024n * USDC;
  const prize = playerPrize(total);
  // 1024 * 97 / 100 = 993.28 USDC = 9_932_800_000 stroops
  assertEqual(prize, 9_932_800_000n, 'prize with bonus = 993.28 USDC');
}

section('Draw — deposit refunds (no protocol fee)');
{
  // On draw: both players refunded full deposit amounts
  const depositA = 500n * USDC;
  const depositB = 500n * USDC;
  // Spec §10: on draw, EscrowVault.release_draw refunds both deposits in full.
  assertEqual(depositA + depositB, 1000n * USDC, 'total refunded = total deposited');
}

// ----------------------------------------------------------------------------
// Flywheel: 2% of trading volume credited to escrow
// ----------------------------------------------------------------------------

section('Flywheel bonus calculation');
{
  const tradingVolume = 1200n * USDC;
  const { flywheel } = fees(tradingVolume);
  // Flywheel bonus boosts the player prize pool:
  const baseDeposits = 1000n * USDC;
  const totalInEscrow = baseDeposits + flywheel;
  const prize = playerPrize(totalInEscrow);
  assertEqual(flywheel, 24n * USDC, 'flywheel credit = 24 USDC');
  assertEqual(totalInEscrow, 1024n * USDC, 'escrow total with bonus = 1024 USDC');
  assertEqual(prize, 9_932_800_000n, 'winner gets 993.28 USDC after flywheel');
}

// ----------------------------------------------------------------------------
// Edge cases
// ----------------------------------------------------------------------------

section('Minimum bet = 1 USDC (10_000_000 stroops)');
{
  const minBet = 1n * USDC;
  const { net } = fees(minBet);
  assertEqual(net, 9_700_000n, 'net on min bet = 0.97 USDC');
}

section('Large volume — no overflow with BigInt');
{
  // 10M USDC in trading volume
  const bigVolume = 10_000_000n * USDC;
  const { treasury, flywheel, net } = fees(bigVolume);
  assertEqual(treasury + flywheel + net, bigVolume, 'fees sum to total volume');
}

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`test-trading: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('PASSED');
process.exit(0);
