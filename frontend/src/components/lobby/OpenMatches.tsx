'use client';

import { MatchCard } from './MatchCard';
import type { MatchRecord } from '@/types/match';

interface OpenMatchesProps {
  matches: MatchRecord[];
  loading: boolean;
}

export function OpenMatches({ matches, loading }: OpenMatchesProps) {
  const open = matches.filter((m) => m.status === 'open');

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-lg font-semibold text-bone">Open Matches</h2>
        <span className="rounded-full border border-edge bg-panel px-2 py-0.5 font-mono text-[10px] text-bone-faint">
          {open.length}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <div className="panel p-6 text-center">
          <p className="font-mono text-sm text-bone-faint">
            No open matches — be the first to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {open.map((m) => (
            <MatchCard key={m.match_id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}
