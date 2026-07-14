// src/api/traders.ts — trader query endpoints.
import { Router, Request, Response } from 'express';
import * as tradersDb from '../db/queries/traders';
import { predictionPool } from '../stellar/contracts/predictionPool';

const router = Router();

// GET /api/matches/:matchId/traders — trader positions for a match
router.get('/matches/:matchId/traders', async (req: Request, res: Response) => {
  try {
    res.json(await tradersDb.listTraders(req.params.matchId));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/matches/:matchId/market — live pool sizes + odds from the contract
// (null when contracts are unconfigured / match is off-chain)
router.get('/matches/:matchId/market', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const [market, odds] = await Promise.all([
      predictionPool.getMarket(matchId),
      predictionPool.getOdds(matchId),
    ]);
    if (!market) return res.json({ market: null, odds: null });
    res.json({
      market: {
        poolA: market.pool_a.toString(),
        poolB: market.pool_b.toString(),
        poolDraw: market.pool_draw.toString(),
        totalVolume: market.total_volume.toString(),
        locked: market.locked,
        lockEvalScore: market.lock_eval_score,
        settled: market.settled,
      },
      odds: odds ? { oddsA: odds[0], oddsB: odds[1], oddsDraw: odds[2] } : null,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
