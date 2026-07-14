'use client';

// WebSocket connection per match room, with automatic reconnection using
// exponential backoff. Defensive: the relayer may not be running at all.

import { useCallback, useEffect, useRef, useState } from 'react';
import { WS_URL } from '@/lib/stellar';
import type { WsEvent } from '@/types/events';

export type { WsEvent, WsEventType } from '@/types/events';

export type WsStatus = 'connecting' | 'open' | 'closed';

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_FACTOR = 1.8;
const BACKOFF_MAX_MS = 15_000;

export function useWebSocket(
  matchId: string,
  onEvent: (event: WsEvent) => void,
) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);

  // Keep the handler fresh without re-subscribing the socket.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!matchId) return;

    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (disposed) return;
      const delay = Math.min(
        BACKOFF_MAX_MS,
        BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, attempt),
      );
      attempt += 1;
      timer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');

      let ws: WebSocket;
      try {
        ws = new WebSocket(`${WS_URL}?matchId=${encodeURIComponent(matchId)}`);
      } catch {
        setStatus('closed');
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as WsEvent;
          if (data && typeof data.type === 'string') onEventRef.current(data);
        } catch {
          // malformed frame — ignore
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (!disposed) {
          setStatus('closed');
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [matchId]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, send };
}
