// src/db/queries/moves.ts — query helpers for the moves collection.
import { collection, nextSeq } from '../client';

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
  const col = await collection('moves');
  await col.insertOne({
    id: await nextSeq('moves'),
    match_id: params.matchId,
    move_number: params.moveNumber,
    move_uci: params.moveUci,
    fen: params.fen,
    player: params.player,
    created_at: new Date(),
  });
}

export async function listMoves(matchId: string): Promise<MoveRow[]> {
  const col = await collection('moves');
  const rows = await col
    .find({ match_id: matchId }, { projection: { _id: 0 } })
    .sort({ move_number: 1 })
    .toArray();
  return rows as unknown as MoveRow[];
}

export async function countMoves(matchId: string): Promise<number> {
  const col = await collection('moves');
  return col.countDocuments({ match_id: matchId });
}
