// scripts/test-game.ts — Chess game logic unit tests (no DB, no blockchain).
// Tests validator.ts and chess.js rules directly.
// Usage: npx tsx scripts/test-game.ts

import { Chess } from 'chess.js';
import { applyMove, isUciMove, moveToUci, isValidFen } from '../src/chess/validator';

// ----------------------------------------------------------------------------
// Minimal test harness
// ----------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
    failed++;
  }
}

function assertNotNull<T>(value: T | null | undefined, label: string): void {
  assert(value !== null && value !== undefined, label);
}

function section(name: string): void {
  console.log(`\n${name}`);
}

// ----------------------------------------------------------------------------
// isUciMove tests
// ----------------------------------------------------------------------------

section('isUciMove');
assert(isUciMove('e2e4'), 'standard pawn push');
assert(isUciMove('e7e8q'), 'promotion with queen');
assert(isUciMove('a1h8'), 'bishop diagonal');
assert(!isUciMove('e2e9'), 'rank 9 is invalid');
assert(!isUciMove('Nf3'), 'SAN is not UCI');
assert(!isUciMove(''), 'empty string');
assert(!isUciMove('e4'), 'partial square');

// ----------------------------------------------------------------------------
// applyMove / moveToUci tests
// ----------------------------------------------------------------------------

section('applyMove — UCI input');
{
  const chess = new Chess();
  const move = applyMove(chess, 'e2e4');
  assertNotNull(move, 'e2e4 applied');
  if (move) assertEqual(moveToUci(move), 'e2e4', 'UCI round-trip');
}

section('applyMove — SAN fallback');
{
  const chess = new Chess();
  const move = applyMove(chess, 'e4');
  assertNotNull(move, 'SAN e4 applied');
}

section('applyMove — illegal move returns null');
{
  const chess = new Chess();
  const move = applyMove(chess, 'e2e5');
  assert(move === null, 'e2e5 is illegal in starting position');
}

section('applyMove — out of turn returns null');
{
  const chess = new Chess();
  applyMove(chess, 'e2e4'); // white moves
  const move = applyMove(chess, 'd2d4'); // white again — illegal
  assert(move === null, 'playing out of turn is rejected');
}

section('applyMove — promotion');
{
  // Set up a position where white can promote
  const promotionFen = '8/P7/8/8/8/8/8/K5k1 w - - 0 1';
  const chess = new Chess(promotionFen);
  const move = applyMove(chess, 'a7a8q');
  assertNotNull(move, 'promotion to queen applied');
  if (move) {
    assertEqual(move.promotion, 'q', 'promotion piece is queen');
    assertEqual(moveToUci(move), 'a7a8q', 'UCI includes promotion');
  }
}

// ----------------------------------------------------------------------------
// isValidFen tests
// ----------------------------------------------------------------------------

section('isValidFen');
assert(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), 'starting position');
assert(!isValidFen('not a fen'), 'garbage string');
assert(!isValidFen(''), 'empty string');

// ----------------------------------------------------------------------------
// Game flow — turn enforcement
// ----------------------------------------------------------------------------

section('Turn enforcement via chess.js');
{
  const chess = new Chess();
  assertEqual(chess.turn(), 'w', 'white moves first');
  applyMove(chess, 'e2e4');
  assertEqual(chess.turn(), 'b', 'black to move after e4');
  applyMove(chess, 'e7e5');
  assertEqual(chess.turn(), 'w', 'white to move after e5');
}

// ----------------------------------------------------------------------------
// Game over detection
// ----------------------------------------------------------------------------

section('Checkmate detection');
{
  // Scholar's mate
  const chess = new Chess();
  for (const m of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'a7a6', 'h5f7']) {
    applyMove(chess, m);
  }
  assert(chess.isGameOver(), 'game is over after Scholar\'s mate');
  assert(chess.isCheckmate(), 'result is checkmate');
  assert(!chess.isDraw(), 'not a draw');
  assertEqual(chess.turn(), 'b', 'black was checkmated (black to move, cannot)');
}

section('Stalemate detection');
{
  // Classic stalemate: black king has no moves
  const stalematedFen = '5k2/5P2/5K2/8/8/8/8/8 b - - 0 1';
  const chess = new Chess(stalematedFen);
  assert(chess.isStalemate(), 'position is stalemate');
  assert(chess.isDraw(), 'stalemate is a draw');
  assert(!chess.isCheckmate(), 'stalemate is not checkmate');
}

section('Insufficient material detection');
{
  const kk = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  const chess = new Chess(kk);
  assert(chess.isInsufficientMaterial(), 'K vs K is insufficient material');
}

section('Threefold repetition detection');
{
  const chess = new Chess();
  // Repeat the same position 3 times
  const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
  for (const m of moves) applyMove(chess, m);
  assert(chess.isThreefoldRepetition(), 'threefold repetition detected');
}

// ----------------------------------------------------------------------------
// moveCount and FEN progression
// ----------------------------------------------------------------------------

section('FEN changes after each move');
{
  const chess = new Chess();
  const start = chess.fen();
  applyMove(chess, 'e2e4');
  assert(chess.fen() !== start, 'FEN changed after e4');
  applyMove(chess, 'e7e5');
  applyMove(chess, 'g1f3');
  assertEqual(chess.moveNumber(), 2, 'move number advances by full moves');
}

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`test-game: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
console.log('PASSED');
process.exit(0);
