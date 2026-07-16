// src/db/queries/antiCheat.ts — per-move engine-match analysis + match-level flags.
import { collection, nextSeq } from '../client';

export interface MoveAnalysisRow {
  id: number;
  match_id: string;
  move_number: number;
  player: string;
  actual_move: string;
  engine_best: string | null;
  matches_engine: boolean;
  created_at: Date;
}

export async function insertMoveAnalysis(params: {
  matchId: string;
  moveNumber: number;
  player: string;
  actualMove: string;
  engineBest: string | null;
}): Promise<void> {
  const col = await collection('move_analysis');
  await col.insertOne({
    id: await nextSeq('move_analysis'),
    match_id: params.matchId,
    move_number: params.moveNumber,
    player: params.player,
    actual_move: params.actualMove,
    engine_best: params.engineBest,
    matches_engine: params.engineBest !== null && params.engineBest === params.actualMove,
    created_at: new Date(),
  });
}

export async function listMoveAnalysis(matchId: string): Promise<MoveAnalysisRow[]> {
  const col = await collection('move_analysis');
  const rows = await col
    .find({ match_id: matchId }, { projection: { _id: 0 } })
    .sort({ move_number: 1 })
    .toArray();
  return rows as unknown as MoveAnalysisRow[];
}

export interface PlayerSuspicion {
  player: string;
  movesAnalyzed: number;
  matchesEngine: number;
  matchRate: number; // matchesEngine / movesAnalyzed
}

/**
 * Aggregate top-1 engine-match rate per player, skipping the opening
 * (`openingCutoffPly` half-moves) where near-universal book/engine agreement
 * is expected even for humans. Computed at read time rather than maintained
 * incrementally — same `$group`-aggregation style as `listCompletedGames`
 * in `db/queries/matches.ts`.
 */
export async function aggregateSuspicion(
  matchId: string,
  openingCutoffPly = 8
): Promise<PlayerSuspicion[]> {
  const col = await collection('move_analysis');
  const rows = await col
    .aggregate<{ _id: string; movesAnalyzed: number; matchesEngine: number }>([
      { $match: { match_id: matchId, move_number: { $gt: openingCutoffPly } } },
      {
        $group: {
          _id: '$player',
          movesAnalyzed: { $sum: 1 },
          matchesEngine: { $sum: { $cond: ['$matches_engine', 1, 0] } },
        },
      },
    ])
    .toArray();

  return rows.map((r) => ({
    player: r._id,
    movesAnalyzed: r.movesAnalyzed,
    matchesEngine: r.matchesEngine,
    matchRate: r.movesAnalyzed > 0 ? r.matchesEngine / r.movesAnalyzed : 0,
  }));
}

export interface FlagRow {
  match_id: string;
  player: string;
  suspicion_score: number;
  moves_analyzed: number;
  flagged_at: Date;
}

/** One-per-(match,player) flag doc, written only when suspicion crosses the threshold. */
export async function recordFlag(params: {
  matchId: string;
  player: string;
  suspicionScore: number;
  movesAnalyzed: number;
}): Promise<void> {
  const col = await collection('anti_cheat_flags');
  await col.updateOne(
    { match_id: params.matchId, player: params.player },
    {
      $set: {
        match_id: params.matchId,
        player: params.player,
        suspicion_score: params.suspicionScore,
        moves_analyzed: params.movesAnalyzed,
        flagged_at: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function listFlags(matchId: string): Promise<FlagRow[]> {
  const col = await collection('anti_cheat_flags');
  const rows = await col.find({ match_id: matchId }, { projection: { _id: 0 } }).toArray();
  return rows as unknown as FlagRow[];
}
