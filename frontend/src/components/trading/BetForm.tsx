'use client';

import { useState } from 'react';
import { useTrading } from '@/hooks/useTrading';
import type { Outcome } from '@/types/trading';

interface BetFormProps {
  matchId: string;
  playerAName: string;
  playerBName: string;
  onSuccess?: () => void;
}

const OUTCOMES: { id: Outcome; label: (a: string, b: string) => string; color: string; active: string }[] = [
  { id: 'PlayerA', label: (a) => a, color: 'border-long/30 text-long hover:border-long/60 hover:bg-long/5', active: 'border-long bg-long/10 text-long' },
  { id: 'Draw', label: () => 'Draw', color: 'border-draw/30 text-draw hover:border-draw/60 hover:bg-draw/5', active: 'border-draw bg-draw/10 text-draw' },
  { id: 'PlayerB', label: (_, b) => b, color: 'border-short/30 text-short hover:border-short/60 hover:bg-short/5', active: 'border-short bg-short/10 text-short' },
];

export function BetForm({ matchId, playerAName, playerBName, onSuccess }: BetFormProps) {
  const [outcome, setOutcome] = useState<Outcome>('PlayerA');
  const [amount, setAmount] = useState('');
  const { placeBet, placing, error, success, reset } = useTrading(matchId);

  const handleSubmit = async () => {
    const ok = await placeBet(outcome, amount);
    if (ok) {
      setAmount('');
      onSuccess?.();
    }
  };

  if (success) {
    return (
      <div className="rounded-lg border border-long/30 bg-long/8 p-4 text-center">
        <p className="font-mono text-sm font-semibold text-long">
          ✓ Bet placed on-chain
        </p>
        <button
          onClick={reset}
          className="mt-2 btn-ghost text-[11px] py-1"
        >
          Place another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="tag">Place a trade</p>

      {/* Outcome selector */}
      <div className="grid grid-cols-3 gap-2">
        {OUTCOMES.map((o) => (
          <button
            key={o.id}
            onClick={() => setOutcome(o.id)}
            className={`rounded-md border py-2 font-mono text-xs font-medium transition-all ${
              outcome === o.id ? o.active : o.color
            }`}
          >
            {o.label(playerAName, playerBName)}
          </button>
        ))}
      </div>

      {/* Amount + submit */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            min="1"
            step="0.5"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-terminal pr-14"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-bone-faint">
            USDC
          </span>
        </div>
        <button
          onClick={() => void handleSubmit()}
          disabled={placing || !amount}
          className="btn-primary shrink-0"
        >
          {placing ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
          ) : (
            'Bet'
          )}
        </button>
      </div>

      {error && (
        <p className="font-mono text-xs text-short">{error}</p>
      )}
    </div>
  );
}
