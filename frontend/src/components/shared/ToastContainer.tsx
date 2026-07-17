'use client';

import { useToastStore, type ToastVariant } from '@/hooks/useToast';

const VARIANT_STYLE: Record<ToastVariant, string> = {
  success: 'border-long/40 bg-long/10 text-long',
  error: 'border-short/40 bg-short/10 text-short',
  info: 'border-lock/40 bg-lock/10 text-lock',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-xs flex-col gap-2 sm:bottom-6 sm:right-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start justify-between gap-3 border px-3.5 py-2.5 font-mono text-xs tracking-[0.02em] shadow-panel animate-rise-in ${VARIANT_STYLE[t.variant]}`}
        >
          <span className="leading-relaxed">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
