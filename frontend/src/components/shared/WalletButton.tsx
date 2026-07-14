'use client';

import { useWallet } from '@/hooks/useWallet';
import { useMounted } from '@/hooks/useMounted';
import { shortAddress } from '@/lib/stellar';

export function WalletButton() {
  const mounted = useMounted();
  const { address, connecting, error, connect, disconnect } = useWallet();

  if (!mounted) {
    return (
      <div className="skeleton h-8 w-28 rounded-md" />
    );
  }

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-md border border-long/30 bg-long/5 px-2.5 py-1 font-mono text-[11px] text-long sm:inline-block">
          {shortAddress(address)}
        </span>
        <button
          onClick={() => void disconnect()}
          className="btn-ghost py-1.5 text-[11px]"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => void connect()}
        disabled={connecting}
        className="btn-primary py-1.5"
      >
        {connecting ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink border-t-ink-deep" />
            Connecting…
          </>
        ) : (
          'Connect Wallet'
        )}
      </button>
      {error && (
        <p className="max-w-[200px] text-right text-[11px] text-short">{error}</p>
      )}
    </div>
  );
}
