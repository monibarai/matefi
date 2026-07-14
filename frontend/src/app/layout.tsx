import type { Metadata } from 'next';
import { Fraunces, Spline_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Navbar } from '@/components/shared/Navbar';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['opsz'],
  weight: 'variable',
  style: ['normal', 'italic'],
});

const body = Spline_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: 'variable',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'MateFi — On-Chain Chess Betting on Stellar',
  description:
    'P2P chess betting with a live parimutuel prediction market. USDC on Stellar Soroban Testnet.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        {/* Wallet state is a persisted zustand store (src/hooks/useWallet) —
            no React context provider is required, components subscribe directly. */}
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6">{children}</main>
        <footer className="border-t border-edge/60 py-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
            <p className="tag">MateFi · Stellar Soroban Testnet</p>
            <p className="tag">All USDC. All on-chain.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
