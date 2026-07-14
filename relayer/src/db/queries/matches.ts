// src/db/queries/matches.ts — query helpers for the games + settlements tables.
import { db } from '../client';

export interface GameRow {
  match_id: string;
  player_a: string;
  player_b: string | null;
  player_a_color: 'white' | 'black';
  bet_amount: string; // BIGINT comes back as string from pg
  time_control: number;
  status: 'open' | 'active' | 'locked' | 'completed' | 'cancelled';
  winner: 'PlayerA' | 'PlayerB' | 'Draw' | null;
  pgn: string | null;
  current_fen: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
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
  await db.query(
    `INSERT INTO games (match_id, player_a, player_b, player_a_color, bet_amount, time_control, status, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 'active' THEN NOW() ELSE NULL END)
     ON CONFLICT (match_id) DO NOTHING`,
    [
      params.matchId,
      params.playerA,
      params.playerB ?? null,
      params.playerAColor ?? 'white',
      params.betAmount.toString(),
      params.timeControl,
      params.status ?? 'open',
    ]
  );
}

export async function getGame(matchId: string): Promise<GameRow | null> {
  const res = await db.query('SELECT * FROM games WHERE match_id = $1', [matchId]);
  return (res.rows[0] as GameRow) ?? null;
}

export async function listLobbyGames(): Promise<Array<GameRow & { trader_count: string }>> {
  const res = await db.query(
    `SELECT m.*,
       (SELECT COUNT(*) FROM traders t WHERE t.match_id = m.match_id) AS trader_count
     FROM games m
     WHERE m.status IN ('open', 'active', 'locked')
     ORDER BY m.created_at DESC
     LIMIT 50`
  );
  return res.rows;
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
  const res = await db.query(
    `SELECT g.*,
            s.winner       AS settlement_winner,
            s.player_prize AS player_prize,
            s.trading_net  AS trading_net,
            s.tx_hash      AS settlement_tx_hash,
            s.settled_at   AS settled_at
     FROM games g
     LEFT JOIN settlements s ON s.match_id = g.match_id
     WHERE g.status = 'completed'
     ORDER BY g.completed_at DESC NULLS LAST, g.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows;
}

export async function activateGame(matchId: string, playerB: string): Promise<void> {
  // Only an 'open' match may be activated. Guarding on status keeps a replayed
  // MatchActive event from reverting a finished (completed/cancelled) or live
  // (active/locked) game, and COALESCE preserves the original start time.
  await db.query(
    `UPDATE games
     SET player_b = $2, status = 'active', started_at = COALESCE(started_at, NOW())
     WHERE match_id = $1 AND status = 'open'`,
    [matchId, playerB]
  );
}

export async function updateGameStatus(matchId: string, status: string): Promise<void> {
  await db.query('UPDATE games SET status = $2 WHERE match_id = $1', [matchId, status]);
}

export async function updateCurrentFen(matchId: string, fen: string): Promise<void> {
  await db.query('UPDATE games SET current_fen = $2 WHERE match_id = $1', [matchId, fen]);
}

export async function completeGame(
  matchId: string,
  winner: 'PlayerA' | 'PlayerB' | 'Draw',
  pgn: string | null
): Promise<void> {
  await db.query(
    `UPDATE games SET status = 'completed', winner = $2, pgn = $3, completed_at = NOW()
     WHERE match_id = $1`,
    [matchId, winner, pgn]
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
 * Record (or enrich) a settlement. This is written from two places that may
 * arrive in either order: the relayer's result-posting path (knows the winner
 * and tx hash immediately) and the on-chain `MatchSettled` event handler (knows
 * the prize/fee breakdown). The UPSERT merges them with COALESCE so a later
 * write only *fills in* columns the first write left null — it never clobbers a
 * value already present (e.g. the tx hash captured at result time survives).
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
  await db.query(
    `INSERT INTO settlements (match_id, winner, player_prize, trading_net, protocol_fee, flywheel_bonus, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (match_id) DO UPDATE SET
       winner         = COALESCE(EXCLUDED.winner, settlements.winner),
       player_prize   = COALESCE(EXCLUDED.player_prize, settlements.player_prize),
       trading_net    = COALESCE(EXCLUDED.trading_net, settlements.trading_net),
       protocol_fee   = COALESCE(EXCLUDED.protocol_fee, settlements.protocol_fee),
       flywheel_bonus = COALESCE(EXCLUDED.flywheel_bonus, settlements.flywheel_bonus),
       tx_hash        = COALESCE(EXCLUDED.tx_hash, settlements.tx_hash)`,
    [
      params.matchId,
      params.winner,
      params.playerPrize?.toString() ?? null,
      params.tradingNet?.toString() ?? null,
      params.protocolFee?.toString() ?? null,
      params.flywheelBonus?.toString() ?? null,
      params.txHash ?? null,
    ]
  );
}

export async function getSettlement(matchId: string): Promise<SettlementRow | null> {
  const res = await db.query('SELECT * FROM settlements WHERE match_id = $1', [matchId]);
  return (res.rows[0] as SettlementRow) ?? null;
}
