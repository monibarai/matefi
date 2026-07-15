// src/api/router.ts — Express routes (mounted at /api).
import { Router, Request, Response } from 'express';
import matchesRouter from './matches';
import tradersRouter from './traders';
import { config, anyContractConfigured } from '../config';
import { engine } from '../chess/engine';
import { activeGameCount } from '../chess/gameManager';
import { pingDb } from '../db/client';

const router = Router();

// GET /api/health
router.get('/health', async (_req: Request, res: Response) => {
  let dbOk = false;
  try {
    await pingDb();
    dbOk = true;
  } catch {
    /* db down */
  }
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    service: 'matefi-relayer',
    devMode: config.DEV_MODE,
    contractsConfigured: anyContractConfigured(),
    engine: engine.backendName,
    activeGames: activeGameCount(),
    db: dbOk,
  });
});

router.use(matchesRouter);
router.use(tradersRouter);

export default router;
