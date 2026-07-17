import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import Image from 'next/image';
import { Navbar } from '@/components/shared/Navbar';
import { ToastContainer } from '@/components/shared/ToastContainer';
import './globals.css';

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const body = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '700'],
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
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MateFi',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
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
            <div className="flex items-center gap-2">
              <Image src="/matefi-knight.png" alt="MateFi" width={16} height={25} className="h-4 w-auto opacity-80" />
              <p className="tag">MateFi · Stellar Soroban Testnet</p>
            </div>
            <p className="tag">All USDC. All on-chain.</p>
          </div>
        </footer>
        <ToastContainer />
      </body>
    </html>
  );
}
