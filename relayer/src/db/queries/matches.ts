// src/db/queries/matches.ts — query helpers for the games + settlements collections.
import { collection } from '../client';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// games and settlements use match_id as the document _id (a string), so the
// collections are typed with a string _id instead of the default ObjectId.
interface StringIdDoc {
  _id: string;
  [key: string]: unknown;
}

export interface GameRow {
  match_id: string;
  player_a: string;
  player_b: string | null;
  player_a_color: 'white' | 'black';
  bet_amount: string; // stored as string to preserve exact stroop precision
  time_control: number;
  status: 'open' | 'active' | 'locked' | 'completed' | 'cancelled';
  winner: 'PlayerA' | 'PlayerB' | 'Draw' | null;
  pgn: string | null;
  current_fen: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

/** Strip Mongo's `_id` so callers see exactly the Row shape. */
function strip<T>(doc: Record<string, unknown> | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as T;
}

export async function createGame(params: {
  matchId: string;
  playerA: string;
  playerB?: string | null;
  playerAColor?: 'white' | 'black';
  betAmount: bigint | number | string;
  timeControl: number;
  status?: string;
}): Promise<void> {
  const col = await collection<StringIdDoc>('games');
  const now = new Date();
  const status = params.status ?? 'open';
  // Upsert with $setOnInsert == "INSERT ... ON CONFLICT (match_id) DO NOTHING".
  await col.updateOne(
    { _id: params.matchId },
    {
      $setOnInsert: {
        match_id: params.matchId,
        player_a: params.playerA,
        player_b: params.playerB ?? null,
        player_a_color: params.playerAColor ?? 'white',
        bet_amount: params.betAmount.toString(),
        time_control: params.timeControl,
        status,
        winner: null,
        pgn: null,
        current_fen: DEFAULT_FEN,
        created_at: now,
        started_at: status === 'active' ? now : null,
        completed_at: null,
      },
    },
    { upsert: true }
  );
}

export async function getGame(matchId: string): Promise<GameRow | null> {
  const col = await collection<StringIdDoc>('games');
  const doc = await col.findOne({ _id: matchId });
  return strip<GameRow>(doc as Record<string, unknown> | null);
}

export async function listLobbyGames(): Promise<Array<GameRow & { trader_count: string }>> {
  const col = await collection<StringIdDoc>('games');
  const rows = await col
    .aggregate([
      { $match: { status: { $in: ['open', 'active', 'locked'] } } },
      { $sort: { created_at: -1 } },
      { $limit: 50 },
      { $lookup: { from: 'traders', localField: 'match_id', foreignField: 'match_id', as: '_t' } },
      { $addFields: { trader_count: { $toString: { $size: '$_t' } } } },
      { $project: { _t: 0, _id: 0 } },
    ])
    .toArray();
  return rows as Array<GameRow & { trader_count: string }>;
}

/** A completed game joined with its settlement (winner, prize, tx hash). */
export interface CompletedGameRow extends GameRow {
  settlement_winner: 'PlayerA' | 'PlayerB' | 'Draw' | null;
  player_prize: string | null;
  trading_net: string | null;
  settlement_tx_hash: string | null;
  settled_at: Date | null;
}

export async function listCompletedGames(limit = 20, offset = 0): Promise<CompletedGameRow[]> {
  const col = await collection<StringIdDoc>('games');
  const rows = await col
    .aggregate([
      { $match: { status: 'completed' } },
      // Mongo sorts null/missing lowest, so descending puts them last (NULLS LAST).
      { $sort: { completed_at: -1, created_at: -1 } },
      { $skip: offset },
      { $limit: limit },
      { $lookup: { from: 'settlements', localField: 'match_id', foreignField: 'match_id', as: '_s' } },
      { $addFields: { _s: { $arrayElemAt: ['$_s', 0] } } },
      {
        $addFields: {
          settlement_winner: { $ifNull: ['$_s.winner', null] },
          player_prize: { $ifNull: ['$_s.player_prize', null] },
          trading_net: { $ifNull: ['$_s.trading_net', null] },
          settlement_tx_hash: { $ifNull: ['$_s.tx_hash', null] },
          settled_at: { $ifNull: ['$_s.settled_at', null] },
        },
      },
      { $project: { _s: 0, _id: 0 } },
    ])
    .toArray();
  return rows as CompletedGameRow[];
}

export async function activateGame(matchId: string, playerB: string): Promise<void> {
  // Only an 'open' match may be activated (guards against replayed MatchActive
  // events reverting a finished/live game). $ifNull preserves the start time.
  const col = await collection<StringIdDoc>('games');
  await col.updateOne({ _id: matchId, status: 'open' }, [
    {
      $set: {
        player_b: playerB,
        status: 'active',
        started_at: { $ifNull: ['$started_at', new Date()] },
      },
    },
  ]);
}

export async function updateGameStatus(matchId: string, status: string): Promise<void> {
  const col = await collection<StringIdDoc>('games');
  await col.updateOne({ _id: matchId }, { $set: { status } });
}

export async function updateCurrentFen(matchId: string, fen: string): Promise<void> {
  const col = await collection<StringIdDoc>('games');
  await col.updateOne({ _id: matchId }, { $set: { current_fen: fen } });
}

export async function completeGame(
  matchId: string,
  winner: 'PlayerA' | 'PlayerB' | 'Draw',
  pgn: string | null
): Promise<void> {
  const col = await collection<StringIdDoc>('games');
  await col.updateOne(
    { _id: matchId },
    { $set: { status: 'completed', winner, pgn, completed_at: new Date() } }
  );
}

export interface SettlementRow {
  match_id: string;
  winner: 'PlayerA' | 'PlayerB' | 'Draw';
  player_prize: string | null;
  trading_net: string | null;
  protocol_fee: string | null;
  flywheel_bonus: string | null;
  tx_hash: string | null;
  settled_at: Date;
}

/**
 * Record (or enrich) a settlement. Written from two paths that can arrive in
 * either order (result-posting knows winner+tx; the MatchSettled event knows the
 * prize/fee breakdown). Each field uses $ifNull(incoming, existing) to mirror the
 * old COALESCE(EXCLUDED.x, settlements.x): a non-null incoming value wins, but a
 * null incoming leaves the existing value intact. settled_at is set once.
 */
export async function recordSettlement(params: {
  matchId: string;
  winner: string;
  playerPrize?: bigint | number | null;
  tradingNet?: bigint | number | null;
  protocolFee?: bigint | number | null;
  flywheelBonus?: bigint | number | null;
  txHash?: string | null;
}): Promise<void> {
  const col = await collection<StringIdDoc>('settlements');
  const s = (v?: bigint | number | null): string | null =>
    v === undefined || v === null ? null : v.toString();
  await col.updateOne(
    { _id: params.matchId },
    [
      {
        $set: {
          match_id: params.matchId,
          winner: { $ifNull: [params.winner, '$winner'] },
          player_prize: { $ifNull: [s(params.playerPrize), '$player_prize'] },
          trading_net: { $ifNull: [s(params.tradingNet), '$trading_net'] },
          protocol_fee: { $ifNull: [s(params.protocolFee), '$protocol_fee'] },
          flywheel_bonus: { $ifNull: [s(params.flywheelBonus), '$flywheel_bonus'] },
          tx_hash: { $ifNull: [params.txHash ?? null, '$tx_hash'] },
          settled_at: { $ifNull: ['$settled_at', new Date()] },
        },
      },
    ],
    { upsert: true }
  );
}

export async function getSettlement(matchId: string): Promise<SettlementRow | null> {
  const col = await collection<StringIdDoc>('settlements');
  const doc = await col.findOne({ _id: matchId });
  return strip<SettlementRow>(doc as Record<string, unknown> | null);
}
