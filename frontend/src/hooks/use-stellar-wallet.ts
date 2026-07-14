'use client';

// Level 1 spec hook — useWallet(): connect / disconnect / refreshBalance / sendXlm.
// Composes the stellar-wallet.ts (Freighter) and stellar-sdk.ts (Horizon) helpers.

import { useState, useCallback } from 'react';
import {
  detectFreighter,
  connectWallet,
  getWalletAddress,
  signTx,
} from '@/lib/stellar-wallet';
import { fetchXlmBalance, buildPaymentXdr, submitSignedTx } from '@/lib/stellar-sdk';

interface WalletState {
  address: string | null;
  balance: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
}

const INITIAL: WalletState = {
  address: null,
  balance: null,
  isConnected: false,
  isLoading: false,
  error: null,
};

export function useWallet() {
  const [state, setState] = useState<WalletState>(INITIAL);

  const refreshBalance = useCallback(async (addr?: string) => {
    const target = addr ?? state.address;
    if (!target) return;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const balance = await fetchXlmBalance(target);
      setState((s) => ({ ...s, balance, isLoading: false }));
    } catch (e) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: e instanceof Error ? e.message : 'Failed to fetch balance.',
      }));
    }
  }, [state.address]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const installed = await detectFreighter();
      if (!installed) {
        setState({ ...INITIAL, error: 'Freighter extension not detected.' });
        return;
      }
      const address = await connectWallet();
      setState({
        address,
        balance: null,
        isConnected: true,
        isLoading: true,
        error: null,
      });
      await refreshBalance(address);
    } catch (e) {
      setState({
        ...INITIAL,
        error: e instanceof Error ? e.message : 'Connection failed.',
      });
    }
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    setState(INITIAL);
  }, []);

  const sendXlm = useCallback(
    async (to: string, amount: string): Promise<{ hash: string }> => {
      if (!state.address) {
        throw new Error('Wallet not connected.');
      }
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const xdr = await buildPaymentXdr(state.address, to, amount);
        const signedXdr = await signTx(xdr);
        const result = await submitSignedTx(signedXdr);
        setState((s) => ({ ...s, isLoading: false }));
        // Refresh balance after a successful send (best-effort).
        void refreshBalance(state.address);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Transaction failed.';
        setState((s) => ({ ...s, isLoading: false, error: message }));
        throw new Error(message);
      }
    },
    [state.address, refreshBalance],
  );

  return { ...state, connect, disconnect, refreshBalance, sendXlm, getWalletAddress };
}
