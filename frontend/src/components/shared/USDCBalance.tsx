'use client';

// Connected wallet's USDC balance — read via simulated `balance()` call.
// Degrades to "—" when the USDC contract id is unset or the RPC read fails.

import { useEffect, useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useMounted } from '@/hooks/useMounted';
import { fetchUsdcBalance, formatUsdc } from '@/lib/usdc';

const REFRESH_MS = 30_000;

export function USDCBalance() {
  const mounted = useMounted();
  const { address } = useWallet();
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      void fetchUsdcBalance(address).then((b) => {
        if (!cancelled) setBalance(b);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [address]);

  if (!mounted || !address) return null;

  return (
    <span
      className="hidden items-center gap-1.5 rounded-md border border-edge bg-ink-raise px-2.5 py-1.5 font-mono text-xs text-bone-dim sm:inline-flex"
      title="USDC balance (testnet)"
    >
      <span className="text-long">$</span>
      {balance === null ? '—' : formatUsdc(balance, { compact: true })}
      <span className="text-bone-faint">USDC</span>
    </span>
  );
}
