// src/stellar/signer.ts — relayer keypair management.
import { Keypair } from '@stellar/stellar-sdk';
import { config } from '../config';

let keypair: Keypair | null | undefined;

/** Lazily build the relayer keypair. Returns null (with a warning) when unconfigured. */
export function getRelayerKeypair(): Keypair | null {
  if (keypair !== undefined) return keypair;
  if (!config.RELAYER_SECRET) {
    console.warn('[stellar] RELAYER_SECRET not set — transaction signing disabled');
    keypair = null;
    return keypair;
  }
  try {
    keypair = Keypair.fromSecret(config.RELAYER_SECRET);
    console.log(`[stellar] relayer key loaded: ${keypair.publicKey()}`);
  } catch (e) {
    console.error('[stellar] invalid RELAYER_SECRET:', (e as Error).message);
    keypair = null;
  }
  return keypair;
}

export function signTransaction(tx: { sign(kp: Keypair): void }): boolean {
  const kp = getRelayerKeypair();
  if (!kp) return false;
  tx.sign(kp);
  return true;
}
