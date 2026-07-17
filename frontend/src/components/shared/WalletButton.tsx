'use client';

import { useEffect, useRef } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useMounted } from '@/hooks/useMounted';
import { toast } from '@/hooks/useToast';
import { shortAddress } from '@/lib/stellar';

export function WalletButton() {
  const mounted = useMounted();
  const { address, connecting, error, connect, disconnect } = useWallet();

  // Fire a toast only on a genuine state transition triggered by this
  // session (connecting -> connected, or a fresh error) — not on the
  // silent rehydration of a persisted address when the page first loads.
  const wasConnecting = useRef(false);
  const lastError = useRef<string | null>(null);

  useEffect(() => {
    if (wasConnecting.current && !connecting && address) {
      toast(`Wallet connected — ${shortAddress(address)}`, 'success');
    }
    wasConnecting.current = connecting;
  }, [connecting, address]);

  useEffect(() => {
    if (error && error !== lastError.current) {
      toast(error, 'error');
    }
    lastError.current = error;
  }, [error]);

  if (!mounted) {
    return (
      <div className="skeleton h-8 w-28 rounded-md" />
    );
  }

  if (address) {
    return (
      <button
        onClick={() => {
          void disconnect();
          toast('Wallet disconnected', 'info');
        }}
        className="btn-ghost py-1.5 text-[11px]"
      >
        Disconnect
      </button>
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
