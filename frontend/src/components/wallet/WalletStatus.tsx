'use client';

import type { WalletStatus as Status } from '@/hooks/useFreighterWallet';

interface WalletStatusProps {
  status: Status;
  address: string | null;
  error: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  connecting: boolean;
}

export function WalletStatus({
  status,
  address,
  error,
  onConnect,
  onDisconnect,
  connecting,
}: WalletStatusProps) {

  if (status === 'checking') {
    return (
      <div className="panel p-6">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-lock border-t-transparent" />
          <span className="font-mono text-sm text-bone-faint">Detecting Freighter…</span>
        </div>
      </div>
    );
  }

  if (status === 'not_installed') {
    return (
      <div className="panel p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-bone-faint mb-3">
          Wallet Setup
        </p>
        <div className="rounded-md border border-short/30 bg-short/5 px-4 py-3 mb-4">
          <p className="font-mono text-sm text-short">
            Freighter extension not detected.
          </p>
        </div>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex"
        >
          Install Freighter
          <svg className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
        <p className="mt-3 font-mono text-[11px] text-bone-faint">
          After installing, reload this page and try again.
        </p>
      </div>
    );
  }

  if (status === 'connected' && address) {
    return (
      <div className="panel p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-bone-faint mb-3">
          Connected Wallet
        </p>
        <div className="rounded-md border border-long/30 bg-long/5 px-4 py-3 mb-4">
          <p className="font-mono text-[11px] text-bone-faint mb-1">Address</p>
          <p className="font-mono text-sm text-long break-all">{address}</p>
        </div>
        <div className="flex items-center gap-2 text-long">
          <span className="live-dot" />
          <span className="font-mono text-xs text-long">TESTNET · Connected</span>
        </div>
        <button
          onClick={onDisconnect}
          className="btn-ghost mt-4 py-1.5 text-[11px]"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="panel p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-bone-faint mb-3">
        Wallet Setup
      </p>
      <div className="rounded-md border border-edge bg-ink-raise px-4 py-3 mb-4">
        <p className="font-mono text-[11px] text-bone-faint mb-1">Network</p>
        <p className="font-mono text-sm text-bone">Stellar Testnet</p>
        <p className="font-mono text-[10px] text-bone-faint mt-1">
          Test SDF Network ; September 2015
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-short/30 bg-short/5 px-4 py-2 mb-4">
          <p className="font-mono text-xs text-short">{error}</p>
        </div>
      )}
      <button
        onClick={onConnect}
        disabled={connecting}
        className="btn-primary w-full"
      >
        {connecting ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-deep border-t-transparent" />
            Connecting…
          </>
        ) : (
          'Connect Wallet'
        )}
      </button>
      <p className="mt-3 font-mono text-[11px] text-bone-faint">
        Requires{' '}
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-lock hover:underline"
        >
          Freighter
        </a>{' '}
        browser extension.
      </p>
    </div>
  );
}
