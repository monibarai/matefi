'use client';

// Arbiter-only dispute resolution. Gated by comparing the connected wallet
// against NEXT_PUBLIC_ARBITER_ADDRESS — the same address stored on-chain in
// Settlement at initialize (contracts/settlement). Resolution calls are
// player/arbiter-signed via Freighter (lib/contracts.resolveDispute), same
// pattern as every other write path in this app.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/hooks/useWallet';
import { shortAddress, API_URL } from '@/lib/stellar';
import { resolveDispute } from '@/lib/contracts';
import type { DisputeStateRow, AntiCheatDetail, Winner } from '@/types/anticheat';

const ARBITER_ADDRESS = process.env.NEXT_PUBLIC_ARBITER_ADDRESS ?? '';

function DisputeRow({ dispute }: { dispute: DisputeStateRow }) {
  const { address } = useWallet();
  const [evidence, setEvidence] = useState<AntiCheatDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${API_URL}/match/${dispute.match_id}/anticheat`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEvidence(d))
      .catch(() => setEvidence(null));
  }, [dispute.match_id]);

  const resolve = async (outcome: 'Uphold' | 'Void' | Winner) => {
    if (!address) return;
    setBusy(outcome);
    setError(null);
    try {
      if (outcome === 'Uphold') {
        await resolveDispute(dispute.match_id, address, { tag: 'Uphold' });
      } else if (outcome === 'Void') {
        await resolveDispute(dispute.match_id, address, { tag: 'Void' });
      } else {
        await resolveDispute(dispute.match_id, address, { tag: 'Reverse', winner: outcome });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resolution failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-center justify-between">
        <Link href={`/match/${dispute.match_id}`} className="font-mono text-sm text-bone hover:underline">
          Match #{dispute.match_id} →
        </Link>
        <span className="tag">submitted winner: {dispute.winner}</span>
      </div>

      <div className="rounded-md border border-edge bg-ink-raise p-3 text-xs">
        <p className="tag mb-1">Opened by</p>
        <p className="font-mono text-bone">{dispute.opened_by ? shortAddress(dispute.opened_by, 8) : '—'}</p>
        {dispute.reason && (
          <>
            <p className="tag mb-1 mt-2">Reason</p>
            <p className="font-mono text-bone-dim">{dispute.reason}</p>
          </>
        )}
      </div>

      {evidence && evidence.suspicions.length > 0 && (
        <div className="rounded-md border border-short/30 bg-short/8 p-3 text-xs">
          <p className="tag mb-1 text-short">Anti-cheat evidence</p>
          {evidence.suspicions.map((s) => (
            <p key={s.player} className="font-mono text-bone-dim">
              {shortAddress(s.player)}: {(s.matchRate * 100).toFixed(0)}% engine match over {s.movesAnalyzed} moves
            </p>
          ))}
        </div>
      )}

      {error && <p className="font-mono text-xs text-short">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void resolve('Uphold')}
          disabled={busy !== null}
          className="btn-primary text-xs"
        >
          {busy === 'Uphold' ? 'Submitting…' : 'Uphold original result'}
        </button>
        <button
          type="button"
          onClick={() => void resolve('PlayerA')}
          disabled={busy !== null}
          className="btn-ghost text-xs"
        >
          Reverse → Player A
        </button>
        <button
          type="button"
          onClick={() => void resolve('PlayerB')}
          disabled={busy !== null}
          className="btn-ghost text-xs"
        >
          Reverse → Player B
        </button>
        <button
          type="button"
          onClick={() => void resolve('Void')}
          disabled={busy !== null}
          className="btn-ghost text-xs text-short"
        >
          Void (refund both)
        </button>
      </div>
    </div>
  );
}

export default function AdminDisputesPage() {
  const { address, connect, connecting } = useWallet();
  const [disputes, setDisputes] = useState<DisputeStateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/disputes?status=disputed`, { cache: 'no-store' });
      setDisputes(res.ok ? await res.json() : []);
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isArbiter = ARBITER_ADDRESS !== '' && address === ARBITER_ADDRESS;

  return (
    <div className="pt-8 pb-20">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-bone">Dispute Resolution</h1>
        <p className="mt-1 font-mono text-sm text-bone-faint">Arbiter-only. Reviews matches currently Disputed on-chain.</p>
      </div>

      {!address ? (
        <div className="panel p-8 text-center">
          <p className="mb-3 font-mono text-sm text-bone-faint">Connect the arbiter wallet to continue.</p>
          <button onClick={() => void connect()} disabled={connecting} className="btn-primary">
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        </div>
      ) : !isArbiter ? (
        <div className="panel p-8 text-center">
          <p className="font-mono text-sm text-short">
            Connected wallet {shortAddress(address)} is not the configured arbiter.
          </p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-lg" />
          ))}
        </div>
      ) : disputes.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="font-mono text-sm text-bone-faint">No open disputes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d) => (
            <DisputeRow key={d.match_id} dispute={d} />
          ))}
        </div>
      )}
    </div>
  );
}
