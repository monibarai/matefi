// Anti-cheat + dispute-resolution domain types — mirror the relayer's
// `move_analysis`/`anti_cheat_flags`/`dispute_state` collections and the
// on-chain Settlement dispute state machine (contracts/settlement).

import type { Winner } from './match';

export type { Winner };

/** A row from the relayer's `move_analysis` collection. */
export interface MoveAnalysisRow {
  id: number;
  match_id: string;
  move_number: number;
  player: string;
  actual_move: string;
  engine_best: string | null;
  matches_engine: boolean;
  created_at: string;
}

export interface PlayerSuspicion {
  player: string;
  movesAnalyzed: number;
  matchesEngine: number;
  matchRate: number; // 0..1
}

export interface FlagRow {
  match_id: string;
  player: string;
  suspicion_score: number;
  moves_analyzed: number;
  flagged_at: string;
}

/** GET /api/match/:matchId/anticheat response shape. */
export interface AntiCheatDetail {
  moves: MoveAnalysisRow[];
  suspicions: PlayerSuspicion[];
  flags: FlagRow[];
}

export type DisputeStateStatus = 'pending' | 'disputed' | 'finalized';

export interface DisputeStateRow {
  match_id: string;
  winner: Winner;
  submitted_at: string;
  window_secs: number;
  status: DisputeStateStatus;
  opened_by: string | null;
  reason: string | null;
  opened_at: string | null;
  final_winner: Winner | null;
}

/** Mirrors `contracts::settlement::state::DisputeOutcome` for `resolveDispute`. */
export type DisputeOutcome =
  | { tag: 'Uphold' }
  | { tag: 'Reverse'; winner: Winner }
  | { tag: 'Void' };
