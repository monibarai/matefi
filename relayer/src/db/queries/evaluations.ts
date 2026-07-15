// src/db/queries/evaluations.ts — query helpers for the evaluations collection.
import { collection, nextSeq } from '../client';

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
  const col = await collection('evaluations');
  await col.insertOne({
    id: await nextSeq('evaluations'),
    match_id: params.matchId,
    move_number: params.moveNumber,
    fen: params.fen,
    depth: params.depth,
    score: params.score,
    created_at: new Date(),
  });
}

export async function listEvaluations(matchId: string): Promise<EvaluationRow[]> {
  const col = await collection('evaluations');
  const rows = await col
    .find({ match_id: matchId }, { projection: { _id: 0 } })
    .sort({ move_number: 1 })
    .toArray();
  return rows as unknown as EvaluationRow[];
}

export async function latestEvaluation(matchId: string): Promise<EvaluationRow | null> {
  const col = await collection('evaluations');
  const rows = await col
    .find({ match_id: matchId }, { projection: { _id: 0 } })
    .sort({ move_number: -1 })
    .limit(1)
    .toArray();
  return (rows[0] as unknown as EvaluationRow) ?? null;
}
