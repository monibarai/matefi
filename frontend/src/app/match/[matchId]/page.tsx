'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMatch } from '@/hooks/useMatch';
import { useAntiCheat } from '@/hooks/useAntiCheat';
import { useWallet } from '@/hooks/useWallet';
import { shortAddress } from '@/lib/stellar';
import { stroopsToUsdc } from '@/lib/usdc';
import { ChessBoardComponent } from '@/components/board/ChessBoard';
import { EvalBar } from '@/components/board/EvalBar';
import { MoveHistory } from '@/components/board/MoveHistory';
import { TradingPanel } from '@/components/trading/TradingPanel';
import { PlayerInfo } from '@/components/match/PlayerInfo';
import { PrizePool } from '@/components/match/PrizePool';
import { SettlementModal } from '@/components/match/SettlementModal';
import { Badge } from '@/components/shared/Badge';
import { API_URL } from '@/lib/stellar';

interface PageProps {
  params: { matchId: string };
}

export default function MatchPage({ params }: PageProps) {
  const { matchId } = params;
  const { address } = useWallet();
  const { record, live, loading, error, wsStatus } = useMatch(matchId);
  const { live: antiCheat } = useAntiCheat(matchId);
  const isFlagged = antiCheat.flaggedPlayers.size > 0;

  // Open match with no second player yet = still in matchmaking.
  const waiting = record?.status === 'open' && !record.player_b;

  // Determine which side this visitor plays (null = spectator / trader)
  const playerColor = record
    ? address === record.player_a
      ? record.player_a_color
      : address === record.player_b
      ? record.player_a_color === 'white' ? 'black' : 'white'
      : null
    : null;

  // True when the connected wallet is one of the two players in this match.
  const isPlayer = playerColor !== null;

  // Surfaced move rejection (e.g. "Not your turn", "Illegal move", "You lost on
  // time"). `boardEpoch` bumps to remount the board, reverting the optimistic
  // piece back to the authoritative server position.
  const [moveError, setMoveError] = useState<string | null>(null);
  const [boardEpoch, setBoardEpoch] = useState(0);

  // Auto-clear the move error after a few seconds.
  useEffect(() => {
    if (!moveError) return;
    const id = setTimeout(() => setMoveError(null), 4000);
    return () => clearTimeout(id);
  }, [moveError]);

  const handleMove = useCallback(
    async (uci: string) => {
      try {
        const res = await fetch(`${API_URL}/matches/${matchId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ move: uci, playerAddress: address }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Move rejected (${res.status})`);
        }
        setMoveError(null);
      } catch (err) {
        setMoveError(err instanceof Error ? err.message : 'Move rejected.');
        setBoardEpoch((n) => n + 1); // revert optimistic move to server state
      }
    },
    [matchId, address],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-3">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-lock/30 border-t-lock" />
          <p className="font-mono text-sm text-bone-faint">Loading match…</p>
        </div>
      </div>
    );
  }

  if (error && !record) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="font-mono text-sm text-short">{error}</p>
        <Link href="/" className="btn-ghost">
          Back to Lobby
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-6 pb-20 animate-rise-in">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="tag hover:text-bone transition-colors">
            ← Lobby
          </Link>
          <span className="tag text-bone-faint/50">/</span>
          <span className="font-mono text-xs text-bone-faint">Match #{matchId}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* WebSocket status */}
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
            wsStatus === 'open'
              ? 'border-long/30 text-long'
              : wsStatus === 'connecting'
              ? 'border-lock/30 text-lock'
              : 'border-edge text-bone-faint'
          }`}>
            {wsStatus === 'open' ? (
              <span className="flex items-center gap-1">
                <span className="live-dot" /> Live
              </span>
            ) : wsStatus === 'connecting' ? 'Connecting…' : 'Disconnected'}
          </span>

          {isFlagged && (
            <Badge tone="danger" title="Move-match rate against Stockfish crossed the suspicion threshold">
              ⚠ Flagged
            </Badge>
          )}

          {waiting && (
            <span className="tag text-lock">Waiting for opponent…</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-short/30 bg-short/8 px-4 py-2">
          <p className="font-mono text-xs text-short">{error}</p>
        </div>
      )}

      {/* Matchmaking: waiting for a second player to join with the same stakes */}
      {waiting && record && (
        <div className="panel mb-4 flex flex-col items-center justify-center gap-3 p-7 text-center animate-rise-in">
          <span className="relative flex size-12 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-lock/20" />
            <span className="size-9 animate-spin rounded-full border-2 border-lock/30 border-t-lock" />
          </span>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              Waiting for an opponent…
            </p>
            <p className="mt-1 font-mono text-xs text-bone-faint">
              Anyone who picks{' '}
              <span className="text-bone">
                {stroopsToUsdc(record.bet_amount).toFixed(0)} USDC
              </span>{' '}
              ·{' '}
              <span className="text-bone">
                {Math.floor(record.time_control / 60)} min
              </span>{' '}
              is paired here automatically. The game starts the moment they join.
            </p>
          </div>
        </div>
      )}

      {/* Player info */}
      {record && (
        <div className="mb-4">
          <PlayerInfo
            playerA={record.player_a}
            playerB={record.player_b}
            playerAColor={record.player_a_color}
            betAmount={record.bet_amount}
            status={record.status}
            turn={live.turn}
            whiteMs={live.whiteMs}
            blackMs={live.blackMs}
            clockUpdatedAt={live.clockUpdatedAt}
            clockRunning={live.clockRunning}
          />
        </div>
      )}

      {/* Main layout — players see full-width board; spectators see board + trading sidebar */}
      <div className={`flex flex-col gap-4 ${isPlayer ? '' : 'lg:flex-row'}`}>
        {/* Board column */}
        <div className={`flex flex-col items-center gap-4 ${isPlayer ? '' : 'lg:flex-1'}`}>
          {/* Eval bar */}
          <div className={`w-full ${isPlayer ? 'max-w-[640px]' : 'max-w-[560px]'}`}>
            <EvalBar
              score={live.evalScore}
              depth={live.evalDepth}
              mate={live.mate}
              locked={live.marketLocked}
              lockScore={live.lockEvalScore}
            />
          </div>

          {/* Board */}
          <div className={isPlayer ? 'w-full max-w-[640px]' : undefined}>
            <ChessBoardComponent
              key={boardEpoch}
              fen={live.fen}
              playerColor={playerColor}
              matchId={matchId}
              disabled={live.gameOver || record?.status === 'open'}
              onMove={handleMove}
            />
            {moveError && (
              <div className="mt-2 rounded-md border border-short/30 bg-short/8 px-3 py-1.5 text-center">
                <p className="font-mono text-xs text-short">{moveError}</p>
              </div>
            )}
          </div>

          {/* Prize pool — shown below board for players */}
          {isPlayer && record && (
            <div className="w-full max-w-[640px]">
              <PrizePool
                betAmount={record.bet_amount}
                poolA={live.poolA}
                poolB={live.poolB}
                poolDraw={live.poolDraw}
              />
            </div>
          )}

          {/* Move history */}
          <div className={`w-full ${isPlayer ? 'max-w-[640px]' : 'max-w-[560px]'}`}>
            <MoveHistory moves={live.moveHistory} matchStatus={record?.status} />
          </div>
        </div>

        {/* Prediction market sidebar — spectators / traders only */}
        {!isPlayer && (
          <div className="flex flex-col gap-4 lg:w-80 xl:w-96">
            {record && (
              <PrizePool
                betAmount={record.bet_amount}
                poolA={live.poolA}
                poolB={live.poolB}
                poolDraw={live.poolDraw}
              />
            )}
            <TradingPanel
              matchId={matchId}
              playerAName={record ? shortAddress(record.player_a) : 'Player A'}
              playerBName={record?.player_b ? shortAddress(record.player_b) : 'Player B'}
              poolA={live.poolA}
              poolB={live.poolB}
              poolDraw={live.poolDraw}
              oddsA={live.oddsA}
              oddsB={live.oddsB}
              oddsDraw={live.oddsDraw}
              phase={live.gameOver ? 'settled' : live.marketLocked ? 'locked' : 'open'}
              winner={live.winner}
              lockEvalScore={live.lockEvalScore}
              walletAddress={address}
            />
          </div>
        )}
      </div>

      {/* Settlement modal */}
      {live.gameOver && live.winner && (
        <SettlementModal
          winner={live.winner}
          reason={live.gameOverReason}
          record={record}
          playerPrize={live.settlement?.playerPrize}
          netPool={live.settlement?.netPool}
          txHash={live.settlement?.txHash ?? null}
          matchId={matchId}
          walletAddress={address}
          isPlayer={isPlayer}
          disputeStatus={antiCheat.disputeStatus}
        />
      )}
    </div>
  );
}
