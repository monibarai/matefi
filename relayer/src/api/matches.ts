// src/api/matches.ts — match CRUD endpoints (README section 6.5 + dev helpers).
import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { submitMove, handleResignation, getGameState, initGame, getLiveClocks } from '../chess/gameManager';
import { broadcastToMatch } from '../websocket/server';
import * as matchesDb from '../db/queries/matches';
import * as movesDb from '../db/queries/moves';
import * as evalsDb from '../db/queries/evaluations';

const router = Router();

// GET /api/matches — all open and active matches (lobby)
router.get('/matches', async (_req: Request, res: Response) => {
  try {
    res.json(await matchesDb.listLobbyGames());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/history?limit=&offset= — completed matches joined with their
// settlement (winner, player prize, settlement tx hash).
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json(await matchesDb.listCompletedGames(limit, offset));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/matches/:matchId/init — DEV/TESTING ONLY: create + start a match
// off-chain (no contracts needed). Body: { playerA, playerB, betAmount?,
// timeControlSecs?, playerAColor? }. betAmount in USDC stroops (1 USDC = 1e7).
router.post('/matches/:matchId/init', async (req: Request, res: Response) => {
  if (!config.DEV_MODE) {
    return res.status(403).json({ error: 'DEV_MODE is disabled — matches are created on-chain' });
  }
  try {
    const matchId = req.params.matchId === 'new' ? randomUUID() : req.params.matchId;
    const { playerA, playerB, betAmount, timeControlSecs, playerAColor } = req.body ?? {};
    if (!playerA || !playerB) {
      return res.status(400).json({ error: 'playerA and playerB required' });
    }
    if (getGameState(matchId) || (await matchesDb.getGame(matchId))) {
      return res.status(409).json({ error: 'Match already exists' });
    }

    await initGame(matchId, String(playerA), String(playerB), {
      playerAColor: playerAColor === 'black' ? 'black' : 'white',
      betAmount: betAmount !== undefined ? BigInt(betAmount) : 0n,
      timeControlSecs: Number(timeControlSecs) || 600,
    });

    broadcastToMatch(matchId, {
      type: 'MATCH_STARTED',
      matchId,
      playerA: String(playerA),
      playerB: String(playerB),
    });

    res.status(201).json({ success: true, matchId });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/matches/:matchId — single match details (match + moves + evals)
router.get('/matches/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const match = await matchesDb.getGame(matchId);
    if (!match) return res.status(404).json({ error: 'Not found' });

    const [moves, evaluations, settlement] = await Promise.all([
      movesDb.listMoves(matchId),
      evalsDb.listEvaluations(matchId),
      matchesDb.getSettlement(matchId),
    ]);
    // Live clock snapshot (rehydrates the game from DB if needed; null for
    // non-active matches).
    const clocks = await getLiveClocks(matchId);
    res.json({ match, moves, evaluations, clocks, settlement });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/matches/:matchId/move — submit a chess move
router.post('/matches/:matchId/move', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const { playerAddress, move } = req.body ?? {};

    if (!playerAddress || !move) {
      return res.status(400).json({ error: 'playerAddress and move required' });
    }

    const result = await submitMove(matchId, String(playerAddress), String(move));
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json({ success: true, gameOver: result.gameOver ?? false, fen: result.fen });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/matches/:matchId/resign — player resigns
router.post('/matches/:matchId/resign', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    const { playerAddress } = req.body ?? {};
    if (!playerAddress) return res.status(400).json({ error: 'playerAddress required' });

    const result = await handleResignation(matchId, String(playerAddress));
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
