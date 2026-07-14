'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { OpenMatches } from '@/components/lobby/OpenMatches';
import { LiveMatches } from '@/components/lobby/LiveMatches';
import { API_URL } from '@/lib/stellar';
import type { MatchRecord } from '@/types/match';

const POLL_INTERVAL_MS = 8_000;

export default function LobbyPage() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/matches`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setMatches(Array.isArray(data) ? data : data.matches ?? []);
      setError(null);
    } catch {
      setError('Relayer unreachable — showing cached data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMatches();
    const id = setInterval(() => void fetchMatches(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMatches]);

  const open = matches.filter((m) => m.status === 'open');
  const live = matches.filter((m) => m.status === 'active' || m.status === 'locked');

  return (
    <div className="pt-8 pb-16">
      {/* Hero */}
      <section className="mb-10 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-bone sm:text-5xl">
          Chess ×{' '}
          <span className="italic text-lock">DeFi</span>
        </h1>
        <p className="mx-auto mt-3 max-w-lg font-mono text-sm text-bone-faint">
          P2P chess betting with a live parimutuel prediction market.
          <br />USDC. Stellar Soroban Testnet.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/create" className="btn-primary">
            Create Match
          </Link>
          <Link href="/history" className="btn-ghost">
            History
          </Link>
        </div>
      </section>

      {/* Status / error banner */}
      {error && (
        <div className="mb-6 rounded-md border border-short/30 bg-short/8 px-4 py-2 text-center">
          <p className="font-mono text-xs text-short">{error}</p>
        </div>
      )}

      {/* Stats strip */}
      {!loading && (
        <div className="mb-8 flex justify-center gap-6 border-y border-edge py-3">
          <div className="text-center">
            <p className="font-mono text-xs text-bone-faint">Open</p>
            <p className="font-display text-xl font-semibold text-bone">{open.length}</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-xs text-bone-faint">Live</p>
            <p className="font-display text-xl font-semibold text-lock">{live.length}</p>
          </div>
          <div className="text-center">
            <p className="font-mono text-xs text-bone-faint">Total</p>
            <p className="font-display text-xl font-semibold text-bone">{matches.length}</p>
          </div>
        </div>
      )}

      {/* Match lists */}
      <div className="grid gap-8 lg:grid-cols-2">
        <OpenMatches matches={matches} loading={loading} />
        <LiveMatches matches={matches} loading={loading} />
      </div>
    </div>
  );
}
