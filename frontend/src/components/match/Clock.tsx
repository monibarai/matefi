'use client';

import { useEffect, useState } from 'react';

interface ClockProps {
  /** Authoritative ms remaining for this side at `updatedAt`. */
  ms: number | null;
  /** True when this side's clock is the one currently counting down. */
  active: boolean;
  /** Client timestamp (Date.now()) when `ms` was last authoritative. */
  updatedAt: number;
  /** Whether the game clock is running at all (false once the game is over). */
  running: boolean;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * A single player's chess clock. When `active` + `running`, it ticks down
 * locally (re-rendering a few times a second) from the last authoritative
 * value; otherwise it shows a frozen time.
 */
export function Clock({ ms, active, updatedAt, running }: ClockProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active, running, updatedAt]);

  if (ms === null) {
    return (
      <span className="font-mono text-sm tabular-nums text-bone-faint">--:--</span>
    );
  }

  const display = active && running ? Math.max(0, ms - (now - updatedAt)) : ms;
  const low = display <= 30_000; // under 30s — urgency styling
  const flagged = display <= 0;

  return (
    <span
      className={`font-mono text-sm font-semibold tabular-nums tracking-tight transition-colors ${
        flagged
          ? 'text-short'
          : active && running
          ? low
            ? 'text-short animate-pulse'
            : 'text-bone'
          : 'text-bone-dim'
      }`}
    >
      {formatClock(display)}
    </span>
  );
}
