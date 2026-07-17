'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { WalletButton } from './WalletButton';

const NAV_LINKS = [
  { href: '/lobby', label: 'Lobby' },
  { href: '/create', label: 'Create Match' },
  { href: '/history', label: 'History' },
  { href: '/wallet', label: 'Wallet' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-ink/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <Image
            src="/matefi-knight.png"
            alt="MateFi"
            width={28}
            height={44}
            className="h-7 w-auto group-hover:scale-105 transition-transform"
            priority
          />
          <span className="font-display text-lg font-bold tracking-[1px] text-bone">
            MATE<span className="text-lock">FI</span>
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
                className={`px-3 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors ${
                  active
                    ? 'bg-panel text-lock'
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
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
