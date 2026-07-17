/**
 * Unit tests for the player-record aggregation in src/lib/stats.ts.
 * Pure functions over plain MatchRecord fixtures — no network or wallet
 * required, matches are given newest-first as the /history API returns them.
 */

import { computeMatchStats } from '@/lib/stats';
import type { MatchRecord } from '@/types/match';

const ME = 'GABC000000000000000000000000000000000000000000000000000AAAA';
const OPPONENT = 'GXYZ000000000000000000000000000000000000000000000000000BBBB';

function match(overrides: Partial<MatchRecord>): MatchRecord {
  return {
    match_id: 'm-1',
    player_a: ME,
    player_b: OPPONENT,
    player_a_color: 'white',
    bet_amount: '100000000',
    time_control: 300,
    status: 'completed',
    winner: 'PlayerA',
    pgn: null,
    current_fen: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeMatchStats', () => {
  test('returns an empty record when there is no address', () => {
    expect(computeMatchStats([match({})], null)).toEqual({
      total: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      bestStreak: 0,
      currentStreak: { length: 0, kind: null },
    });
  });

  test('returns an empty record when the player has no settled matches', () => {
    const matches = [match({ player_a: OPPONENT, player_b: 'someone-else', winner: 'PlayerA' })];
    expect(computeMatchStats(matches, ME).total).toBe(0);
  });

  test('counts a win when the address matches the winning side', () => {
    const stats = computeMatchStats([match({ player_a: ME, winner: 'PlayerA' })], ME);
    expect(stats).toMatchObject({ total: 1, wins: 1, losses: 0, draws: 0, winRate: 100 });
  });

  test('counts a loss when the address is the non-winning side', () => {
    const stats = computeMatchStats([match({ player_a: ME, player_b: OPPONENT, winner: 'PlayerB' })], ME);
    expect(stats).toMatchObject({ total: 1, wins: 0, losses: 1, draws: 0, winRate: 0 });
  });

  test('counts a draw for either side', () => {
    const stats = computeMatchStats([match({ player_a: ME, winner: 'Draw' })], ME);
    expect(stats).toMatchObject({ total: 1, wins: 0, losses: 0, draws: 1 });
  });

  test('works when the address played as player_b', () => {
    const stats = computeMatchStats(
      [match({ player_a: OPPONENT, player_b: ME, winner: 'PlayerB' })],
      ME,
    );
    expect(stats).toMatchObject({ total: 1, wins: 1 });
  });

  test('prefers settlement_winner over the game winner when both are present', () => {
    const stats = computeMatchStats(
      [match({ player_a: ME, winner: 'PlayerB', settlement_winner: 'PlayerA' })],
      ME,
    );
    expect(stats).toMatchObject({ wins: 1, losses: 0 });
  });

  test('ignores matches with no recorded winner', () => {
    const stats = computeMatchStats([match({ player_a: ME, winner: null, status: 'active' })], ME);
    expect(stats.total).toBe(0);
  });

  test('computes win rate rounded to one decimal', () => {
    const matches = [
      match({ match_id: '1', player_a: ME, winner: 'PlayerA' }),
      match({ match_id: '2', player_a: ME, winner: 'PlayerB' }),
      match({ match_id: '3', player_a: ME, winner: 'PlayerA' }),
    ];
    expect(computeMatchStats(matches, ME).winRate).toBe(66.7);
  });

  test('current streak counts consecutive results from the newest match', () => {
    // Newest-first: win, win, loss
    const matches = [
      match({ match_id: '1', player_a: ME, winner: 'PlayerA' }),
      match({ match_id: '2', player_a: ME, winner: 'PlayerA' }),
      match({ match_id: '3', player_a: ME, winner: 'PlayerB' }),
    ];
    expect(computeMatchStats(matches, ME).currentStreak).toEqual({ length: 2, kind: 'win' });
  });

  test('best streak finds the longest win run anywhere in the history', () => {
    // Newest-first: loss, win, win, win, loss
    const matches = [
      match({ match_id: '1', player_a: ME, winner: 'PlayerB' }),
      match({ match_id: '2', player_a: ME, winner: 'PlayerA' }),
      match({ match_id: '3', player_a: ME, winner: 'PlayerA' }),
      match({ match_id: '4', player_a: ME, winner: 'PlayerA' }),
      match({ match_id: '5', player_a: ME, winner: 'PlayerB' }),
    ];
    expect(computeMatchStats(matches, ME).bestStreak).toBe(3);
  });
});
