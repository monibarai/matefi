// src/websocket/server.ts — ws server with one room per matchId.
//
// NOTE: unlike the README pseudocode, the server is NOT created at import
// time — call startWebSocketServer() from index.ts. This keeps imports
// side-effect free (gameManager imports broadcastToMatch).
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { WsEvent } from './events';

let wss: WebSocketServer | null = null;

// matchId → set of connected clients
const matchRooms = new Map<string, Set<WebSocket>>();

export function startWebSocketServer(port: number): WebSocketServer {
  if (wss) return wss;
  wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? '/', 'ws://localhost');
    const matchId = url.searchParams.get('matchId');

    if (!matchId) {
      ws.close(1008, 'matchId query parameter required');
      return;
    }

    if (!matchRooms.has(matchId)) matchRooms.set(matchId, new Set());
    matchRooms.get(matchId)!.add(ws);

    ws.send(JSON.stringify({ type: 'CONNECTED', matchId }));

    ws.on('close', () => {
      const room = matchRooms.get(matchId);
      room?.delete(ws);
      if (room && room.size === 0) matchRooms.delete(matchId);
    });

    ws.on('error', () => ws.close());
  });

  wss.on('listening', () => console.log(`[ws] WebSocket server listening on :${port}`));
  return wss;
}

export function broadcastToMatch(matchId: string, data: WsEvent | object): void {
  const room = matchRooms.get(matchId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

export function stopWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) return resolve();
    for (const room of matchRooms.values()) {
      for (const ws of room) ws.terminate();
    }
    matchRooms.clear();
    wss.close(() => resolve());
    wss = null;
  });
}
