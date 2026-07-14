'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { stroopsToUsdc } from '@/lib/usdc';
import { shortAddress, txExplorerUrl } from '@/lib/stellar';
import type { Winner, MatchRecord } from '@/types/match';

interface SettlementModalProps {
  winner: Winner;
  reason: string | null;
  record: MatchRecord | null;
  playerPrize?: number;
  netPool?: number;
  txHash?: string | null;
}

const WINNER_CONFIG: Record<Winner, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  PlayerA: { label: 'Player A Wins!', emoji: '🏆', color: 'text-long', bg: 'bg-long/8', border: 'border-long/30' },
  PlayerB: { label: 'Player B Wins!', emoji: '🏆', color: 'text-short', bg: 'bg-short/8', border: 'border-short/30' },
  Draw: { label: 'Draw', emoji: '🤝', color: 'text-draw', bg: 'bg-draw/8', border: 'border-draw/30' },
};

export function SettlementModal({ winner, reason, record, playerPrize, netPool, txHash }: SettlementModalProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  const cfg = WINNER_CONFIG[winner];
  const winnerAddr = winner === 'PlayerA' ? record?.player_a
    : winner === 'PlayerB' ? record?.player_b
    : null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" />

      {/* Card */}
      <div className={`relative w-full max-w-md animate-rise-in rounded-xl border ${cfg.border} ${cfg.bg} p-6 shadow-panel`}>
        <div className="text-center space-y-4">
          <div className="text-5xl">{cfg.emoji}</div>

          <div>
            <h2 className={`font-display text-2xl font-semibold ${cfg.color}`}>
              {cfg.label}
            </h2>
            {reason && (
              <p className="mt-1 font-mono text-xs text-bone-faint capitalize">{reason}</p>
            )}
          </div>

          {winnerAddr && (
            <div className="rounded-md border border-edge bg-ink-raise px-3 py-2 text-center">
              <p className="tag mb-1">Winner</p>
              <p className="font-mono text-sm text-bone">{shortAddress(winnerAddr, 8)}</p>
            </div>
          )}

          {/* Prize breakdown */}
          {playerPrize !== undefined && playerPrize > 0 && (
            <div className="space-y-1.5 rounded-md border border-edge bg-ink-raise p-3 text-left">
              <div className="flex justify-between">
                <span className="tag">Player prize</span>
                <span className="font-mono text-xs text-bone">
                  {stroopsToUsdc(playerPrize).toFixed(2)} USDC
                </span>
              </div>
              {netPool !== undefined && netPool > 0 && (
                <div className="flex justify-between">
                  <span className="tag">Trader pool distributed</span>
                  <span className="font-mono text-xs text-bone-dim">
                    {stroopsToUsdc(netPool).toFixed(2)} USDC
                  </span>
                </div>
              )}
            </div>
          )}

          {winner === 'Draw' && (
            <p className="font-mono text-xs text-bone-faint">
              Both players receive their deposits back.
              <br />Draw traders split the prediction pool.
            </p>
          )}

          {/* On-chain settlement transaction */}
          {txHash && (
            <div className="rounded-md border border-edge bg-ink-raise px-3 py-2 text-center">
              <p className="tag mb-1">Settlement Tx</p>
              <a
                href={txExplorerUrl(txHash) ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                title={txHash}
                className="font-mono text-xs text-lock hover:underline"
              >
                {shortAddress(txHash, 8)} ↗
              </a>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Link href="/" className="btn-ghost flex-1 text-center">
              Back to Lobby
            </Link>
            <Link href="/history" className="btn-primary flex-1 text-center">
              View History
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
