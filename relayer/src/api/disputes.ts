// src/api/disputes.ts — dispute-state listing for the admin resolution page.
// Disputes themselves are opened/resolved by player-signed on-chain calls
// (frontend → Settlement directly via Freighter); this is read-only.
import { Router, Request, Response } from 'express';
import * as disputeStateDb from '../db/queries/disputeState';
import type { DisputeStateStatus } from '../db/queries/disputeState';

const router = Router();

// GET /api/disputes?status=disputed (default) | pending | finalized
router.get('/disputes', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as DisputeStateStatus | undefined) ?? 'disputed';
    if (!['pending', 'disputed', 'finalized'].includes(status)) {
      return res.status(400).json({ error: 'status must be pending, disputed, or finalized' });
    }
    res.json(await disputeStateDb.listByStatus(status));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
