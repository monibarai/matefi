'use client';

import { MarketStatus } from './MarketStatus';
import { PoolBars } from './PoolBars';
import { OddsDisplay } from './OddsDisplay';
import { BetForm } from './BetForm';
import { formatUsdc } from '@/lib/usdc';
import type { Winner } from '@/types/match';
import type { MarketPhase } from '@/types/trading';

interface TradingPanelProps {
  matchId: string;
  playerAName: string;
  playerBName: string;
  poolA: number;
  poolB: number;
  poolDraw: number;
  oddsA: number;
  oddsB: number;
  oddsDraw: number;
  phase: MarketPhase;
  winner: Winner | null;
  lockEvalScore: number | null;
  walletAddress: string | null;
}

export function TradingPanel({
  matchId,
  playerAName,
  playerBName,
  poolA, poolB, poolDraw,
  oddsA, oddsB, oddsDraw,
  phase,
  winner,
  lockEvalScore,
  walletAddress,
}: TradingPanelProps) {
  const total = poolA + poolB + poolDraw;

  return (
    <div className="flex flex-col gap-4">
      <MarketStatus
        phase={phase}
        winner={winner}
        lockScore={lockEvalScore}
      />

      {/* Pool summary */}
      <div className="panel p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="tag">Prediction Market</p>
          <span className="font-mono text-xs text-bone-dim">
            {formatUsdc(total)} USDC total
          </span>
        </div>
        <PoolBars
          poolA={poolA}
          poolB={poolB}
          poolDraw={poolDraw}
          playerAName={playerAName}
          playerBName={playerBName}
        />
      </div>

      {/* Odds */}
      <div className="panel p-4">
        <OddsDisplay
          oddsA={oddsA}
          oddsB={oddsB}
          oddsDraw={oddsDraw}
          poolA={poolA}
          poolB={poolB}
          poolDraw={poolDraw}
          playerAName={playerAName}
          playerBName={playerBName}
        />
      </div>

      {/* Bet form */}
      {phase === 'open' && (
        <div className="panel p-4">
          {walletAddress ? (
            <BetForm
              matchId={matchId}
              playerAName={playerAName}
              playerBName={playerBName}
            />
          ) : (
            <p className="font-mono text-xs text-bone-faint text-center py-2">
              Connect a wallet to place a trade
            </p>
          )}
        </div>
      )}

      {phase === 'locked' && (
        <div className="rounded-lg border border-lock/20 bg-lock/5 p-3 text-center">
          <p className="font-mono text-xs text-lock">
            No new bets — market is locked. Awaiting game result.
          </p>
        </div>
      )}
    </div>
  );
}
