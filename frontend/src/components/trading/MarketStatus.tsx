'use client';

import type { Winner } from '@/types/match';
import type { MarketPhase } from '@/types/trading';

interface MarketStatusProps {
  phase: MarketPhase;
  winner?: Winner | null;
  lockScore?: number | null;
}

export function MarketStatus({ phase, winner, lockScore }: MarketStatusProps) {
  if (phase === 'settled') {
    const label =
      winner === 'Draw' ? 'Draw'
      : winner === 'PlayerA' ? 'Player A Won'
      : winner === 'PlayerB' ? 'Player B Won'
      : 'Settled';
    return (
      <div className="flex items-center gap-2 rounded-lg border border-long/30 bg-long/8 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-long" />
        <span className="font-mono text-xs font-semibold text-long">
          Market Settled — {label}
        </span>
      </div>
    );
  }

  if (phase === 'locked') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-lock/40 bg-lock/8 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-lock" />
        <span className="font-mono text-xs font-semibold text-lock">
          Market Locked
          {lockScore !== null && lockScore !== undefined
            ? ` @ ${lockScore > 0 ? '+' : ''}${(lockScore / 100).toFixed(2)}`
            : ''}
        </span>
        <span className="ml-auto tag">awaiting result</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-long/20 bg-long/5 px-3 py-2">
      <span className="live-dot" />
      <span className="font-mono text-xs font-semibold text-long">
        Market Open
      </span>
      <span className="ml-auto tag">place your bet</span>
    </div>
  );
}
