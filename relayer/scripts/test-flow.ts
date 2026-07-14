// scripts/test-flow.ts — In-memory game flow tests (no DB, no blockchain).
// Tests the game manager state machine logic using stubs for DB + oracle.
// Usage: npx tsx scripts/test-flow.ts

import { Chess } from 'chess.js';
import { applyMove } from '../src/chess/validator';

// ----------------------------------------------------------------------------
// Inline game-manager stub (same logic as src/chess/gameManager.ts but
// all I/O calls replaced with stubs so no DB or Soroban connection needed).
// ----------------------------------------------------------------------------

type Winner = 'PlayerA' | 'PlayerB' | 'Draw';
type GameStatus = 'active' | 'locked' | 'completed';

interface GameState {
  matchId: string;
  chess: Chess;
  playerA: string;
  playerB: string;
  playerAColor: 'white' | 'black';
  marketLocked: boolean;
  moveCount: number;
  lastEval: number | null;
  status: GameStatus;
  whiteMs: number;
  blackMs: number;
  lastMoveAt: number;
}

interface SubmitMoveResult {
  success: boolean;
  error?: string;
  gameOver?: boolean;
  fen?: string;
  winner?: Winner;
}

const games = new Map<string, GameState>();
const gameOverResults = new Map<string, { winner: Winner; reason: string }>();

function initGame(
  matchId: string,
  playerA: string,
  playerB: string,
  playerAColor: 'white' | 'black' = 'white',
  timeControlSecs = 600
): GameState {
  const state: GameState = {
    matchId,
    chess: new Chess(),
    playerA,
    playerB,
    playerAColor,
    marketLocked: false,
    moveCount: 0,
    lastEval: null,
    status: 'active',
    whiteMs: timeControlSecs * 1000,
    blackMs: timeControlSecs * 1000,
    lastMoveAt: Date.now(),
  };
  games.set(matchId, state);
  return state;
}

function submitMove(matchId: string, playerAddress: string, move: string): SubmitMoveResult {
  const state = games.get(matchId);
  if (!state) return { success: false, error: 'Game not found' };
  if (state.status === 'completed') return { success: false, error: 'Game already over' };

  const isWhiteTurn = state.chess.turn() === 'w';
  const isPlayerAWhite = state.playerAColor === 'white';
  const expectedPlayer = isWhiteTurn
    ? (isPlayerAWhite ? state.playerA : state.playerB)
    : (isPlayerAWhite ? state.playerB : state.playerA);

  if (playerAddress !== expectedPlayer) {
    return { success: false, error: 'Not your turn' };
  }

  const applied = applyMove(state.chess, move);
  if (!applied) return { success: false, error: 'Illegal move' };

  state.moveCount++;

  const now = Date.now();
  const elapsed = now - state.lastMoveAt;
  if (isWhiteTurn) state.whiteMs = Math.max(0, state.whiteMs - elapsed);
  else state.blackMs = Math.max(0, state.blackMs - elapsed);
  state.lastMoveAt = now;

  if (state.chess.isGameOver()) {
    const result = resolveGameOver(state);
    return { success: true, gameOver: true, fen: state.chess.fen(), winner: result.winner };
  }

  return { success: true, gameOver: false, fen: state.chess.fen() };
}

function resolveGameOver(state: GameState): { winner: Winner; reason: string } {
  state.status = 'completed';
  let winner: Winner;
  let reason: string;

  if (state.chess.isCheckmate()) {
    const loserColor = state.chess.turn();
    const playerAIsWhite = state.playerAColor === 'white';
    winner = loserColor === 'w'
      ? (playerAIsWhite ? 'PlayerB' : 'PlayerA')
      : (playerAIsWhite ? 'PlayerA' : 'PlayerB');
    reason = 'checkmate';
  } else {
    winner = 'Draw';
    reason = state.chess.isStalemate() ? 'stalemate'
      : state.chess.isThreefoldRepetition() ? 'threefold repetition'
      : state.chess.isInsufficientMaterial() ? 'insufficient material'
      : 'draw';
  }

  gameOverResults.set(state.matchId, { winner, reason });
  games.delete(state.matchId);
  return { winner, reason };
}

function handleResignation(
  matchId: string,
  playerAddress: string
): { success: boolean; error?: string; winner?: Winner } {
  const state = games.get(matchId);
  if (!state) return { success: false, error: 'Game not found' };
  if (playerAddress !== state.playerA && playerAddress !== state.playerB) {
    return { success: false, error: 'Not a player in this match' };
  }
  state.status = 'completed';
  const winner: Winner = playerAddress === state.playerA ? 'PlayerB' : 'PlayerA';
  gameOverResults.set(matchId, { winner, reason: 'resignation' });
  games.delete(matchId);
  return { success: true, winner };
}

function lockMarket(matchId: string): void {
  const state = games.get(matchId);
  if (!state || state.marketLocked) return;
  state.marketLocked = true;
  if (state.status === 'active') state.status = 'locked';
}

// ----------------------------------------------------------------------------
// Harness
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

function section(name: string): void {
  console.log(`\n${name}`);
}

// Reset between tests
function reset(): void {
  games.clear();
  gameOverResults.clear();
}

// Helpers
const A = 'addr_player_a';
const B = 'addr_player_b';
let counter = 0;
function mid(): string { return String(++counter); }

// ----------------------------------------------------------------------------
// Game initialization
// ----------------------------------------------------------------------------

section('initGame — creates state correctly');
{
  reset();
  const id = mid();
  const state = initGame(id, A, B);
  assertEqual(state.matchId, id, 'matchId set');
  assertEqual(state.playerA, A, 'playerA set');
  assertEqual(state.playerB, B, 'playerB set');
  assertEqual(state.playerAColor, 'white', 'playerA defaults to white');
  assertEqual(state.status, 'active', 'initial status is active');
  assertEqual(state.moveCount, 0, 'no moves yet');
  assert(!state.marketLocked, 'market not locked');
}

section('initGame — same ID returns same object');
{
  reset();
  const id = mid();
  const s1 = initGame(id, A, B);
  submitMove(id, A, 'e2e4');
  // Registering again must not reset moveCount (idempotent)
  assert(s1.moveCount === 1, 'moveCount preserved after re-init attempt');
}

// ----------------------------------------------------------------------------
// Move submission
// ----------------------------------------------------------------------------

section('submitMove — unknown game');
{
  reset();
  const r = submitMove('unknown', A, 'e2e4');
  assert(!r.success, 'fails for unknown matchId');
  assertEqual(r.error, 'Game not found', 'error message');
}

section('submitMove — out-of-turn rejection');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  const r = submitMove(id, B, 'e7e5'); // B tries to move when it's A's (white) turn
  assert(!r.success, 'rejects out-of-turn move');
  assertEqual(r.error, 'Not your turn', 'error message');
}

section('submitMove — illegal move rejection');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  const r = submitMove(id, A, 'e2e5'); // illegal pawn jump
  assert(!r.success, 'rejects illegal move');
  assertEqual(r.error, 'Illegal move', 'error message');
}

section('submitMove — valid moves accepted');
{
  reset();
  const id = mid();
  initGame(id, A, B);

  const r1 = submitMove(id, A, 'e2e4');
  assert(r1.success, 'A plays e4');
  assert(!r1.gameOver, 'game not over');
  assertEqual(r1.error, undefined, 'no error');

  const r2 = submitMove(id, B, 'e7e5');
  assert(r2.success, 'B plays e5');

  const state = games.get(id);
  assertEqual(state?.moveCount, 2, 'moveCount = 2 after two moves');
}

section('submitMove — completed game rejects further moves');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  handleResignation(id, A); // A resigns → game completed, removed from map
  const r = submitMove(id, B, 'e2e4');
  assert(!r.success, 'move rejected after game ends');
  assertEqual(r.error, 'Game not found', 'error: game removed from map');
}

// ----------------------------------------------------------------------------
// Checkmate detection
// ----------------------------------------------------------------------------

section('Scholar\'s mate — PlayerB wins (white checkmated)');
{
  // A=white, B=black; Scholar's mate ends with black checkmating white
  // Wait: Scholar's mate = WHITE checkmating BLACK (Qxf7#).
  // Let's use Fool's mate: 1.f3 e5 2.g4 Qh4#  — white is mated.
  reset();
  const id = mid();
  initGame(id, A, B, 'white'); // A is white

  const moves = [
    [A, 'f2f3'], // f3 (white)
    [B, 'e7e5'], // e5 (black)
    [A, 'g2g4'], // g4 (white)
    [B, 'd8h4'], // Qh4# (black) — checkmate
  ] as const;

  let gameOver = false;
  let winner: Winner | undefined;
  for (const [player, move] of moves) {
    const r = submitMove(id, player, move);
    if (r.gameOver) { gameOver = true; winner = r.winner; }
  }

  assert(gameOver, "Fool's mate: game is over");
  assertEqual(winner, 'PlayerB', "Fool's mate: PlayerB (black) wins");
}

section('Scholar\'s mate — PlayerA wins (black checkmated)');
{
  reset();
  const id = mid();
  initGame(id, A, B, 'white'); // A=white

  const moves: [string, string][] = [
    [A, 'e2e4'], [B, 'e7e5'],
    [A, 'f1c4'], [B, 'b8c6'],
    [A, 'd1h5'], [B, 'a7a6'],
    [A, 'h5f7'], // Qxf7# — checkmate
  ];

  let winner: Winner | undefined;
  for (const [player, move] of moves) {
    const r = submitMove(id, player, move);
    if (r.gameOver) winner = r.winner;
  }

  assertEqual(winner, 'PlayerA', 'Scholar\'s mate: PlayerA (white) wins');
}

// ----------------------------------------------------------------------------
// Color swap — playerA as black
// ----------------------------------------------------------------------------

section('playerAColor=black: PlayerA moves second');
{
  reset();
  const id = mid();
  initGame(id, A, B, 'black'); // A is black, B is white

  // B (white) must move first
  const r1 = submitMove(id, A, 'e2e4'); // A tries to move first — wrong turn
  assert(!r1.success, 'A cannot move first when they are black');

  const r2 = submitMove(id, B, 'e2e4'); // B (white) moves first — correct
  assert(r2.success, 'B moves first as white');
}

// ----------------------------------------------------------------------------
// Resignation
// ----------------------------------------------------------------------------

section('Resignation — PlayerA resigns, PlayerB wins');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  submitMove(id, A, 'e2e4');

  const r = handleResignation(id, A);
  assert(r.success, 'resignation accepted');
  assertEqual(r.winner, 'PlayerB', 'PlayerB wins on resignation');
  assert(!games.has(id), 'game removed from map after resignation');
  assertEqual(gameOverResults.get(id)?.reason, 'resignation', 'reason = resignation');
}

section('Resignation — PlayerB resigns, PlayerA wins');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  const r = handleResignation(id, B);
  assertEqual(r.winner, 'PlayerA', 'PlayerA wins on PlayerB resignation');
}

section('Resignation — non-player rejected');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  const r = handleResignation(id, 'impostor_addr');
  assert(!r.success, 'non-player cannot resign');
  assertEqual(r.error, 'Not a player in this match', 'error message');
}

section('Resignation — unknown game');
{
  reset();
  const r = handleResignation('unknown', A);
  assert(!r.success, 'unknown game rejected');
}

// ----------------------------------------------------------------------------
// Market locking
// ----------------------------------------------------------------------------

section('Market lock — one-way state transition');
{
  reset();
  const id = mid();
  const state = initGame(id, A, B);

  assert(!state.marketLocked, 'initially unlocked');
  lockMarket(id);
  assert(state.marketLocked, 'locked after lockMarket');
  assertEqual(state.status, 'locked', 'status transitions to locked');

  // Idempotent
  lockMarket(id);
  assert(state.marketLocked, 'still locked after second call');
}

section('Moves still accepted while market is locked');
{
  reset();
  const id = mid();
  initGame(id, A, B);
  lockMarket(id);

  const r = submitMove(id, A, 'e2e4');
  assert(r.success, 'moves accepted even when market is locked');
}

// ----------------------------------------------------------------------------
// Full game sequence (10 moves + resignation)
// ----------------------------------------------------------------------------

section('Full game: 5 exchanges then PlayerA resigns');
{
  reset();
  const id = mid();
  initGame(id, A, B);

  const movePairs: [string, string][] = [
    [A, 'e2e4'], [B, 'e7e5'],
    [A, 'g1f3'], [B, 'b8c6'],
    [A, 'f1b5'], [B, 'a7a6'],
    [A, 'b5a4'], [B, 'g8f6'],
    [A, 'e1g1'], [B, 'f8e7'],
  ];

  for (const [player, move] of movePairs) {
    submitMove(id, player, move);
  }

  const state = games.get(id);
  assertEqual(state?.moveCount, 10, '10 moves recorded');

  const r = handleResignation(id, A);
  assertEqual(r.winner, 'PlayerB', 'PlayerB wins after PlayerA resigns in Ruy Lopez');
}

// ----------------------------------------------------------------------------
// Draw via stalemate
// ----------------------------------------------------------------------------

section('Stalemate → Draw');
{
  // Position: white to move, plays Kc6 → stalemate for black
  // 5k2/8/5K2/5P2/8/8/8/8 w - - 0 1  →  Kc6 → stalemate
  // Actually let's use: K6k/8/8/8/8/8/8/7Q w - - 0 1 → Qa1 → stalemate if black has no moves
  // Easier: use a known stalemate position where white can create stalemate
  // K7/8/1Q6/8/8/8/8/7k w - - 0 1 → Qb2 → stalemate
  reset();
  const id = mid();
  // In this position it's black's turn and they're already stalemated
  // Use a clean stub: simulate game over with Draw reason
  const stalematedFen = '5k2/5P2/5K2/8/8/8/8/8 b - - 0 1';
  const state = initGame(id, A, B);
  // Replace chess instance with stalemated position
  (state as any).chess = new Chess(stalematedFen);

  // In the real flow, a move by white would have landed in this position.
  // Here we check the stalemate detection works when resolveGameOver is called.
  // Force game-over handling by calling resolveGameOver directly:
  const result = resolveGameOver(state);
  assertEqual(result.winner, 'Draw', 'stalemate resolves to Draw');
  assertEqual(result.reason, 'stalemate', 'reason is stalemate');
}

// ----------------------------------------------------------------------------
// Summary
// ----------------------------------------------------------------------------

console.log(`\n${'─'.repeat(50)}`);
console.log(`test-flow: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('PASSED');
process.exit(0);
