'use client';

// Freighter wallet integration via @creit.tech/stellar-wallets-kit,
// persisted with zustand so the session survives reloads.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getKit } from '@/lib/stellar';

interface WalletStore {
  address: string | null;
  walletId: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      address: null,
      walletId: null,
      connecting: false,
      error: null,

      connect: async () => {
        if (get().connecting) return;
        set({ connecting: true, error: null });
        try {
          const kit = await getKit();
          await kit.openModal({
            modalTitle: 'Connect a Stellar wallet',
            onWalletSelected: async (option) => {
              try {
                kit.setWallet(option.id);
                const { address } = await kit.getAddress();
                set({ address, walletId: option.id, connecting: false, error: null });
              } catch (e) {
                set({
                  connecting: false,
                  error: e instanceof Error ? e.message : 'Failed to get wallet address.',
                });
              }
            },
            onClosed: () => set({ connecting: false }),
          });
        } catch (e) {
          set({
            connecting: false,
            error: e instanceof Error ? e.message : 'Failed to open wallet modal.',
          });
        }
      },

      disconnect: async () => {
        try {
          const kit = await getKit();
          await kit.disconnect();
        } catch {
          // kit not initialised / SSR — nothing to tear down
        }
        set({ address: null, walletId: null, error: null });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'matefi-wallet',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ address: s.address, walletId: s.walletId }),
    },
  ),
);

/**
 * Restore the kit's selected wallet from the persisted session before
 * signing — called by code paths that sign without going through connect().
 */
export async function ensureKitWallet(): Promise<void> {
  const { walletId } = useWalletStore.getState();
  if (!walletId) return;
  try {
    const kit = await getKit();
    kit.setWallet(walletId);
  } catch {
    // browser-only guard — ignore on SSR
  }
}

/** Hook facade used across the app. */
export function useWallet() {
  const address = useWalletStore((s) => s.address);
  const connecting = useWalletStore((s) => s.connecting);
  const error = useWalletStore((s) => s.error);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const clearError = useWalletStore((s) => s.clearError);
  return { address, connecting, error, connect, disconnect, clearError };
}
