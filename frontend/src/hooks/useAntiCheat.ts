'use client';

// Anti-cheat + dispute state for a match: REST snapshot kept live via the
// same WebSocket channel `useMatch` uses (MATCH_FLAGGED / DISPUTE_OPENED /
// DISPUTE_RESOLVED). Mirrors `useMatch.ts`'s shape.

import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import { API_URL } from '@/lib/stellar';
import type { WsEvent } from '@/types/events';
import type { AntiCheatDetail, PlayerSuspicion, Winner } from '@/types/anticheat';

export interface LiveAntiCheatState {
  suspicions: PlayerSuspicion[];
  flaggedPlayers: Set<string>;
  disputeStatus: 'none' | 'submitted' | 'disputed' | 'finalized';
  disputeOpenedBy: string | null;
  submittedAt: number | null;
  windowSecs: number | null;
  finalWinner: Winner | null;
}

const INITIAL: LiveAntiCheatState = {
  suspicions: [],
  flaggedPlayers: new Set(),
  disputeStatus: 'none',
  disputeOpenedBy: null,
  submittedAt: null,
  windowSecs: null,
  finalWinner: null,
};

export interface UseAntiCheatResult {
  live: LiveAntiCheatState;
  loading: boolean;
  refresh: () => void;
}

export function useAntiCheat(matchId: string): UseAntiCheatResult {
  const [live, setLive] = useState<LiveAntiCheatState>(INITIAL);
  const [loading, setLoading] = useState(true);

  const handleEvent = useCallback((event: WsEvent) => {
    switch (event.type) {
      case 'MATCH_FLAGGED':
        setLive((prev) => ({
          ...prev,
          flaggedPlayers: new Set(prev.flaggedPlayers).add(event.player),
        }));
        break;

      case 'RESULT_SUBMITTED':
        setLive((prev) => ({
          ...prev,
          disputeStatus: 'submitted',
          submittedAt: event.submittedAt,
          windowSecs: event.windowSecs,
        }));
        break;

      case 'DISPUTE_OPENED':
        setLive((prev) => ({
          ...prev,
          disputeStatus: 'disputed',
          disputeOpenedBy: event.openedBy,
        }));
        break;

      case 'DISPUTE_RESOLVED':
        setLive((prev) => ({
          ...prev,
          disputeStatus: 'finalized',
          finalWinner: event.finalWinner,
        }));
        break;
    }
  }, []);

  useWebSocket(matchId, handleEvent);

  const load = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`${API_URL}/match/${matchId}/anticheat`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as AntiCheatDetail;
      setLive((prev) => ({
        ...prev,
        suspicions: data.suspicions,
        flaggedPlayers: new Set([...prev.flaggedPlayers, ...data.flags.map((f) => f.player)]),
      }));
    } catch {
      // anti-cheat evidence is supplementary — fail silently, badges just stay off
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    setLive(INITIAL);
    setLoading(true);
    void load();
  }, [load]);

  return { live, loading, refresh: load };
}
