// Match domain types — mirror the relayer's `games` table rows (README §12)
// and the on-chain MatchRegistry state machine (README §5.3).

export type MatchStatus = 'open' | 'active' | 'locked' | 'completed' | 'cancelled';

export type Winner = 'PlayerA' | 'PlayerB' | 'Draw';

export type PlayerColor = 'white' | 'black';

/** A row from the relayer's `games` table (GET /api/matches, /api/history). */
export interface MatchRecord {
  match_id: string;
  player_a: string;
  player_b: string | null;
  player_a_color: PlayerColor;
  /** USDC stroops (1 USDC = 1e7 stroops) — Postgres BIGINT arrives as string */
  bet_amount: string | number;
  /** seconds per player */
  time_control: number;
  status: MatchStatus;
  winner: Winner | null;
  pgn: string | null;
  current_fen: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  /** present on lobby queries */
  trader_count?: string | number;
  // --- present on /history rows (LEFT JOIN settlements) ---
  /** winner as recorded by the on-chain settlement (may differ from null game winner) */
  settlement_winner?: Winner | null;
  /** USDC stroops paid to the winning player */
  player_prize?: string | null;
  /** USDC stroops of net trading pool distributed */
  trading_net?: string | null;
  /** settlement transaction hash on Stellar */
  settlement_tx_hash?: string | null;
  settled_at?: string | null;
}

/** A row from the `settlements` table (GET /api/matches/:id → settlement). */
export interface SettlementRecord {
  match_id: string;
  winner: Winner;
  player_prize: string | null;
  trading_net: string | null;
  protocol_fee: string | null;
  flywheel_bonus: string | null;
  tx_hash: string | null;
  settled_at: string;
}

/** A row from the `moves` table. */
export interface MoveRecord {
  id: number;
  match_id: string;
  move_number: number;
  move_uci: string;
  fen: string;
  player: string;
  created_at: string;
}

/** A row from the `evaluations` table. */
export interface EvaluationRecord {
  id: number;
  match_id: string;
  move_number: number;
  fen: string;
  depth: number;
  /** centipawns, positive = white better */
  score: number;
  created_at: string;
}

/** Live chess-clock snapshot returned alongside an active match. */
export interface ClockSnapshot {
  whiteMs: number;
  blackMs: number;
  turn: 'w' | 'b';
  running: boolean;
}

/** GET /api/matches/:matchId response shape. */
export interface MatchDetail {
  match: MatchRecord;
  moves: MoveRecord[];
  evaluations: EvaluationRecord[];
  clocks?: ClockSnapshot | null;
  settlement?: SettlementRecord | null;
}
