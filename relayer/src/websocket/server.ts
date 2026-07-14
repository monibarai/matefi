// src/websocket/server.ts — ws server with one room per matchId.
//
// NOTE: unlike the README pseudocode, the server is NOT created at import
// time — call startWebSocketServer() from index.ts. This keeps imports
// side-effect free (gameManager imports broadcastToMatch).
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server as HttpServer } from 'http';
import { WsEvent } from './events';

let wss: WebSocketServer | null = null;

// matchId → set of connected clients
const matchRooms = new Map<string, Set<WebSocket>>();

/**
 * Start the WebSocket server.
 *
 * Pass an existing http.Server to share a single port (required on
 * single-port PaaS like Render/Heroku — clients connect to wss://host/?matchId=).
 * Pass a number to bind a standalone port (handy for local dev).
 */
export function startWebSocketServer(target: HttpServer | number): WebSocketServer {
  if (wss) return wss;
  wss =
    typeof target === 'number'
      ? new WebSocketServer({ port: target })
      : new WebSocketServer({ server: target });

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

  const where = typeof target === 'number' ? `standalone port :${target}` : 'shared HTTP server';
  wss.on('listening', () => console.log(`[ws] WebSocket server attached (${where})`));
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
