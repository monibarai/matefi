'use client';

import { cpToDisplay } from '@/lib/chess';

interface EvalBarProps {
  score: number | null;
  depth: number;
  mate: number | null;
  locked: boolean;
  lockScore: number | null;
}

export function EvalBar({ score, depth, mate, locked, lockScore }: EvalBarProps) {
  const clamped = Math.max(-800, Math.min(800, score ?? 0));
  const whitePercent = 50 + (clamped / 800) * 50;

  const display = mate !== null
    ? mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`
    : score === null ? '—' : cpToDisplay(score);

  const scoreColor =
    score === null ? 'text-bone-faint'
    : score > 50 ? 'text-bone'
    : score < -50 ? 'text-bone-faint'
    : 'text-bone-dim';

  return (
    <div className="panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="tag">Eval</span>
          <span className={`font-mono text-sm font-semibold ${scoreColor}`}>
            {display}
          </span>
          {depth > 0 && (
            <span className="tag">d{depth}</span>
          )}
        </div>
        {locked && (
          <span className="flex items-center gap-1 rounded-full border border-lock/30 bg-lock/10 px-2 py-0.5 font-mono text-[10px] text-lock">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-lock" />
            Locked {lockScore !== null ? `@ ${cpToDisplay(lockScore)}` : ''}
          </span>
        )}
      </div>

      {/* Bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-bone/10">
        {/* White advantage fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-bone transition-all duration-500 ease-out"
          style={{ width: `${whitePercent}%` }}
        />
        {/* Center line */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-edge-bright" />
        {/* Lock threshold markers ±250 cp */}
        <div
          className="absolute top-0 h-full w-px bg-lock/50"
          style={{ left: `${50 + (250 / 800) * 50}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-lock/50"
          style={{ left: `${50 - (250 / 800) * 50}%` }}
        />
      </div>

      <div className="flex justify-between">
        <span className="tag text-bone-faint/60">Black</span>
        <span className="tag text-bone-faint/60">±2.5 lock</span>
        <span className="tag text-bone-faint/60">White</span>
      </div>
    </div>
  );
}
