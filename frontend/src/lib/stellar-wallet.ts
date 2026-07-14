// Freighter wallet integration — explicit @stellar/freighter-api imports.
//
// This module exposes the Level 1 spec API (detectFreighter / connectWallet /
// getWalletAddress / signTx) on top of the Testnet configuration. It mirrors
// the logic used by the useFreighterWallet hook so both entry points behave
// identically.

import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  signTransaction,
} from '@stellar/freighter-api';

/** Stellar Testnet network passphrase. */
export const STELLAR_TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/** Horizon Testnet base URL. */
export const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';

/** True when the Freighter extension is installed and reachable. */
export async function detectFreighter(): Promise<boolean> {
  try {
    const result = await isConnected();
    return result.isConnected === true;
  } catch {
    return false;
  }
}

/**
 * Request permission (if not already granted) and return the wallet address.
 * Uses isAllowed() to avoid a redundant prompt, then requestAccess()/getAddress().
 */
export async function connectWallet(): Promise<string> {
  const allowed = await isAllowed();

  if (!allowed.isAllowed) {
    const access = await requestAccess();
    if (access.error) {
      throw new Error(String(access.error));
    }
    if (!access.address) {
      throw new Error('No address returned from Freighter.');
    }
    return access.address;
  }

  const addr = await getAddress();
  if (addr.error) {
    throw new Error(String(addr.error));
  }
  if (!addr.address) {
    throw new Error('No address returned from Freighter.');
  }
  return addr.address;
}

/**
 * Return the current wallet address when access is already granted, otherwise
 * null. Does not prompt the user.
 */
export async function getWalletAddress(): Promise<string | null> {
  try {
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return null;
    const addr = await getAddress();
    if (addr.error || !addr.address) return null;
    return addr.address;
  } catch {
    return null;
  }
}

/** Sign a base64 transaction XDR with Freighter on Testnet, returning the signed XDR. */
export async function signTx(xdr: string): Promise<string> {
  const { signedTxXdr, error } = await signTransaction(xdr, {
    networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
  });
  if (error) {
    throw new Error(String(error));
  }
  if (!signedTxXdr) {
    throw new Error('Signing cancelled or failed — no signed XDR returned.');
  }
  return signedTxXdr;
}
