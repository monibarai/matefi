// src/index.ts — MateFi relayer entry point: REST API, WebSocket server,
// Stockfish engine and Soroban event listener.
import express from 'express';
import cors from 'cors';
import http from 'http';
import { config, anyContractConfigured } from './config';
import apiRouter from './api/router';
import { startWebSocketServer, stopWebSocketServer } from './websocket/server';
import { startEventListener, stopEventListener } from './stellar/eventListener';
import { startDisputeWindowKeeper, stopDisputeWindowKeeper } from './jobs/disputeWindowKeeper';
import { reconcileSettlements } from './stellar/reconcile';
import { engine } from './chess/engine';
import { closeDb, pingDb } from './db/client';

async function main(): Promise<void> {
  console.log('[relayer] MateFi relayer starting…');
  console.log(`[relayer] DEV_MODE=${config.DEV_MODE} contractsConfigured=${anyContractConfigured()}`);

  // Verify DB connectivity early.
  try {
    await pingDb();
    console.log('[relayer] MongoDB connection ok');
  } catch (e) {
    console.error('[relayer] MongoDB unreachable:', (e as Error).message);
    console.error('[relayer] check MONGODB_URI and run `npm run migrate`');
  }

  // Warm up Stockfish (non-blocking for the API but logged).
  void engine.init().catch((e) => console.error('[relayer] engine init failed:', e));

  // REST API
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', apiRouter);

  const httpServer = http.createServer(app);

  // WebSocket server. On single-port hosts (Render/Heroku) share the HTTP
  // server so REST + WS use one port; set WS_PORT>0 to bind a standalone port
  // for local dev. Attach before listen so the upgrade handler is registered.
  startWebSocketServer(config.WS_PORT > 0 ? config.WS_PORT : httpServer);

  await new Promise<void>((resolve) =>
    httpServer.listen(config.PORT, () => {
      console.log(`[relayer] REST API listening on :${config.PORT}`);
      resolve();
    })
  );

  // Soroban event listener (no-op when contracts unconfigured)
  startEventListener();

  // Dispute-window keeper: finalizes undisputed matches once their challenge
  // window elapses (no-op when contracts unconfigured).
  startDisputeWindowKeeper();

  // Opt-in: settle any completed-but-unsettled matches left behind by a crash
  // or a failed post_result (winner unpaid, no settlement tx). Off by default
  // because it moves funds on-chain; enable with RECONCILE_ON_START=true.
  if (config.RECONCILE_ON_START && anyContractConfigured()) {
    void reconcileSettlements().catch((e) =>
      console.error('[relayer] startup settlement reconcile failed:', (e as Error).message)
    );
  }

  const shutdown = async (signal: string) => {
    console.log(`[relayer] ${signal} received — shutting down`);
    stopEventListener();
    stopDisputeWindowKeeper();
    engine.quit();
    await stopWebSocketServer();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[relayer] fatal startup error:', e);
  process.exit(1);
});
