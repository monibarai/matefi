// src/chess/gameManager.ts — per-match game state, move pipeline, eval pipeline.
import { Chess } from 'chess.js';
import { engine } from './engine';
import { applyMove, moveToUci } from './validator';
import { broadcastToMatch } from '../websocket/server';
import { config } from '../config';
import { oracleGateway, Winner } from '../stellar/contracts/oracleGateway';
import * as matchesDb from '../db/queries/matches';
import * as movesDb from '../db/queries/moves';
import * as evalsDb from '../db/queries/evaluations';

export interface GameState {
  matchId: string;
  chess: Chess;
  playerA: string; // Stellar address
  playerB: string;
  playerAColor: 'white' | 'black';
  marketLocked: boolean;
  moveCount: number;
  lastEval: number | null;
  // Sustained-advantage tracking for the market lock. `decisiveSide` is the
  // sign of the side currently ahead by ≥ threshold (1 = white, -1 = black,
  // 0 = neither); `decisiveStreak` counts how many consecutive evaluations
  // have stayed decisive on that same side. The market only locks once the
  // streak reaches EVAL_LOCK_CONFIRMATIONS (or a forced mate appears).
  decisiveSide: 1 | -1 | 0;
  decisiveStreak: number;
  status: 'active' | 'locked' | 'completed';
  // basic per-player clocks (ms remaining); included in MOVE broadcasts
  whiteMs: number;
  blackMs: number;
  lastMoveAt: number; // epoch ms of last move (or game start) — clock anchor for the player on move
  flagTimer: ReturnType<typeof setTimeout> | null; // fires when the on-move player runs out of time
}

/**
 * Live clock snapshot: the player whose turn it is has time deducted since
 * `lastMoveAt`; the idle player's clock is frozen. Used by MOVE broadcasts and
 * the REST snapshot so the UI can render an accurate countdown.
 */
export function liveClocks(state: GameState): {
  whiteMs: number;
  blackMs: number;
  turn: 'w' | 'b';
  running: boolean;
} {
  const turn = state.chess.turn();
  const running = state.status !== 'completed';
  let whiteMs = state.whiteMs;
  let blackMs = state.blackMs;
  if (running) {
    const elapsed = Date.now() - state.lastMoveAt;
    if (turn === 'w') whiteMs = Math.max(0, whiteMs - elapsed);
    else blackMs = Math.max(0, blackMs - elapsed);
  }
  return { whiteMs, blackMs, turn, running };
}

/**
 * Ensure the in-memory GameState for a match exists, rebuilding it from the DB
 * if the relayer was restarted mid-game. Replays the recorded moves to restore
 * the board and reconstructs both clocks from the moves' timestamps. Returns
 * null when the match is not a live (active/locked) two-player game.
 */
export async function ensureGameLoaded(matchId: string): Promise<GameState | null> {
  const existing = games.get(matchId);
  if (existing) return existing;

  const row = await matchesDb.getGame(matchId);
  if (!row || !row.player_b) return null;
  if (row.status !== 'active' && row.status !== 'locked') return null;

  const moves = await movesDb.listMoves(matchId);
  const chess = new Chess();
  for (const mv of moves) {
    if (!applyMove(chess, mv.move_uci)) break; // stop at first corrupt move
  }

  // Reconstruct clocks from move timestamps relative to the game start.
  const timeControlMs = row.time_control * 1000;
  let whiteMs = timeControlMs;
  let blackMs = timeControlMs;
  const startMs = row.started_at
    ? new Date(row.started_at).getTime()
    : moves[0]
      ? new Date(moves[0].created_at).getTime()
      : Date.now();
  let prev = startMs;
  for (const mv of moves) {
    const t = new Date(mv.created_at).getTime();
    const spent = Math.max(0, t - prev);
    if (mv.move_number % 2 === 1) whiteMs = Math.max(0, whiteMs - spent);
    else blackMs = Math.max(0, blackMs - spent);
    prev = t;
  }
  const lastMoveAt = moves.length
    ? new Date(moves[moves.length - 1].created_at).getTime()
    : startMs;

  const state: GameState = {
    matchId,
    chess,
    playerA: row.player_a,
    playerB: row.player_b,
    playerAColor: row.player_a_color,
    marketLocked: row.status === 'locked',
    moveCount: moves.length,
    lastEval: null,
    decisiveSide: 0,
    decisiveStreak: 0,
    status: row.status === 'locked' ? 'locked' : 'active',
    whiteMs,
    blackMs,
    lastMoveAt,
    flagTimer: null,
  };
  games.set(matchId, state);
  scheduleFlagFall(state);
  console.log(`[gameManager] rehydrated #${matchId} from DB (${moves.length} moves)`);
  return state;
}

/** Public accessor used by the REST layer (GET /api/matches/:id). */
export async function getLiveClocks(
  matchId: string,
): Promise<ReturnType<typeof liveClocks> | null> {
  const state = await ensureGameLoaded(matchId);
  return state ? liveClocks(state) : null;
}

/**
 * (Re)arm the flag-fall timer for the player currently on the move. When their
 * clock reaches zero before they move, they lose on time — exactly like a
 * professional chess clock. Cleared/rescheduled on every move and on game over.
 */
function scheduleFlagFall(state: GameState): void {
  if (state.flagTimer) {
    clearTimeout(state.flagTimer);
    state.flagTimer = null;
  }
  if (state.status === 'completed') return;
  const onMoveWhite = state.chess.turn() === 'w';
  const remaining = onMoveWhite ? state.whiteMs : state.blackMs;
  const fireIn = Math.max(0, state.lastMoveAt + remaining - Date.now());
  state.flagTimer = setTimeout(() => {
    void handleTimeout(state).catch((e) =>
      console.error(`[gameManager] flag-fall failed for ${state.matchId}:`, (e as Error).message),
    );
  }, fireIn);
}

const games = new Map<string, GameState>();

export async function initGame(
  matchId: string,
  playerA: string,
  playerB: string,
  options: {
    playerAColor?: 'white' | 'black';
    betAmount?: bigint | number | string;
    timeControlSecs?: number;
    /** skip the games-table insert when the row already exists (event listener path) */
    persist?: boolean;
  } = {}
): Promise<GameState> {
  const existing = games.get(matchId);
  if (existing) return existing;

  const playerAColor = options.playerAColor ?? 'white';
  const timeControlSecs = options.timeControlSecs ?? 600;

  const state: GameState = {
    matchId,
    chess: new Chess(),
    playerA,
    playerB,
    playerAColor,
    marketLocked: false,
    moveCount: 0,
    lastEval: null,
    decisiveSide: 0,
    decisiveStreak: 0,
    status: 'active',
    whiteMs: timeControlSecs * 1000,
    blackMs: timeControlSecs * 1000,
    lastMoveAt: Date.now(),
    flagTimer: null,
  };
  games.set(matchId, state);

  if (options.persist !== false) {
    await matchesDb.createGame({
      matchId,
      playerA,
      playerB,
      playerAColor,
      betAmount: options.betAmount ?? 0,
      timeControl: timeControlSecs,
      status: 'active',
    });
  }

  // White's clock starts the moment the game goes live.
  scheduleFlagFall(state);

  return state;
}

export interface SubmitMoveResult {
  success: boolean;
  error?: string;
  gameOver?: boolean;
  fen?: string;
}

export async function submitMove(
  matchId: string,
  playerAddress: string,
  move: string // UCI format, e.g. "e2e4" (SAN accepted as fallback)
): Promise<SubmitMoveResult> {
  const state = await ensureGameLoaded(matchId);
  if (!state) return { success: false, error: 'Game not found' };
  if (state.status === 'completed') return { success: false, error: 'Game already over' };

  // Turn enforcement
  const isWhiteTurn = state.chess.turn() === 'w';
  const isPlayerAWhite = state.playerAColor === 'white';
  const expectedPlayer = isWhiteTurn
    ? (isPlayerAWhite ? state.playerA : state.playerB)
    : (isPlayerAWhite ? state.playerB : state.playerA);

  if (playerAddress !== expectedPlayer) {
    return { success: false, error: 'Not your turn' };
  }

  // Clock bookkeeping (before applying): charge elapsed time to the player on
  // move. If they ran out of time while thinking, they lose on time — the move
  // does not count.
  const now = Date.now();
  const elapsed = now - state.lastMoveAt;
  const remainingBefore = isWhiteTurn ? state.whiteMs : state.blackMs;
  if (elapsed >= remainingBefore) {
    if (isWhiteTurn) state.whiteMs = 0;
    else state.blackMs = 0;
    await handleTimeout(state);
    return { success: false, error: 'You lost on time', gameOver: true };
  }

  // Validate and apply
  const applied = applyMove(state.chess, move);
  if (!applied) return { success: false, error: 'Illegal move' };

  state.moveCount++;
  const fen = state.chess.fen();

  if (isWhiteTurn) state.whiteMs = Math.max(0, state.whiteMs - elapsed);
  else state.blackMs = Math.max(0, state.blackMs - elapsed);
  state.lastMoveAt = now;

  // Persist move + keep games.current_fen up to date
  const uci = moveToUci(applied);
  await movesDb.insertMove({
    matchId,
    moveNumber: state.moveCount,
    moveUci: uci,
    fen,
    player: playerAddress,
  });
  await matchesDb.updateCurrentFen(matchId, fen);

  // Broadcast MOVE with the freshly anchored clocks (idle player frozen).
  broadcastToMatch(matchId, {
    type: 'MOVE',
    matchId,
    move: uci,
    fen,
    moveNumber: state.moveCount,
    turn: state.chess.turn(),
    clocks: { whiteMs: state.whiteMs, blackMs: state.blackMs },
  });

  // Game over?
  if (state.chess.isGameOver()) {
    await handleGameOver(state);
    return { success: true, gameOver: true, fen };
  }

  // Re-arm the flag-fall timer for the opponent now on the move.
  scheduleFlagFall(state);

  // Async evaluation pipeline (do not block move response)
  void runEvaluation(state).catch((e) =>
    console.error(`[gameManager] evaluation pipeline failed for ${matchId}:`, e)
  );

  return { success: true, gameOver: false, fen };
}

async function runEvaluation(state: GameState): Promise<void> {
  const fen = state.chess.fen();
  const moveNumber = state.moveCount;
  const evalResult = await engine.evaluate(fen, config.STOCKFISH_DEPTH);

  state.lastEval = evalResult.score;

  // The evaluation is a genuine assessment of the position at `moveNumber`, so
  // it is always recorded and broadcast for the eval bar and audit history —
  // even if the game finished while the engine was thinking (evals resolve in
  // move order; the engine queue is FIFO).
  await evalsDb.insertEvaluation({
    matchId: state.matchId,
    moveNumber,
    fen,
    depth: evalResult.depth,
    score: evalResult.score,
  });

  broadcastToMatch(state.matchId, {
    type: 'EVAL',
    matchId: state.matchId,
    score: evalResult.score,
    depth: evalResult.depth,
    mate: evalResult.mate,
    moveNumber,
  });

  // Once the game has ended, the result is being settled on-chain; do not post
  // further evals or touch the market lock for a now-irrelevant position.
  if (state.status === 'completed') return;

  // Post to OracleGateway (no-op with warning when contracts unconfigured)
  try {
    await oracleGateway.postEvaluation(state.matchId, fen, evalResult.depth, evalResult.score);
  } catch (e) {
    console.error(`[gameManager] oracle.postEvaluation failed for ${state.matchId}:`, (e as Error).message);
  }

  // Market lock policy (mirrors the OracleGateway contract): a decisive
  // advantage must be SUSTAINED before the market locks. A single move — most
  // commonly a capture evaluated before the recapture/compensation lands —
  // produces a one-ply eval spike that should not close the market, because
  // the game is not decided by one move. We therefore require the advantage to
  // hold for EVAL_LOCK_CONFIRMATIONS consecutive evaluations on the SAME side.
  // A forced mate is genuinely terminal and locks immediately.
  const isMate = evalResult.mate !== null;
  const crosses = Math.abs(evalResult.score) >= config.EVAL_THRESHOLD;
  const side: 1 | -1 | 0 = crosses ? (evalResult.score > 0 ? 1 : -1) : 0;

  if (side === 0) {
    // Advantage evaporated (e.g. the piece was recaptured) — reset the streak
    // so the market stays open.
    state.decisiveSide = 0;
    state.decisiveStreak = 0;
  } else if (side === state.decisiveSide) {
    state.decisiveStreak++;
  } else {
    // Newly decisive, or the advantage flipped to the other side — start over.
    state.decisiveSide = side;
    state.decisiveStreak = 1;
  }

  const lockConfirmed = isMate || state.decisiveStreak >= config.EVAL_LOCK_CONFIRMATIONS;

  if (!state.marketLocked && lockConfirmed) {
    state.marketLocked = true;
    if (state.status === 'active') state.status = 'locked';
    await matchesDb.updateGameStatus(state.matchId, 'locked');

    const reason = isMate
      ? 'forced mate detected'
      : `held for ${state.decisiveStreak} consecutive evaluations`;
    broadcastToMatch(state.matchId, {
      type: 'MARKET_LOCKED',
      matchId: state.matchId,
      evalScore: evalResult.score,
      message: `Market locked at evaluation ${evalResult.score > 0 ? '+' : ''}${evalResult.score} cp (${reason})`,
    });
  }
}

/**
 * Post the final result on-chain and persist a settlement row keyed by the
 * resulting transaction hash. `post_result` runs `Settlement.execute` atomically
 * inside the relayer's own transaction, so its hash is the authoritative
 * settlement tx id. Recording it here guarantees a `settlements` row (with the
 * tx id) for every on-chain match the relayer ends — independent of whether the
 * async `MatchSettled` event is later observed (events can be missed across
 * restarts). The event listener subsequently enriches this row with the
 * on-chain prize/fee breakdown via an idempotent merge.
 *
 * For dev/off-chain matches (uuid ids, or contracts unconfigured) `postResult`
 * is a no-op returning null; we skip the settlement row since there is no tx.
 */
async function settleMatch(matchId: string, winner: Winner): Promise<void> {
  let txHash: string | null = null;
  try {
    txHash = await oracleGateway.postResult(matchId, winner);
  } catch (e) {
    console.error(`[gameManager] oracle.postResult failed for ${matchId}:`, (e as Error).message);
  }
  if (!txHash) return;
  try {
    await matchesDb.recordSettlement({ matchId, winner, txHash });
    console.log(`[gameManager] settlement recorded for #${matchId} (winner ${winner}, tx ${txHash})`);
  } catch (e) {
    console.error(`[gameManager] recordSettlement failed for ${matchId}:`, (e as Error).message);
  }
}

/**
 * End the game because the player on the move ran out of time. The opponent
 * wins on time (matching professional flag-fall rules).
 */
async function handleTimeout(state: GameState): Promise<void> {
  if (state.status === 'completed') return;
  state.status = 'completed';
  if (state.flagTimer) {
    clearTimeout(state.flagTimer);
    state.flagTimer = null;
  }

  const flaggedWhite = state.chess.turn() === 'w';
  const playerAIsWhite = state.playerAColor === 'white';
  const winner: Winner = flaggedWhite
    ? (playerAIsWhite ? 'PlayerB' : 'PlayerA')
    : (playerAIsWhite ? 'PlayerA' : 'PlayerB');
  if (flaggedWhite) state.whiteMs = 0;
  else state.blackMs = 0;

  const pgn = state.chess.pgn();

  await settleMatch(state.matchId, winner);

  broadcastToMatch(state.matchId, {
    type: 'GAME_OVER',
    matchId: state.matchId,
    winner,
    reason: 'timeout',
    pgn,
  });

  await matchesDb.completeGame(state.matchId, winner, pgn);
  games.delete(state.matchId);
  console.log(`[gameManager] #${state.matchId} ended on time — winner ${winner}`);
}

async function handleGameOver(state: GameState): Promise<void> {
  state.status = 'completed';
  if (state.flagTimer) {
    clearTimeout(state.flagTimer);
    state.flagTimer = null;
  }

  let winner: Winner;
  let reason: string;

  if (state.chess.isCheckmate()) {
    // The player whose turn it is LOST.
    const loserColor = state.chess.turn(); // 'w' | 'b'
    const playerAIsWhite = state.playerAColor === 'white';
    winner = loserColor === 'w'
      ? (playerAIsWhite ? 'PlayerB' : 'PlayerA')
      : (playerAIsWhite ? 'PlayerA' : 'PlayerB');
    reason = 'checkmate';
  } else {
    winner = 'Draw';
    reason = state.chess.isStalemate()
      ? 'stalemate'
      : state.chess.isThreefoldRepetition()
        ? 'threefold repetition'
        : state.chess.isInsufficientMaterial()
          ? 'insufficient material'
          : 'draw';
  }

  const pgn = state.chess.pgn();

  // Post result to oracle — triggers on-chain settlement and records the tx
  // (no-op when unconfigured / dev match).
  await settleMatch(state.matchId, winner);

  broadcastToMatch(state.matchId, {
    type: 'GAME_OVER',
    matchId: state.matchId,
    winner,
    reason,
    pgn,
  });

  await matchesDb.completeGame(state.matchId, winner, pgn);
  games.delete(state.matchId);
}

export async function handleResignation(
  matchId: string,
  playerAddress: string
): Promise<{ success: boolean; error?: string }> {
  const state = await ensureGameLoaded(matchId);
  if (!state) return { success: false, error: 'Game not found' };
  if (playerAddress !== state.playerA && playerAddress !== state.playerB) {
    return { success: false, error: 'Not a player in this match' };
  }

  state.status = 'completed';
  if (state.flagTimer) {
    clearTimeout(state.flagTimer);
    state.flagTimer = null;
  }
  const winner: Winner = playerAddress === state.playerA ? 'PlayerB' : 'PlayerA';
  const pgn = state.chess.pgn();

  await settleMatch(matchId, winner);

  broadcastToMatch(matchId, {
    type: 'GAME_OVER',
    matchId,
    winner,
    reason: 'resignation',
    pgn,
  });

  await matchesDb.completeGame(matchId, winner, pgn);
  games.delete(matchId);
  return { success: true };
}

export function getGameState(matchId: string): GameState | undefined {
  return games.get(matchId);
}

export function activeGameCount(): number {
  return games.size;
}
