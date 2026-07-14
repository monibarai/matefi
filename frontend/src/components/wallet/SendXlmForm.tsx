'use client';

import { useState } from 'react';
import {
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { signTransaction } from '@stellar/freighter-api';
import { HORIZON_TESTNET_URL, TESTNET_PASSPHRASE } from '@/lib/horizon';

interface SendXlmFormProps {
  address: string;
}

interface TxResult {
  success: boolean;
  hash?: string;
  message: string;
}

export function SendXlmForm({ address }: SendXlmFormProps) {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxResult | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);

    try {
      // 1. Load source account from Horizon
      const server = new Horizon.Server(HORIZON_TESTNET_URL);
      const account = await server.loadAccount(address);

      // 2. Build payment transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination,
            asset: Asset.native(),
            amount,
          }),
        )
        .setTimeout(30)
        .build();

      // 3. Convert to XDR
      const xdr = transaction.toEnvelope().toXDR('base64');

      // 4. Sign with Freighter
      const { signedTxXdr, error: signError } = await signTransaction(xdr, {
        networkPassphrase: TESTNET_PASSPHRASE,
      });

      if (signError) {
        throw new Error(String(signError));
      }

      if (!signedTxXdr) {
        throw new Error('Signing cancelled or failed — no signed XDR returned.');
      }

      // 5. Submit to Horizon
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
      const response = await server.submitTransaction(signedTx);

      setResult({ success: true, hash: response.hash, message: 'Transaction sent!' });
      setDestination('');
      setAmount('');
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Horizon wraps errors in extras.result_codes — surface them if present
      let message = raw;
      try {
        const parsed: { response?: { data?: { extras?: { result_codes?: unknown } } } } =
          JSON.parse(raw);
        const codes = parsed?.response?.data?.extras?.result_codes;
        if (codes) message = JSON.stringify(codes);
      } catch {
        // raw message is fine
      }
      setResult({ success: false, message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-bone-faint mb-5">
        Send XLM
      </p>

      <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
        <div>
          <label className="block font-mono text-[11px] text-bone-faint mb-1.5">
            Destination Address
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="G…"
            required
            disabled={loading}
            className="input font-mono text-xs"
            spellCheck={false}
          />
        </div>

        <div>
          <label className="block font-mono text-[11px] text-bone-faint mb-1.5">
            Amount (XLM)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0000000"
            required
            min="0.0000001"
            step="any"
            disabled={loading}
            className="input font-mono text-xs"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !destination || !amount}
          className="btn-primary w-full"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-deep border-t-transparent" />
              Sending…
            </>
          ) : (
            'Send XLM'
          )}
        </button>
      </form>

      {result && (
        <div
          className={`mt-4 rounded-md border px-4 py-3 animate-rise-in ${
            result.success
              ? 'border-long/30 bg-long/5'
              : 'border-short/30 bg-short/5'
          }`}
        >
          {result.success ? (
            <div>
              <p className="font-mono text-sm text-long font-semibold">
                {result.message}
              </p>
              <p className="mt-1 font-mono text-[11px] text-bone-faint break-all">
                Hash: {result.hash}
              </p>
              {result.hash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${result.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-lock hover:underline"
                >
                  View on stellar.expert
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          ) : (
            <p className="font-mono text-sm text-short">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
