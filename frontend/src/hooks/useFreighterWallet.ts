'use client';

import { useState, useCallback, useEffect } from 'react';
import { isConnected, requestAccess } from '@stellar/freighter-api';

export type WalletStatus =
  | 'checking'
  | 'not_installed'
  | 'disconnected'
  | 'connecting'
  | 'connected';

interface FreighterWalletState {
  status: WalletStatus;
  address: string | null;
  error: string | null;
}

export function useFreighterWallet() {
  const [state, setState] = useState<FreighterWalletState>({
    status: 'checking',
    address: null,
    error: null,
  });

  useEffect(() => {
    isConnected()
      .then((result) => {
        setState((s) => ({
          ...s,
          status: result.isConnected ? 'disconnected' : 'not_installed',
        }));
      })
      .catch(() => {
        setState((s) => ({ ...s, status: 'not_installed' }));
      });
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, status: 'connecting', error: null }));
    try {
      const connResult = await isConnected();
      if (!connResult.isConnected) {
        setState({ status: 'not_installed', address: null, error: null });
        return;
      }
      const accessResult = await requestAccess();
      if (accessResult.error) {
        setState({
          status: 'disconnected',
          address: null,
          error: String(accessResult.error),
        });
        return;
      }
      if (!accessResult.address) {
        setState({
          status: 'disconnected',
          address: null,
          error: 'No address returned from Freighter.',
        });
        return;
      }
      setState({ status: 'connected', address: accessResult.address, error: null });
    } catch (e) {
      setState({
        status: 'disconnected',
        address: null,
        error: e instanceof Error ? e.message : 'Connection failed.',
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ status: 'disconnected', address: null, error: null });
  }, []);

  return { ...state, connect, disconnect };
}
