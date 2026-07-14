'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import type { PlayerColor } from '@/types/match';

interface ChessBoardProps {
  fen: string;
  playerColor: PlayerColor | null;
  matchId: string;
  disabled?: boolean;
  onMove: (uci: string) => Promise<void> | void;
}

// Highlight styles (theme "lock" orange = 242,169,59).
const SELECTED_BG = 'rgba(242, 169, 59, 0.45)';
const LAST_FROM_BG = 'rgba(242, 169, 59, 0.22)';
const LAST_TO_BG = 'rgba(242, 169, 59, 0.34)';
const CHECK_BG =
  'radial-gradient(circle, rgba(229,57,53,0.85) 0%, rgba(229,57,53,0.45) 55%, transparent 72%)';
const MOVE_DOT = 'radial-gradient(circle, rgba(242,169,59,0.55) 24%, transparent 26%)';
const CAPTURE_RING =
  'radial-gradient(circle, transparent 64%, rgba(242,169,59,0.6) 65%, rgba(242,169,59,0.6) 84%, transparent 85%)';

export function ChessBoardComponent({
  fen,
  playerColor,
  matchId,
  disabled = false,
  onMove,
}: ChessBoardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [lastMoveSq, setLastMoveSq] = useState<{ from: string; to: string } | null>(null);
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, React.CSSProperties>>({});

  // Derive legal moves / turn for highlighting and gating.
  const chess = useMemo(() => {
    try { return new Chess(fen); } catch { return new Chess(); }
  }, [fen]);

  // Reset selection + last-move highlight whenever the position changes
  // externally (our own move confirmed, or the opponent moved).
  useEffect(() => {
    setLastMoveSq(null);
    setMoveFrom(null);
    setOptionSquares({});
  }, [fen]);

  const isMyTurn =
    !!playerColor &&
    ((playerColor === 'white' && chess.turn() === 'w') ||
      (playerColor === 'black' && chess.turn() === 'b'));

  const isMyPiece = useCallback(
    (square: Square): boolean => {
      const piece = chess.get(square);
      if (!piece) return false;
      return playerColor === 'white' ? piece.color === 'w' : piece.color === 'b';
    },
    [chess, playerColor],
  );

  const canInteract = !!playerColor && !disabled && !submitting && isMyTurn;

  // Submit a move (shared by drag and click). Optimistically lands the piece;
  // the parent reverts the board if the relayer rejects it.
  const commitMove = useCallback(
    (from: string, to: string): boolean => {
      let uci: string;
      try {
        const testChess = new Chess(fen);
        const move = testChess.move({ from, to, promotion: 'q' });
        if (!move) return false;
        uci = `${move.from}${move.to}${move.promotion ?? ''}`;
      } catch {
        return false;
      }
      setLastMoveSq({ from, to });
      setMoveFrom(null);
      setOptionSquares({});
      setSubmitting(true);
      void Promise.resolve(onMove(uci)).finally(() => setSubmitting(false));
      return true;
    },
    [fen, onMove],
  );

  // Compute and show the legal destinations for a selected square.
  const showMoveOptions = useCallback(
    (square: Square): boolean => {
      const moves = chess.moves({ square, verbose: true });
      if (moves.length === 0) {
        setOptionSquares({});
        return false;
      }
      const styles: Record<string, React.CSSProperties> = {};
      for (const m of moves) {
        const isCapture = !!chess.get(m.to as Square) || m.flags.includes('e');
        styles[m.to] = {
          background: isCapture ? CAPTURE_RING : MOVE_DOT,
        };
      }
      styles[square] = { background: SELECTED_BG };
      setOptionSquares(styles);
      return true;
    },
    [chess],
  );

  // --- Drag-to-move ---
  const onPieceDrop = useCallback(
    (from: string, to: string): boolean => {
      if (!canInteract) return false;
      if (!isMyPiece(from as Square)) return false;
      return commitMove(from, to);
    },
    [canInteract, isMyPiece, commitMove],
  );

  // --- Click / tap-to-move ---
  const onSquareClick = useCallback(
    (square: Square) => {
      if (!canInteract) return;

      // No piece selected yet → select one of my pieces and show its options.
      if (!moveFrom) {
        if (isMyPiece(square) && showMoveOptions(square)) setMoveFrom(square);
        return;
      }

      // Re-clicking the same square deselects.
      if (square === moveFrom) {
        setMoveFrom(null);
        setOptionSquares({});
        return;
      }

      // Is the clicked square a legal destination for the selected piece?
      const legal = chess
        .moves({ square: moveFrom, verbose: true })
        .some((m) => m.to === square);

      if (legal) {
        commitMove(moveFrom, square);
        return;
      }

      // Otherwise: if it's another of my pieces, switch selection; else clear.
      if (isMyPiece(square) && showMoveOptions(square)) {
        setMoveFrom(square);
      } else {
        setMoveFrom(null);
        setOptionSquares({});
      }
    },
    [canInteract, moveFrom, isMyPiece, showMoveOptions, chess, commitMove],
  );

  const isDraggablePiece = useCallback(
    ({ sourceSquare }: { piece: string; sourceSquare: string }) =>
      canInteract && isMyPiece(sourceSquare as Square),
    [canInteract, isMyPiece],
  );

  // Merge last-move, selection/options, and check highlights.
  const customSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};
    if (lastMoveSq) {
      styles[lastMoveSq.from] = { background: LAST_FROM_BG };
      styles[lastMoveSq.to] = { background: LAST_TO_BG };
    }
    // King-in-check indicator.
    if (chess.inCheck()) {
      const turn = chess.turn();
      for (const row of chess.board()) {
        for (const sq of row) {
          if (sq && sq.type === 'k' && sq.color === turn) {
            styles[sq.square] = { ...(styles[sq.square] ?? {}), background: CHECK_BG };
          }
        }
      }
    }
    return { ...styles, ...optionSquares };
  }, [lastMoveSq, optionSquares, chess]);

  return (
    <div className="relative w-full max-w-[640px]">
      <Chessboard
        id={`board-${matchId}`}
        position={fen}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        isDraggablePiece={isDraggablePiece}
        arePiecesDraggable={canInteract}
        boardOrientation={playerColor === 'black' ? 'black' : 'white'}
        customSquareStyles={customSquareStyles}
        areArrowsAllowed
        animationDuration={150}
        customDarkSquareStyle={{ backgroundColor: '#2d3748' }}
        customLightSquareStyle={{ backgroundColor: '#e2d5bb' }}
        customBoardStyle={{
          borderRadius: '6px',
          boxShadow: '0 4px 32px -8px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      />

      {/* Spectator overlay hint */}
      {!playerColor && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-md border border-edge bg-ink/80 px-3 py-1 font-mono text-[10px] text-bone-faint backdrop-blur-sm">
            Spectator — watching
          </span>
        </div>
      )}

      {/* "Opponent's turn" hint for players */}
      {playerColor && !disabled && !isMyTurn && !submitting && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="rounded-md border border-edge bg-ink/80 px-3 py-1 font-mono text-[10px] text-bone-faint backdrop-blur-sm">
            Opponent&apos;s turn…
          </span>
        </div>
      )}

      {/* Submitting overlay */}
      {submitting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-ink/20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-lock border-t-transparent" />
        </div>
      )}
    </div>
  );
}
