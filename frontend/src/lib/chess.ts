// chess.js helpers — FEN utilities, UCI parsing, SAN history, colors.

import { Chess } from 'chess.js';
import type { MatchRecord, PlayerColor } from '@/types/match';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Side to move from a FEN string. */
export function turnFromFen(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** Centipawns to display pawns: +267 -> "+2.67". */
export function cpToDisplay(cp: number): string {
  const pawns = cp / 100;
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

export interface UciParts {
  from: string;
  to: string;
  promotion?: string;
}

/** Split a UCI move string ("e2e4", "e7e8q") into parts. */
export function parseUci(uci: string): UciParts | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : undefined,
  };
}

export interface MoveAttempt {
  legal: boolean;
  uci: string;
  fen: string;
  san: string;
}

/**
 * Validate a move against a FEN. Returns the resulting position when legal,
 * null otherwise. Promotions default to queen (README §7.4).
 */
export function tryMove(
  fen: string,
  from: string,
  to: string,
  promotion: string = 'q',
): MoveAttempt | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from, to, promotion });
    if (!move) return null;
    const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
    return { legal: true, uci, fen: chess.fen(), san: move.san };
  } catch {
    return null;
  }
}

export interface SanRow {
  number: number;
  white: string | null;
  black: string | null;
}

/**
 * Replay a UCI move list from the start position and return SAN pairs for
 * display. Falls back to the raw UCI string if a move fails to replay.
 */
export function uciHistoryToSanRows(moves: string[]): SanRow[] {
  const chess = new Chess();
  const sans: string[] = [];
  for (const uci of moves) {
    const parts = parseUci(uci);
    if (!parts) {
      sans.push(uci);
      continue;
    }
    try {
      const move = chess.move({
        from: parts.from,
        to: parts.to,
        promotion: parts.promotion ?? 'q',
      });
      sans.push(move ? move.san : uci);
    } catch {
      sans.push(uci);
    }
  }
  const rows: SanRow[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({
      number: i / 2 + 1,
      white: sans[i] ?? null,
      black: sans[i + 1] ?? null,
    });
  }
  return rows;
}

/**
 * Derive the connected wallet's color for a match.
 * Returns null for spectators (README: player_a_color comes from the API).
 */
export function playerColorFor(
  address: string | null | undefined,
  record: Pick<MatchRecord, 'player_a' | 'player_b' | 'player_a_color'> | null,
): PlayerColor | null {
  if (!address || !record) return null;
  const aColor: PlayerColor = record.player_a_color === 'black' ? 'black' : 'white';
  if (address === record.player_a) return aColor;
  if (record.player_b && address === record.player_b) {
    return aColor === 'white' ? 'black' : 'white';
  }
  return null;
}

/** Map a Winner symbol to the corresponding player address (or null on draw). */
export function winnerAddress(
  winner: 'PlayerA' | 'PlayerB' | 'Draw' | null,
  record: Pick<MatchRecord, 'player_a' | 'player_b'> | null,
): string | null {
  if (!winner || !record || winner === 'Draw') return null;
  return winner === 'PlayerA' ? record.player_a : record.player_b ?? null;
}
