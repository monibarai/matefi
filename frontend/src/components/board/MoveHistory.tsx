'use client';

import { useEffect, useRef } from 'react';
import { uciHistoryToSanRows } from '@/lib/chess';

interface MoveHistoryProps {
  moves: string[];
  matchStatus?: string;
  currentMoveIndex?: number;
}

export function MoveHistory({ moves, matchStatus, currentMoveIndex }: MoveHistoryProps) {
  const rows = uciHistoryToSanRows(moves);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length]);

  if (rows.length === 0) {
    const emptyMsg =
      matchStatus === 'open'
        ? 'Waiting for opponent to join…'
        : matchStatus === 'active' || matchStatus === 'locked'
        ? 'Game is live — make the first move!'
        : 'No moves yet';
    return (
      <div className="panel p-3">
        <p className="tag mb-2">Moves</p>
        <p className="font-mono text-xs text-bone-faint">{emptyMsg}</p>
      </div>
    );
  }

  return (
    <div className="panel p-3">
      <p className="tag mb-2">Moves</p>
      <div
        ref={scrollRef}
        className="max-h-40 overflow-y-auto font-mono text-xs"
      >
        {rows.map((row) => {
          const whiteIdx = (row.number - 1) * 2;
          const blackIdx = whiteIdx + 1;
          const isCurrentWhite = currentMoveIndex === whiteIdx;
          const isCurrentBlack = currentMoveIndex === blackIdx;
          return (
            <div key={row.number} className="flex items-baseline gap-2 py-0.5 hover:bg-panel-2 px-1 rounded">
              <span className="w-6 text-right text-bone-faint">{row.number}.</span>
              <span className={`flex-1 ${isCurrentWhite ? 'text-lock font-semibold' : 'text-bone-dim'}`}>
                {row.white ?? ''}
              </span>
              <span className={`flex-1 ${isCurrentBlack ? 'text-lock font-semibold' : 'text-bone-dim'}`}>
                {row.black ?? ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
