// src/db/queries/disputeState.ts — tracks the Settlement dispute lifecycle
// (submitted → pending → disputed/finalized) so the dispute-window keeper and
// the frontend can read state without hitting Soroban RPC directly.
import { collection } from '../client';

interface StringIdDoc {
  _id: string;
  [key: string]: unknown;
}

export type DisputeStateStatus = 'pending' | 'disputed' | 'finalized';

export interface DisputeStateRow {
  match_id: string;
  winner: string; // originally submitted winner
  submitted_at: Date;
  window_secs: number;
  status: DisputeStateStatus;
  opened_by: string | null;
  reason: string | null;
  opened_at: Date | null;
  final_winner: string | null;
}

function strip<T>(doc: Record<string, unknown> | null): T | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  void _id;
  return rest as T;
}

/** Written when `ResultSubmitted` is observed — starts the challenge window. */
export async function upsertSubmitted(params: {
  matchId: string;
  winner: string;
  submittedAt: Date;
  windowSecs: number;
}): Promise<void> {
  const col = await collection<StringIdDoc>('dispute_state');
  await col.updateOne(
    { _id: params.matchId },
    {
      $set: {
        match_id: params.matchId,
        winner: params.winner,
        submitted_at: params.submittedAt,
        window_secs: params.windowSecs,
        status: 'pending',
        opened_by: null,
        reason: null,
        opened_at: null,
        final_winner: null,
      },
    },
    { upsert: true }
  );
}

/** Written when `DisputeOpened` is observed. */
export async function markDisputed(params: {
  matchId: string;
  openedBy: string;
  reason: string;
  openedAt: Date;
}): Promise<void> {
  const col = await collection<StringIdDoc>('dispute_state');
  await col.updateOne(
    { _id: params.matchId },
    {
      $set: {
        status: 'disputed',
        opened_by: params.openedBy,
        reason: params.reason,
        opened_at: params.openedAt,
      },
    }
  );
}

/** Written when `MatchSettled` is observed (covers both the plain-finalize and resolve-dispute paths). */
export async function markFinalized(matchId: string, finalWinner: string): Promise<void> {
  const col = await collection<StringIdDoc>('dispute_state');
  await col.updateOne(
    { _id: matchId },
    { $set: { status: 'finalized', final_winner: finalWinner } }
  );
}

export async function getDisputeState(matchId: string): Promise<DisputeStateRow | null> {
  const col = await collection<StringIdDoc>('dispute_state');
  const doc = await col.findOne({ _id: matchId });
  return strip<DisputeStateRow>(doc as Record<string, unknown> | null);
}

/** All dispute-state rows with the given status, most recently opened first. */
export async function listByStatus(status: DisputeStateStatus): Promise<DisputeStateRow[]> {
  const col = await collection<StringIdDoc>('dispute_state');
  const rows = await col
    .find({ status }, { projection: { _id: 0 } })
    .sort({ opened_at: -1, submitted_at: -1 })
    .toArray();
  return rows as unknown as DisputeStateRow[];
}

/** Match ids still `pending` whose challenge window has already elapsed — due for `Settlement.finalize`. */
export async function listPendingPastWindow(now: Date): Promise<string[]> {
  const col = await collection<StringIdDoc>('dispute_state');
  const rows = await col
    .find(
      { status: 'pending' },
      { projection: { match_id: 1, submitted_at: 1, window_secs: 1, _id: 0 } }
    )
    .toArray();
  return rows
    .filter((r) => {
      const submittedAt = r.submitted_at as Date;
      const windowSecs = r.window_secs as number;
      return submittedAt.getTime() + windowSecs * 1000 <= now.getTime();
    })
    .map((r) => r.match_id as string);
}
