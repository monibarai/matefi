'use client';

import { useEffect } from 'react';
import { useXlmBalance } from '@/hooks/useXlmBalance';

interface XlmBalanceProps {
  address: string;
}

export function XlmBalance({ address }: XlmBalanceProps) {
  const { balance, funded, loading, error, fetchBalance } = useXlmBalance(address);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs uppercase tracking-widest text-bone-faint">
          XLM Balance
        </p>
        <button
          onClick={() => void fetchBalance()}
          disabled={loading}
          className="btn-ghost py-1 px-2.5 text-[10px]"
        >
          {loading ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-bone-dim border-t-transparent" />
          ) : (
            'Refresh'
          )}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-short/30 bg-short/5 px-4 py-3">
          <p className="font-mono text-xs text-short">{error}</p>
        </div>
      ) : loading && balance === null ? (
        <div className="skeleton h-10 w-40 rounded-md" />
      ) : !funded ? (
        <div>
          <p className="font-display text-3xl font-semibold text-bone">0 XLM</p>
          <p className="mt-1 font-mono text-xs text-bone-faint">
            Account not funded — visit{' '}
            <a
              href="https://laboratory.stellar.org/#account-creator?network=test"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lock hover:underline"
            >
              Friendbot
            </a>{' '}
            to fund it.
          </p>
        </div>
      ) : (
        <div>
          <p className="font-display text-3xl font-semibold text-bone">
            {balance} <span className="text-xl text-bone-faint">XLM</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-long">
            Stellar Testnet
          </p>
        </div>
      )}
    </div>
  );
}
