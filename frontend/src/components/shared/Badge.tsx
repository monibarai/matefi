// Small pill badge — same visual language as the ws-status/tag pills already
// used on the match page (rounded-full border, font-mono text-[10px]).

export type BadgeTone = 'warn' | 'danger' | 'info' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  warn: 'border-lock/30 text-lock',
  danger: 'border-short/30 text-short',
  info: 'border-long/30 text-long',
  neutral: 'border-edge text-bone-faint',
};

interface BadgeProps {
  tone?: BadgeTone;
  title?: string;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
