'use client';

import { MatchCard } from './MatchCard';
import type { MatchRecord } from '@/types/match';

interface LiveMatchesProps {
  matches: MatchRecord[];
  loading: boolean;
}

export function LiveMatches({ matches, loading }: LiveMatchesProps) {
  const live = matches.filter((m) => m.status === 'active' || m.status === 'locked');

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold text-bone">Live Matches</h2>
        {live.length > 0 && <span className="live-dot" />}
        <span className="rounded-full border border-edge bg-panel px-2 py-0.5 font-mono text-[10px] text-bone-faint">
          {live.length}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      ) : live.length === 0 ? (
        <div className="panel p-6 text-center">
          <p className="font-mono text-sm text-bone-faint">
            No active matches right now.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {live.map((m) => (
            <MatchCard key={m.match_id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}
