// src/websocket/events.ts — server → client event types (README section 13).

export type Winner = 'PlayerA' | 'PlayerB' | 'Draw';
export type Outcome = 'PlayerA' | 'PlayerB' | 'Draw';

export interface ConnectedEvent {
  type: 'CONNECTED';
  matchId: string;
}

export interface MatchStartedEvent {
  type: 'MATCH_STARTED';
  matchId: string;
  playerA: string;
  playerB: string;
}

export interface MoveEvent {
  type: 'MOVE';
  matchId: string;
  move: string;
  fen: string;
  moveNumber: number;
  turn: 'w' | 'b';
  /** Remaining clock time in ms (basic tracking; not part of README spec). */
  clocks?: { whiteMs: number; blackMs: number };
}

export interface EvalEvent {
  type: 'EVAL';
  matchId: string;
  score: number;       // centipawns, white perspective
  depth: number;
  mate: number | null;
  moveNumber: number;
}

export interface MarketLockedEvent {
  type: 'MARKET_LOCKED';
  matchId: string;
  evalScore: number;
  message: string;
}

export interface GameOverEvent {
  type: 'GAME_OVER';
  matchId: string;
  winner: Winner;
  reason: string;      // 'checkmate' | 'draw' | 'stalemate' | 'resignation' | ...
  pgn: string;
}

export interface BetPlacedEvent {
  type: 'BET_PLACED';
  matchId: string;
  poolA: number;
  poolB: number;
  poolDraw: number;
  oddsA: number;
  oddsB: number;
  oddsDraw: number;
  traderAddress: string;
  outcome: string;
  amount: number;
}

export interface SettlementDoneEvent {
  type: 'SETTLEMENT_DONE';
  matchId: string;
  winner: string;
  playerPrize: number;
  netPool: number;
}

export type WsEvent =
  | ConnectedEvent
  | MatchStartedEvent
  | MoveEvent
  | EvalEvent
  | MarketLockedEvent
  | GameOverEvent
  | BetPlacedEvent
  | SettlementDoneEvent;
