// Pure, side-effect-free helpers for deriving a player's record from
// already-fetched match rows — no extra relayer round-trip needed since
// the history page fetches the full page of matches anyway.

import type { MatchRecord, Winner } from '@/types/match';

export interface PlayerStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** 0-100, rounded to one decimal. NaN-safe: 0 when total is 0. */
  winRate: number;
  /** Longest run of consecutive wins found in the given match order. */
  bestStreak: number;
  /** Current run length and its kind, read from the most recent match backwards. */
  currentStreak: { length: number; kind: 'win' | 'loss' | 'draw' | null };
}

const EMPTY_STATS: PlayerStats = {
  total: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
  bestStreak: 0,
  currentStreak: { length: 0, kind: null },
};

/** Which side `address` played in a settled match, or null if they didn't play in it. */
function sideOf(match: MatchRecord, address: string): 'PlayerA' | 'PlayerB' | null {
  if (match.player_a === address) return 'PlayerA';
  if (match.player_b === address) return 'PlayerB';
  return null;
}

function outcomeFor(match: MatchRecord, address: string): 'win' | 'loss' | 'draw' | null {
  const winner: Winner | null = match.settlement_winner ?? match.winner;
  if (!winner) return null;
  const side = sideOf(match, address);
  if (!side) return null;
  if (winner === 'Draw') return 'draw';
  return winner === side ? 'win' : 'loss';
}

/**
 * Computes a player's win/loss/draw record from a list of match rows.
 * Only matches that involve `address` and have a recorded winner count.
 * `matches` is expected newest-first, matching the /history API's default
 * ordering — that ordering determines "current streak".
 */
export function computeMatchStats(matches: MatchRecord[], address: string | null | undefined): PlayerStats {
  if (!address) return EMPTY_STATS;

  const outcomes = matches
    .map((m) => outcomeFor(m, address))
    .filter((o): o is 'win' | 'loss' | 'draw' => o !== null);

  if (outcomes.length === 0) return EMPTY_STATS;

  const wins = outcomes.filter((o) => o === 'win').length;
  const losses = outcomes.filter((o) => o === 'loss').length;
  const draws = outcomes.filter((o) => o === 'draw').length;
  const total = outcomes.length;
  const winRate = Math.round((wins / total) * 1000) / 10;

  let bestStreak = 0;
  let running = 0;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (outcomes[i] === 'win') {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  const currentKind = outcomes[0];
  let currentLength = 0;
  for (const o of outcomes) {
    if (o === currentKind) currentLength += 1;
    else break;
  }

  return {
    total,
    wins,
    losses,
    draws,
    winRate,
    bestStreak,
    currentStreak: { length: currentLength, kind: currentKind },
  };
}
