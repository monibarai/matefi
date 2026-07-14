'use client';

import { shortAddress } from '@/lib/stellar';
import { stroopsToUsdc } from '@/lib/usdc';
import { Clock } from './Clock';

export { shortAddress };

interface PlayerInfoProps {
  playerA: string;
  playerB: string | null;
  playerAColor: 'white' | 'black';
  betAmount: string | number;
  status: string;
  turn: 'w' | 'b';
  /** Live clock state (ms remaining + client anchor). */
  whiteMs?: number | null;
  blackMs?: number | null;
  clockUpdatedAt?: number;
  clockRunning?: boolean;
}

export function PlayerInfo({
  playerA,
  playerB,
  playerAColor,
  betAmount,
  status,
  turn,
  whiteMs = null,
  blackMs = null,
  clockUpdatedAt = 0,
  clockRunning = false,
}: PlayerInfoProps) {
  const betUsdc = stroopsToUsdc(betAmount);
  const isPlayerBWhite = playerAColor === 'black';
  // Clock figures for each player based on the colour they hold.
  const aMs = isPlayerBWhite ? blackMs : whiteMs;
  const bMs = isPlayerBWhite ? whiteMs : blackMs;

  const colorSymbol = (color: 'white' | 'black') => (
    <span className={`text-base ${color === 'white' ? 'text-bone' : 'text-bone-faint'}`}>
      {color === 'white' ? '♔' : '♚'}
    </span>
  );

  const isPlayerAWhite = playerAColor === 'white';
  // The game is in progress while the clock is running (covers both 'active'
  // and 'locked' status — only the market locks at |eval| ≥ 250, not the game).
  const gameLive = clockRunning && playerB !== null;
  const aIsOnMove = gameLive && (
    (isPlayerAWhite && turn === 'w') || (!isPlayerAWhite && turn === 'b')
  );
  const bIsOnMove = gameLive && !aIsOnMove;

  return (
    <div className="panel p-3">
      <div className="flex items-center gap-3">
        {/* Player A */}
        <div className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${aIsOnMove ? 'bg-lock/10 ring-1 ring-lock/30' : ''}`}>
          {colorSymbol(playerAColor)}
          <div className="min-w-0">
            <p className="tag mb-0.5">Player A</p>
            <p className="truncate font-mono text-xs text-bone-dim">
              {shortAddress(playerA)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {aIsOnMove && <span className="live-dot" />}
            <Clock ms={aMs} active={aIsOnMove} updatedAt={clockUpdatedAt} running={clockRunning} />
          </div>
        </div>

        {/* Center — bet info */}
        <div className="flex flex-col items-center gap-0.5 px-2 shrink-0">
          <span className="tag">vs</span>
          <span className="font-mono text-sm font-semibold text-bone">
            {betUsdc.toFixed(0)}
            <span className="ml-0.5 text-bone-faint text-xs">USDC</span>
          </span>
        </div>

        {/* Player B */}
        <div className={`flex flex-1 flex-row-reverse items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${bIsOnMove ? 'bg-lock/10 ring-1 ring-lock/30' : ''}`}>
          {colorSymbol(playerAColor === 'white' ? 'black' : 'white')}
          <div className="min-w-0 text-right">
            <p className="tag mb-0.5">Player B</p>
            <p className="truncate font-mono text-xs text-bone-dim">
              {playerB ? shortAddress(playerB) : <span className="text-bone-faint">Waiting…</span>}
            </p>
          </div>
          <div className="mr-auto flex items-center gap-1.5">
            <Clock ms={bMs} active={bIsOnMove} updatedAt={clockUpdatedAt} running={clockRunning} />
            {bIsOnMove && <span className="live-dot" />}
          </div>
        </div>
      </div>
    </div>
  );
}
