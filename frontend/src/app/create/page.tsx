'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { createMatch, joinMatch, contractsConfigured } from '@/lib/contracts';
import { API_URL } from '@/lib/stellar';
import { usdcToStroops } from '@/lib/usdc';
import type { MatchRecord } from '@/types/match';

const TIME_CONTROLS = [
  { label: '1 min', secs: 60 },
  { label: '3 min', secs: 180 },
  { label: '5 min', secs: 300 },
  { label: '10 min', secs: 600 },
  { label: '15 min', secs: 900 },
  { label: '30 min', secs: 1800 },
] as const;

const BET_PRESETS = [1, 5, 10, 25, 50, 100] as const;

/**
 * Find an open match from another player that has identical stakes (bet amount
 * in stroops + time control) and is still waiting for an opponent. Returns null
 * on any error so the caller falls back to creating a fresh match.
 */
async function findCompatibleOpenMatch(opts: {
  address: string;
  betStroops: bigint;
  timeControlSecs: number;
}): Promise<MatchRecord | null> {
  try {
    const res = await fetch(`${API_URL}/matches`, { cache: 'no-store' });
    if (!res.ok) return null;
    const matches = (await res.json()) as MatchRecord[];
    const target = opts.betStroops.toString();
    return (
      matches.find(
        (m) =>
          m.status === 'open' &&
          !m.player_b &&
          m.player_a !== opts.address &&
          String(m.bet_amount) === target &&
          Number(m.time_control) === opts.timeControlSecs,
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** Poll until the relayer has indexed the match (status any, up to ~15 s). Used after createMatch. */
async function waitForMatch(matchId: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${API_URL}/matches/${matchId}`, { cache: 'no-store' });
      if (res.ok) return;
    } catch {
      // relayer temporarily unreachable — keep waiting
    }
  }
}

/** Poll until the relayer has transitioned the match to 'active' (up to ~22 s). Used after joinMatch. */
async function waitForActiveMatch(matchId: string): Promise<void> {
  for (let i = 0; i < 15; i++) {
    await new Promise<void>((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${API_URL}/matches/${matchId}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { match: { status: string } };
        if (data?.match?.status === 'active') return;
      }
    } catch {
      // relayer temporarily unreachable — keep waiting
    }
  }
  // navigate anyway after timeout — the polling in useMatch will finish the job
}

export default function CreateMatchPage() {
  const router = useRouter();
  const { address } = useWallet();

  const [betAmount, setBetAmount] = useState('10');
  const [timeControlSecs, setTimeControlSecs] = useState(300);
  const [status, setStatus] = useState<
    'idle' | 'searching' | 'joining' | 'approving' | 'submitting' | 'waiting' | 'done'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const busy = status !== 'idle';
  const betNum = parseFloat(betAmount);
  const betValid = !isNaN(betNum) && betNum >= 1 && betNum <= 1000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address) { setError('Connect your wallet first.'); return; }
    if (!betValid) { setError('Enter a bet between 1 and 1000 USDC.'); return; }
    if (!contractsConfigured) {
      setError('Contracts not deployed yet — set NEXT_PUBLIC_* env vars.');
      return;
    }

    setError(null);
    try {
      const betStroops = usdcToStroops(betAmount);

      // 1. Matchmaking: look for an opponent already waiting on the same
      //    bet + time control. If found, join their match instead of opening
      //    a duplicate — this pairs the two players automatically.
      setStatus('searching');
      const opponentMatch = await findCompatibleOpenMatch({
        address,
        betStroops,
        timeControlSecs,
      });

      if (opponentMatch) {
        setStatus('joining');
        await joinMatch(address, opponentMatch.match_id, betStroops);
        setStatus('waiting');
        await waitForActiveMatch(opponentMatch.match_id);
        setStatus('done');
        router.push(`/match/${opponentMatch.match_id}`);
        return;
      }

      // 2. Nobody waiting — open a new match and wait for an opponent.
      setStatus('approving');
      const matchId = await createMatch(address, betAmount, timeControlSecs);
      setStatus('waiting');
      await waitForMatch(matchId);
      setStatus('done');
      router.push(`/match/${matchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transaction failed.');
      setStatus('idle');
    }
  }

  const statusLabel: Record<typeof status, string> = {
    idle: 'Find / Create Match',
    searching: 'Finding opponent…',
    joining: 'Joining match…',
    approving: 'Approving USDC…',
    submitting: 'Creating Match…',
    waiting: 'Starting match…',
    done: 'Redirecting…',
  };

  return (
    <div className="pt-10 pb-16">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold text-bone">Create Match</h1>
          <p className="mt-1.5 font-mono text-sm text-bone-faint">
            Pick your stakes. We pair you with anyone waiting on the same bet &amp;
            time control — otherwise we open a match and wait for them.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Bet amount */}
          <div className="panel p-5 space-y-3">
            <label className="tag block">Bet Amount (USDC each player)</label>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {BET_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBetAmount(String(p))}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    parseFloat(betAmount) === p
                      ? 'border-lock/50 bg-lock/10 text-lock'
                      : 'border-edge bg-ink-raise text-bone-dim hover:border-edge-bright hover:text-bone'
                  }`}
                >
                  {p} USDC
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="relative">
              <input
                type="number"
                min="1"
                max="1000"
                step="1"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Custom amount"
                className="input w-full pr-16"
                disabled={busy}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-bone-faint">
                USDC
              </span>
            </div>

            {betValid && (
              <p className="font-mono text-xs text-bone-faint">
                Total pot: <span className="text-bone">{(betNum * 2).toFixed(0)} USDC</span>{' '}
                (before 3% fee)
              </p>
            )}
          </div>

          {/* Time control */}
          <div className="panel p-5 space-y-3">
            <label className="tag block">Time Control (per player)</label>
            <div className="flex flex-wrap gap-2">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.secs}
                  type="button"
                  onClick={() => setTimeControlSecs(tc.secs)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    timeControlSecs === tc.secs
                      ? 'border-lock/50 bg-lock/10 text-lock'
                      : 'border-edge bg-ink-raise text-bone-dim hover:border-edge-bright hover:text-bone'
                  }`}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Warning if no wallet */}
          {!address && (
            <div className="rounded-md border border-lock/30 bg-lock/8 px-4 py-2">
              <p className="font-mono text-xs text-lock">
                Connect your Freighter wallet to continue.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-short/30 bg-short/8 px-4 py-2">
              <p className="font-mono text-xs text-short">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={busy || !address || !betValid}
            className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-bone/30 border-t-bone" />
                {statusLabel[status]}
              </span>
            ) : (
              statusLabel[status]
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 space-y-2 rounded-md border border-edge bg-ink-raise p-4">
          <p className="tag mb-2">How it works</p>
          <ul className="space-y-1.5 font-mono text-xs text-bone-faint">
            <li>1. We look for an opponent already waiting on these exact stakes.</li>
            <li>2. Found one → you approve USDC and join — the game starts instantly.</li>
            <li>3. Nobody waiting → we open your match and hold it until they arrive.</li>
            <li>4. Spectators bet on the outcome in the prediction market.</li>
            <li>5. Winner gets 97% of deposits + a share of the flywheel bonus.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
