'use client';

import { formatUsdc } from '@/lib/usdc';

interface PoolBarsProps {
  poolA: number;
  poolB: number;
  poolDraw: number;
  playerAName: string;
  playerBName: string;
}

export function PoolBars({ poolA, poolB, poolDraw, playerAName, playerBName }: PoolBarsProps) {
  const total = poolA + poolB + poolDraw;

  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 33.33);
  const pctA = pct(poolA);
  const pctB = pct(poolB);
  const pctD = pct(poolDraw);

  const bars = [
    { label: playerAName, pct: pctA, amount: poolA, color: 'bg-long', text: 'text-long', border: 'border-long/30' },
    { label: playerBName, pct: pctB, amount: poolB, color: 'bg-short', text: 'text-short', border: 'border-short/30' },
    { label: 'Draw', pct: pctD, amount: poolDraw, color: 'bg-draw', text: 'text-draw', border: 'border-draw/30' },
  ];

  return (
    <div className="space-y-2.5">
      {bars.map((bar) => (
        <div key={bar.label}>
          <div className="mb-1 flex items-center justify-between">
            <span className={`font-mono text-xs font-medium ${bar.text}`}>
              {bar.label}
            </span>
            <span className="font-mono text-xs text-bone-dim">
              {formatUsdc(bar.amount)} USDC
              <span className="ml-1.5 text-bone-faint">
                ({bar.pct.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
            <div
              className={`h-full rounded-full ${bar.color} transition-all duration-500 ease-out`}
              style={{ width: `${bar.pct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
