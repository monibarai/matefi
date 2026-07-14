'use client';

// Level 1 spec component — a self-contained wallet panel demonstrating the full
// flow: detect → connect → balance → send → tx hash. No router needed.
//
// Per spec, detectFreighter / connectWallet / signTx are imported from
// stellar-wallet.ts at the top and used directly here.

import { useEffect, useState, useCallback } from 'react';
import { detectFreighter, connectWallet, signTx } from '@/lib/stellar-wallet';
import { fetchXlmBalance, buildPaymentXdr, submitSignedTx } from '@/lib/stellar-sdk';

interface TxFeedback {
  success: boolean;
  hash?: string;
  message: string;
}

export function StellarWalletPanel() {
  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [unfunded, setUnfunded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<TxFeedback | null>(null);

  // Requirement 1 — detect Freighter on mount.
  useEffect(() => {
    void detectFreighter().then(setHasFreighter);
  }, []);

  // Requirement 3 — fetch XLM balance from Horizon Testnet.
  const refreshBalance = useCallback(async (addr: string) => {
    setLoadingBalance(true);
    setError(null);
    try {
      const bal = await fetchXlmBalance(addr);
      setBalance(bal);
      setUnfunded(bal === '0');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch balance.');
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // Requirement 2 — connect via Freighter.
  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      await refreshBalance(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setAddress(null);
    setBalance(null);
    setUnfunded(false);
    setError(null);
    setFeedback(null);
  };

  // Requirement 4 — build → sign (signTx) → submit.
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setFeedback(null);
    setSending(true);
    try {
      const xdr = await buildPaymentXdr(address, destination, amount);
      const signedXdr = await signTx(xdr);
      const { hash } = await submitSignedTx(signedXdr);
      setFeedback({ success: true, hash, message: 'Transaction sent!' });
      setDestination('');
      setAmount('');
      void refreshBalance(address);
    } catch (err) {
      setFeedback({
        success: false,
        message: err instanceof Error ? err.message : 'Transaction failed.',
      });
    } finally {
      setSending(false);
    }
  };

  // Requirement 1 — install prompt.
  if (hasFreighter === false) {
    return (
      <div className="panel p-6">
        <p className="font-mono text-sm text-short mb-3">
          Freighter extension not detected.
        </p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex"
        >
          Install Freighter
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Requirement 2 — connect / disconnect + address */}
      <div className="panel p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-bone-faint mb-3">
          Wallet · Stellar Testnet
        </p>
        {error && (
          <div className="rounded-md border border-short/30 bg-short/5 px-4 py-2 mb-4">
            <p className="font-mono text-xs text-short">{error}</p>
          </div>
        )}
        {address ? (
          <>
            <div className="rounded-md border border-long/30 bg-long/5 px-4 py-3 mb-4">
              <p className="font-mono text-[11px] text-bone-faint mb-1">Address</p>
              <p className="font-mono text-sm text-long break-all">{address}</p>
            </div>
            <button onClick={handleDisconnect} className="btn-ghost py-1.5 text-[11px]">
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => void handleConnect()}
            disabled={connecting}
            className="btn-primary w-full"
          >
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
      </div>

      {/* Requirement 3 — XLM balance + refresh */}
      {address && (
        <div className="panel p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-xs uppercase tracking-widest text-bone-faint">
              XLM Balance
            </p>
            <button
              onClick={() => void refreshBalance(address)}
              disabled={loadingBalance}
              className="btn-ghost py-1 px-2.5 text-[10px]"
            >
              {loadingBalance ? '…' : 'Refresh Balance'}
            </button>
          </div>
          {unfunded ? (
            <p className="font-display text-3xl font-semibold text-bone">
              0 XLM{' '}
              <span className="text-sm text-bone-faint">(account not funded)</span>
            </p>
          ) : (
            <p className="font-display text-3xl font-semibold text-bone">
              {balance ?? '—'} <span className="text-xl text-bone-faint">XLM</span>
            </p>
          )}
        </div>
      )}

      {/* Requirement 4 — send XLM */}
      {address && (
        <div className="panel p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-bone-faint mb-5">
            Send XLM
          </p>
          <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Destination G-address"
              required
              disabled={sending}
              className="input font-mono text-xs"
              spellCheck={false}
            />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (XLM)"
              required
              min="0.0000001"
              step="any"
              disabled={sending}
              className="input font-mono text-xs"
            />
            <button
              type="submit"
              disabled={sending || !destination || !amount}
              className="btn-primary w-full"
            >
              {sending ? 'Sending…' : 'Send XLM'}
            </button>
          </form>

          {feedback && (
            <div
              className={`mt-4 rounded-md border px-4 py-3 ${
                feedback.success
                  ? 'border-long/30 bg-long/5'
                  : 'border-short/30 bg-short/5'
              }`}
            >
              {feedback.success ? (
                <div>
                  <p className="font-mono text-sm text-long font-semibold break-all">
                    {feedback.message} Hash: {feedback.hash}
                  </p>
                  {feedback.hash && (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${feedback.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block font-mono text-[11px] text-lock hover:underline"
                    >
                      View on stellar.expert
                    </a>
                  )}
                </div>
              ) : (
                <p className="font-mono text-sm text-short">{feedback.message}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
