// WebSocket event specification — README §13. All events carry `type` + `matchId`.

import type { Winner } from './match';
import type { Outcome } from './trading';

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
  move: string; // UCI, e.g. "e2e4"
  fen: string;
  moveNumber: number;
  turn: 'w' | 'b';
  /** Remaining clock time in ms, anchored at the moment of this move. */
  clocks?: { whiteMs: number; blackMs: number };
}

export interface EvalEvent {
  type: 'EVAL';
  matchId: string;
  score: number; // centipawns
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
  reason: string; // 'checkmate' | 'draw' | 'resignation' | ...
  pgn?: string;
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
  outcome: Outcome;
  amount: number;
}

export interface SettlementDoneEvent {
  type: 'SETTLEMENT_DONE';
  matchId: string;
  winner: string;
  playerPrize: number;
  netPool: number;
  /** settlement transaction hash on Stellar */
  txHash?: string | null;
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

export type WsEventType = WsEvent['type'];
