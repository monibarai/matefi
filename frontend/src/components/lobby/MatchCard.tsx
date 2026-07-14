'use client';

import Link from 'next/link';
import { shortAddress } from '@/lib/stellar';
import { stroopsToUsdc } from '@/lib/usdc';
import type { MatchRecord } from '@/types/match';

interface MatchCardProps {
  match: MatchRecord;
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  open:      { label: 'Open', color: 'text-long border-long/30 bg-long/8' },
  active:    { label: 'Live', color: 'text-lock border-lock/30 bg-lock/8' },
  locked:    { label: 'Locked', color: 'text-lock border-lock/30 bg-lock/8' },
  completed: { label: 'Finished', color: 'text-bone-faint border-edge bg-ink-raise' },
  cancelled: { label: 'Cancelled', color: 'text-short border-short/30 bg-short/8' },
};

function formatTimeControl(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
}

export function MatchCard({ match }: MatchCardProps) {
  const badge = STATUS_BADGE[match.status] ?? STATUS_BADGE.open;
  const betUsdc = stroopsToUsdc(match.bet_amount);
  const traders = Number(match.trader_count ?? 0);
  const isLive = match.status === 'active' || match.status === 'locked';

  return (
    <Link
      href={`/match/${match.match_id}`}
      className="panel block p-4 transition-all duration-150 hover:border-edge-bright hover:bg-panel-2 animate-rise-in"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Players */}
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-xs text-bone">{shortAddress(match.player_a)}</span>
            <span className="tag">vs</span>
            <span className="font-mono text-xs text-bone-dim">
              {match.player_b ? shortAddress(match.player_b) : '?'}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="tag">Bet</span>
              <span className="font-mono text-sm font-semibold text-bone">
                {betUsdc.toFixed(0)}
                <span className="ml-0.5 text-xs text-bone-faint">USDC</span>
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="tag">Time</span>
              <span className="font-mono text-xs text-bone-dim">
                {formatTimeControl(match.time_control)}
              </span>
            </div>

            {traders > 0 && (
              <div className="flex items-center gap-1">
                <span className="tag">Traders</span>
                <span className="font-mono text-xs text-lock">{traders}</span>
              </div>
            )}

            {match.winner && (
              <div className="flex items-center gap-1">
                <span className="tag">Winner</span>
                <span className={`font-mono text-xs ${match.winner === 'Draw' ? 'text-draw' : 'text-long'}`}>
                  {match.winner === 'Draw' ? 'Draw' : match.winner === 'PlayerA' ? 'Player A' : 'Player B'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider flex items-center gap-1.5 ${badge.color}`}>
            {isLive && <span className="live-dot" />}
            {badge.label}
          </span>

          <span className="tag text-bone-faint/60">
            #{match.match_id}
          </span>
        </div>
      </div>
    </Link>
  );
}
