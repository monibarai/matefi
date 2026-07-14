'use client';

import { stroopsToUsdc } from '@/lib/usdc';

interface PrizePoolProps {
  betAmount: string | number;
  poolA: number;
  poolB: number;
  poolDraw: number;
}

export function PrizePool({ betAmount, poolA, poolB, poolDraw }: PrizePoolProps) {
  const playerDeposits = stroopsToUsdc(betAmount) * 2;
  const tradingVolume = stroopsToUsdc(poolA + poolB + poolDraw);
  const flywheelBonus = tradingVolume * 0.02;
  const grossPrize = playerDeposits + flywheelBonus;
  const protocolFee = grossPrize * 0.03;
  const winnerPrize = grossPrize - protocolFee;

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="tag">Prize Pool</p>
        <span className="font-mono text-xs text-long">
          Live estimate
        </span>
      </div>

      <div className="text-center py-1">
        <span className="font-display text-3xl font-semibold text-bone">
          {winnerPrize.toFixed(2)}
        </span>
        <span className="ml-1.5 font-mono text-sm text-bone-faint">USDC</span>
      </div>

      <div className="space-y-1.5 border-t border-edge pt-2">
        <div className="flex justify-between">
          <span className="tag">Player deposits</span>
          <span className="font-mono text-xs text-bone-dim">{playerDeposits.toFixed(2)} USDC</span>
        </div>
        {flywheelBonus > 0 && (
          <div className="flex justify-between">
            <span className="tag text-lock/70">Trading flywheel</span>
            <span className="font-mono text-xs text-lock">+{flywheelBonus.toFixed(2)} USDC</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="tag">Protocol fee (3%)</span>
          <span className="font-mono text-xs text-bone-faint">−{protocolFee.toFixed(2)} USDC</span>
        </div>
      </div>
    </div>
  );
}
