'use client';

// Lets either match player open a dispute against a pending result, inside
// the on-chain challenge window. Player-signed (Freighter), same pattern as
// createMatch/placeTrade — the relayer never submits this on a player's
// behalf (contracts/settlement.dispute requires the disputer's own auth).

import { useState } from 'react';
import { dispute } from '@/lib/contracts';

interface DisputeButtonProps {
  matchId: string;
  walletAddress: string | null;
  disputeStatus: 'none' | 'submitted' | 'disputed' | 'finalized';
}

export function DisputeButton({ matchId, walletAddress, disputeStatus }: DisputeButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disputeStatus === 'disputed') {
    return <p className="font-mono text-xs text-lock">Dispute opened — awaiting arbiter review.</p>;
  }
  if (disputeStatus !== 'submitted' || !walletAddress) return null;

  const submit = async () => {
    if (!reason.trim()) {
      setError('Give the arbiter a reason.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await dispute(matchId, walletAddress, reason.trim());
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit dispute.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost text-xs text-short">
        Dispute this match
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-short/30 bg-short/8 p-3 text-left">
      <p className="tag text-short">Dispute reason</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. suspected engine assistance, describe what you observed…"
        className="w-full rounded-md border border-edge bg-ink-raise px-2 py-1.5 font-mono text-xs text-bone"
        rows={3}
      />
      {error && <p className="font-mono text-xs text-short">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-ghost flex-1 text-xs"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          className="btn-primary flex-1 text-xs"
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit dispute'}
        </button>
      </div>
    </div>
  );
}
