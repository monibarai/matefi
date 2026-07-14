'use client';

// Match state assembled from the REST snapshot (match record, moves, evals,
// trader positions) and kept live via WebSocket events (README §7.3, §13).

import { useCallback, useEffect, useState } from 'react';
import { useWebSocket, type WsStatus } from './useWebSocket';
import { API_URL } from '@/lib/stellar';
import { START_FEN } from '@/lib/chess';
import { deriveOddsFromPools } from './useTrading';
import type { WsEvent } from '@/types/events';
import type { MatchDetail, MatchRecord, Winner } from '@/types/match';
import type { Outcome, TraderRecord } from '@/types/trading';

export interface LiveMatchState {
  fen: string;
  moveHistory: string[]; // UCI moves
  evalScore: number | null; // centipawns
  evalDepth: number;
  mate: number | null;
  marketLocked: boolean;
  lockEvalScore: number | null;
  gameOver: boolean;
  winner: Winner | null;
  gameOverReason: string | null;
  pgn: string | null;
  poolA: number; // stroops
  poolB: number;
  poolDraw: number;
  oddsA: number; // x100 scaled (185 = 1.85x)
  oddsB: number;
  oddsDraw: number;
  turn: 'w' | 'b';
  settlement: { playerPrize: number; netPool: number; txHash: string | null } | null;
  // Chess clocks (ms remaining). `clockUpdatedAt` is the client timestamp when
  // these values were last authoritative, so the UI can tick the active clock
  // down locally between server updates.
  whiteMs: number | null;
  blackMs: number | null;
  clockUpdatedAt: number;
  clockRunning: boolean;
}

const INITIAL_LIVE: LiveMatchState = {
  fen: START_FEN,
  moveHistory: [],
  evalScore: null,
  evalDepth: 0,
  mate: null,
  marketLocked: false,
  lockEvalScore: null,
  gameOver: false,
  winner: null,
  gameOverReason: null,
  pgn: null,
  poolA: 0,
  poolB: 0,
  poolDraw: 0,
  oddsA: 0,
  oddsB: 0,
  oddsDraw: 0,
  turn: 'w',
  settlement: null,
  whiteMs: null,
  blackMs: null,
  clockUpdatedAt: 0,
  clockRunning: false,
};

export interface UseMatchResult {
  record: MatchRecord | null;
  live: LiveMatchState;
  loading: boolean;
  error: string | null;
  wsStatus: WsStatus;
  refresh: () => void;
}

const MATCH_RETRY_ATTEMPTS = 10;
const MATCH_RETRY_DELAY_MS = 1500;

export function useMatch(matchId: string): UseMatchResult {
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [live, setLive] = useState<LiveMatchState>(INITIAL_LIVE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleEvent = useCallback((event: WsEvent) => {
    switch (event.type) {
      case 'MATCH_STARTED':
        setRecord((prev) =>
          prev
            ? { ...prev, status: 'active', player_b: event.playerB }
            : prev,
        );
        break;

      case 'MOVE':
        setLive((prev) => ({
          ...prev,
          fen: event.fen,
          moveHistory: [...prev.moveHistory, event.move],
          turn: event.turn,
          whiteMs: event.clocks ? event.clocks.whiteMs : prev.whiteMs,
          blackMs: event.clocks ? event.clocks.blackMs : prev.blackMs,
          clockUpdatedAt: Date.now(),
          clockRunning: true,
        }));
        break;

      case 'EVAL':
        setLive((prev) => ({
          ...prev,
          evalScore: event.score,
          evalDepth: event.depth,
          mate: event.mate,
        }));
        break;

      case 'MARKET_LOCKED':
        setLive((prev) => ({
          ...prev,
          marketLocked: true,
          lockEvalScore: event.evalScore,
        }));
        break;

      case 'GAME_OVER':
        setLive((prev) => ({
          ...prev,
          gameOver: true,
          winner: event.winner,
          gameOverReason: event.reason ?? null,
          pgn: event.pgn ?? prev.pgn,
          clockRunning: false,
        }));
        break;

      case 'BET_PLACED':
        setLive((prev) => ({
          ...prev,
          poolA: event.poolA,
          poolB: event.poolB,
          poolDraw: event.poolDraw,
          oddsA: event.oddsA,
          oddsB: event.oddsB,
          oddsDraw: event.oddsDraw,
        }));
        break;

      case 'SETTLEMENT_DONE':
        setLive((prev) => ({
          ...prev,
          gameOver: true,
          settlement: {
            playerPrize: event.playerPrize,
            netPool: event.netPool,
            txHash: event.txHash ?? prev.settlement?.txHash ?? null,
          },
        }));
        break;
    }
  }, []);

  const { status: wsStatus } = useWebSocket(matchId, handleEvent);

  const load = useCallback(async () => {
    if (!matchId) return;
    setError(null);
    try {
      let res: Response | null = null;
      for (let attempt = 0; attempt <= MATCH_RETRY_ATTEMPTS; attempt++) {
        res = await fetch(`${API_URL}/matches/${matchId}`, { cache: 'no-store' });
        if (res.ok || res.status !== 404) break;
        // 404 on first load: relayer may not have indexed the event yet — retry
        if (attempt < MATCH_RETRY_ATTEMPTS) {
          await new Promise<void>((r) => setTimeout(r, MATCH_RETRY_DELAY_MS));
        }
      }
      if (!res!.ok) {
        throw new Error(
          res!.status === 404 ? 'Match not found.' : `Relayer error (${res!.status}).`,
        );
      }
      const data = (await res!.json()) as MatchDetail;
      const m = data.match;
      setRecord(m);

      const lastEval = data.evaluations?.[data.evaluations.length - 1];
      // Clock seeding: prefer the relayer's live snapshot; otherwise fall back to
      // the full per-player allowance (game not yet started or already over).
      const fullMs = Number(m.time_control) * 1000;
      const isOver = m.status === 'completed' || m.status === 'cancelled';
      setLive((prev) => ({
        ...prev,
        fen: m.current_fen || prev.fen,
        moveHistory: data.moves?.map((mv) => mv.move_uci) ?? prev.moveHistory,
        turn: m.current_fen
          ? m.current_fen.split(' ')[1] === 'b'
            ? 'b'
            : 'w'
          : prev.turn,
        evalScore: lastEval ? lastEval.score : prev.evalScore,
        evalDepth: lastEval ? lastEval.depth : prev.evalDepth,
        marketLocked: prev.marketLocked || m.status === 'locked',
        gameOver: prev.gameOver || m.status === 'completed',
        winner: prev.winner ?? m.winner,
        pgn: prev.pgn ?? m.pgn,
        // Seed settlement (winner prize + tx hash) from the recorded row so the
        // settlement UI can link to the on-chain settlement transaction.
        settlement: prev.settlement ?? (data.settlement
          ? {
              playerPrize: Number(data.settlement.player_prize ?? 0),
              netPool: Number(data.settlement.trading_net ?? 0),
              txHash: data.settlement.tx_hash ?? null,
            }
          : null),
        whiteMs: data.clocks ? data.clocks.whiteMs : prev.whiteMs ?? fullMs,
        blackMs: data.clocks ? data.clocks.blackMs : prev.blackMs ?? fullMs,
        clockUpdatedAt: Date.now(),
        clockRunning: data.clocks ? data.clocks.running : !isOver && m.status !== 'open',
      }));

      // Seed pool sizes from recorded trader positions (best effort).
      try {
        const tradersRes = await fetch(`${API_URL}/matches/${matchId}/traders`, {
          cache: 'no-store',
        });
        if (tradersRes.ok) {
          const traders = (await tradersRes.json()) as TraderRecord[];
          if (Array.isArray(traders)) {
            const pools: Record<Outcome, number> = {
              PlayerA: 0,
              PlayerB: 0,
              Draw: 0,
            };
            for (const t of traders) {
              const amt = Number(t.amount_stroops) || 0;
              if (t.outcome in pools) pools[t.outcome] += amt;
            }
            const odds = deriveOddsFromPools({
              poolA: pools.PlayerA,
              poolB: pools.PlayerB,
              poolDraw: pools.Draw,
            });
            setLive((prev) => ({
              ...prev,
              poolA: pools.PlayerA,
              poolB: pools.PlayerB,
              poolDraw: pools.Draw,
              oddsA: odds.oddsA,
              oddsB: odds.oddsB,
              oddsDraw: odds.oddsDraw,
            }));
          }
        }
      } catch {
        // pools stay at zero until the first BET_PLACED event
      }
    } catch (e) {
      setError(
        e instanceof Error && e.message !== 'Failed to fetch'
          ? e.message
          : 'Relayer unreachable — live data will appear once it is running.',
      );
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    setRecord(null);
    setLive(INITIAL_LIVE);
    setLoading(true);
    void load();
  }, [load]);

  // Poll every 3 s while the match is still open (waiting for opponent to join).
  // Stops automatically once status transitions to active/locked/completed.
  const matchStatus = record?.status;
  useEffect(() => {
    if (matchStatus !== 'open') return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [matchStatus, load]);

  return { record, live, loading, error, wsStatus, refresh: load };
}
