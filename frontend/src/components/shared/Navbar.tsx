'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from './WalletButton';
import { USDCBalance } from './USDCBalance';
import { useMounted } from '@/hooks/useMounted';

const NAV_LINKS = [
  { href: '/', label: 'Lobby' },
  { href: '/create', label: 'Create Match' },
  { href: '/history', label: 'History' },
  { href: '/wallet', label: 'Wallet' },
];

export function Navbar() {
  const pathname = usePathname();
  const mounted = useMounted();

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-ink/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-lock text-ink font-mono font-bold text-sm">
            ♟
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-bone">
            Mate<span className="text-lock">Fi</span>
          </span>
        </Link>

        {/* Nav links — hidden on mobile */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-3 py-1.5 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? 'bg-panel text-bone'
                    : 'text-bone-faint hover:text-bone-dim'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {mounted && <USDCBalance />}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
