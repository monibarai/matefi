// src/chess/validator.ts — move validation with chess.js.
import { Chess, Move } from 'chess.js';

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

/** Returns true if the string looks like a UCI move (e.g. "e2e4", "e7e8q"). */
export function isUciMove(move: string): boolean {
  return UCI_RE.test(move);
}

/**
 * Validate and apply a move (UCI like "e2e4"/"e7e8q", or SAN like "Nf3") to a
 * chess.js instance. Returns the applied Move, or null if the move is illegal.
 */
export function applyMove(chess: Chess, move: string): Move | null {
  try {
    const uci = move.match(UCI_RE);
    if (uci) {
      return chess.move({
        from: uci[1].toLowerCase(),
        to: uci[2].toLowerCase(),
        promotion: uci[3]?.toLowerCase(),
      });
    }
    return chess.move(move); // SAN fallback
  } catch {
    return null;
  }
}

/** Convert a chess.js Move to UCI notation. */
export function moveToUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** Validate a FEN string. */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}
