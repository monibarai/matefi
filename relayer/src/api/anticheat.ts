// src/api/anticheat.ts — anti-cheat evidence endpoint for match/id/anticheat.
import { Router, Request, Response } from 'express';
import * as antiCheatDb from '../db/queries/antiCheat';
import { config } from '../config';

const router = Router();

// GET /api/match/:matchId/anticheat — per-move engine-match analysis, the
// aggregate suspicion score per player, and any recorded flags. Used by the
// frontend both for the "Flagged" badge and as dispute evidence.
router.get('/match/:matchId/anticheat', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const [moves, suspicions, flags] = await Promise.all([
      antiCheatDb.listMoveAnalysis(matchId),
      antiCheatDb.aggregateSuspicion(matchId, config.ANTICHEAT_OPENING_CUTOFF_PLY),
      antiCheatDb.listFlags(matchId),
    ]);
    res.json({ moves, suspicions, flags });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
