// Stellar SDK + Stellar Wallets Kit setup.
//
// - The RPC server is isomorphic and safe to construct anywhere.
// - The wallets kit ships browser-only code (custom elements), so it is
//   loaded lazily via dynamic import and guarded against SSR.

import { rpc } from '@stellar/stellar-sdk';
import type { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';

// --- Environment ------------------------------------------------------------

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';

/** Wallet id for Freighter — mirrors FREIGHTER_ID from the kit. */
export const FREIGHTER_WALLET_ID = 'freighter';

// --- Soroban RPC ------------------------------------------------------------

let server: rpc.Server | null = null;

export function getRpcServer(): rpc.Server {
  if (!server) {
    server = new rpc.Server(SOROBAN_RPC_URL, {
      allowHttp: SOROBAN_RPC_URL.startsWith('http://'),
    });
  }
  return server;
}

// --- Stellar Wallets Kit (client-side only) ----------------------------------

let kitPromise: Promise<StellarWalletsKit> | null = null;

/**
 * Lazily creates the kit singleton. Rejects on the server so SSR/prerender
 * never touches wallet code.
 */
export function getKit(): Promise<StellarWalletsKit> {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new Error('Stellar Wallets Kit is only available in the browser.'),
    );
  }
  if (!kitPromise) {
    kitPromise = (async () => {
      const { StellarWalletsKit, WalletNetwork, FreighterModule, FREIGHTER_ID } =
        await import('@creit.tech/stellar-wallets-kit');
      return new StellarWalletsKit({
        network: WalletNetwork.TESTNET,
        selectedWalletId: FREIGHTER_ID,
        modules: [new FreighterModule()],
      });
    })();
  }
  return kitPromise;
}

/** Truncate a Stellar address for display: GABCD…WXYZ */
export function shortAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return '—';
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** stellar.expert network segment, derived from the configured passphrase. */
const EXPLORER_NETWORK = NETWORK_PASSPHRASE.includes('Public') ? 'public' : 'testnet';

/** Link to a transaction on stellar.expert (null when no hash). */
export function txExplorerUrl(hash: string | null | undefined): string | null {
  if (!hash) return null;
  return `https://stellar.expert/explorer/${EXPLORER_NETWORK}/tx/${hash}`;
}
