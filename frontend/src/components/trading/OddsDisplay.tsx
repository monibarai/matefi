'use client';

import { impliedProbability } from '@/hooks/useTrading';

interface OddsDisplayProps {
  oddsA: number;
  oddsB: number;
  oddsDraw: number;
  poolA: number;
  poolB: number;
  poolDraw: number;
  playerAName: string;
  playerBName: string;
}

function OddsCell({
  label,
  odds,
  prob,
  textClass,
}: {
  label: string;
  odds: number;
  prob: number;
  textClass: string;
}) {
  const multiplier = odds > 0 ? (odds / 100).toFixed(2) : '—';
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-edge bg-ink-raise px-3 py-2.5">
      <span className="tag">{label}</span>
      <span className={`font-mono text-lg font-bold ${textClass}`}>
        {multiplier}x
      </span>
      <span className="font-mono text-[11px] text-bone-faint">
        {odds > 0 ? `${prob.toFixed(1)}%` : '—'}
      </span>
    </div>
  );
}

export function OddsDisplay({
  oddsA, oddsB, oddsDraw,
  poolA, poolB, poolDraw,
  playerAName, playerBName,
}: OddsDisplayProps) {
  const total = poolA + poolB + poolDraw;
  return (
    <div>
      <p className="tag mb-2">Implied Odds</p>
      <div className="grid grid-cols-3 gap-2">
        <OddsCell
          label={playerAName}
          odds={oddsA}
          prob={impliedProbability(poolA, total)}
          textClass="text-long"
        />
        <OddsCell
          label="Draw"
          odds={oddsDraw}
          prob={impliedProbability(poolDraw, total)}
          textClass="text-draw"
        />
        <OddsCell
          label={playerBName}
          odds={oddsB}
          prob={impliedProbability(poolB, total)}
          textClass="text-short"
        />
      </div>
    </div>
  );
}
