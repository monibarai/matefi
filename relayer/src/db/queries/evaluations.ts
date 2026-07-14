// src/db/queries/evaluations.ts — query helpers for the evaluations table.
import { db } from '../client';

export interface EvaluationRow {
  id: number;
  match_id: string;
  move_number: number;
  fen: string;
  depth: number;
  score: number;
  created_at: Date;
}

export async function insertEvaluation(params: {
  matchId: string;
  moveNumber: number;
  fen: string;
  depth: number;
  score: number;
}): Promise<void> {
  await db.query(
    `INSERT INTO evaluations (match_id, move_number, fen, depth, score)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.matchId, params.moveNumber, params.fen, params.depth, params.score]
  );
}

export async function listEvaluations(matchId: string): Promise<EvaluationRow[]> {
  const res = await db.query(
    'SELECT * FROM evaluations WHERE match_id = $1 ORDER BY move_number ASC',
    [matchId]
  );
  return res.rows;
}

export async function latestEvaluation(matchId: string): Promise<EvaluationRow | null> {
  const res = await db.query(
    'SELECT * FROM evaluations WHERE match_id = $1 ORDER BY move_number DESC LIMIT 1',
    [matchId]
  );
  return (res.rows[0] as EvaluationRow) ?? null;
}
