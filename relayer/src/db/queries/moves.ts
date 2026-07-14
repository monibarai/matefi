// src/db/queries/moves.ts — query helpers for the moves table.
import { db } from '../client';

export interface MoveRow {
  id: number;
  match_id: string;
  move_number: number;
  move_uci: string;
  fen: string;
  player: string;
  created_at: Date;
}

export async function insertMove(params: {
  matchId: string;
  moveNumber: number;
  moveUci: string;
  fen: string;
  player: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO moves (match_id, move_number, move_uci, fen, player)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.matchId, params.moveNumber, params.moveUci, params.fen, params.player]
  );
}

export async function listMoves(matchId: string): Promise<MoveRow[]> {
  const res = await db.query(
    'SELECT * FROM moves WHERE match_id = $1 ORDER BY move_number ASC',
    [matchId]
  );
  return res.rows;
}

export async function countMoves(matchId: string): Promise<number> {
  const res = await db.query('SELECT COUNT(*)::int AS n FROM moves WHERE match_id = $1', [matchId]);
  return res.rows[0].n as number;
}
