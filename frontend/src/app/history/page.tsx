'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { shortAddress, txExplorerUrl } from '@/lib/stellar';
import { stroopsToUsdc } from '@/lib/usdc';
import { API_URL } from '@/lib/stellar';
import { Badge } from '@/components/shared/Badge';
import type { MatchRecord, Winner } from '@/types/match';

const WINNER_LABEL: Record<Winner, string> = {
  PlayerA: 'Player A',
  PlayerB: 'Player B',
  Draw: 'Draw',
};

const WINNER_COLOR: Record<Winner, string> = {
  PlayerA: 'text-long',
  PlayerB: 'text-short',
  Draw: 'text-draw',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function HistoryPage() {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const fetchHistory = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const url = `${API_URL}/history?limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const rows: MatchRecord[] = Array.isArray(data) ? data : data.matches ?? [];
      setMatches(rows);
      setError(null);
    } catch {
      setError('Relayer unreachable — history unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory(page * PAGE_SIZE);
  }, [fetchHistory, page]);

  return (
    <div className="pt-8 pb-20">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-bone">Match History</h1>
          <p className="mt-1 font-mono text-sm text-bone-faint">
            Completed games on Stellar Testnet
          </p>
        </div>
        <Link href="/" className="btn-ghost">
          ← Lobby
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-short/30 bg-short/8 px-4 py-2">
          <p className="font-mono text-xs text-short">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="panel p-10 text-center">
          <p className="font-mono text-sm text-bone-faint">No completed matches yet.</p>
          <Link href="/create" className="btn-primary mt-4 inline-block">
            Create the first match
          </Link>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="panel overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint">#</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint">Players</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint hidden sm:table-cell">Bet</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint">Winner</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint">Settlement Tx</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint hidden md:table-cell">Duration</th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-bone-faint hidden lg:table-cell">Date</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr
                    key={m.match_id}
                    className="border-b border-edge/50 transition-colors hover:bg-panel-2"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-bone-faint">
                      {page * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="text-bone">{shortAddress(m.player_a)}</span>
                        <span className="text-bone-faint/50">vs</span>
                        <span className="text-bone-dim">{m.player_b ? shortAddress(m.player_b) : '?'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-bone-dim hidden sm:table-cell">
                      {stroopsToUsdc(m.bet_amount).toFixed(0)} USDC
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {m.winner ? (
                          <span className={`font-mono text-xs font-medium ${WINNER_COLOR[m.winner]}`}>
                            {WINNER_LABEL[m.winner]}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-bone-faint">—</span>
                        )}
                        {m.flagged && (
                          <Badge tone="danger" title="Move-match rate against Stockfish crossed the suspicion threshold">
                            ⚠
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.settlement_tx_hash ? (
                        <a
                          href={txExplorerUrl(m.settlement_tx_hash) ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={m.settlement_tx_hash}
                          className="font-mono text-xs text-lock hover:underline"
                        >
                          {shortAddress(m.settlement_tx_hash, 6)} ↗
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-bone-faint" title="Settlement not yet recorded on-chain">
                          pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-bone-faint hidden md:table-cell">
                      {formatDuration(m.started_at, m.completed_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-bone-faint hidden lg:table-cell">
                      {formatDate(m.completed_at ?? m.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/match/${m.match_id}`}
                        className="font-mono text-[10px] text-bone-faint hover:text-bone transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="font-mono text-xs text-bone-faint">Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={matches.length < PAGE_SIZE}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
