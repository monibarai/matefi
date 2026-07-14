'use client';

import { useState, useCallback } from 'react';
import { HORIZON_TESTNET_URL } from '@/lib/horizon';

interface HorizonBalance {
  asset_type: string;
  balance: string;
}

interface BalanceState {
  balance: string | null;
  funded: boolean;
  loading: boolean;
  error: string | null;
}

export function useXlmBalance(address: string | null) {
  const [state, setState] = useState<BalanceState>({
    balance: null,
    funded: true,
    loading: false,
    error: null,
  });

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`${HORIZON_TESTNET_URL}/accounts/${address}`);
      if (res.status === 404) {
        setState({ balance: '0', funded: false, loading: false, error: null });
        return;
      }
      if (!res.ok) {
        throw new Error(`Horizon error: HTTP ${res.status}`);
      }
      const data: { balances: HorizonBalance[] } = await res.json();
      const native = data.balances.find((b) => b.asset_type === 'native');
      setState({
        balance: native?.balance ?? '0',
        funded: true,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch balance.',
      }));
    }
  }, [address]);

  return { ...state, fetchBalance };
}
