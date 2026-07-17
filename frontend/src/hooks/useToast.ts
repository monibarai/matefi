'use client';

// Global toast queue — a plain zustand store (no persistence, ephemeral by
// design) so any module, component or non-component code alike, can push a
// notification without needing a React context provider in the tree.

import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (message: string, variant?: ToastVariant) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_TTL_MS = 4500;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (message, variant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({ toasts: [...get().toasts, { id, message, variant }] });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(id), DEFAULT_TTL_MS);
    }
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Imperative helper for use outside components (hooks, lib functions). */
export function toast(message: string, variant: ToastVariant = 'info'): string {
  return useToastStore.getState().push(message, variant);
}

/** Hook facade for components that just want to fire toasts. */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return { toast: push };
}
