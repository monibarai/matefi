/**
 * Unit tests for stellar.ts configuration helpers.
 * Verifies correct defaults for Testnet targeting.
 */

jest.mock('@stellar/stellar-sdk', () => ({
  rpc: {
    Server: jest.fn().mockImplementation((url: string) => ({ url })),
  },
}));

jest.mock('@creit.tech/stellar-wallets-kit', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NETWORK_PASSPHRASE, SOROBAN_RPC_URL, shortAddress, txExplorerUrl } = require('@/lib/stellar');

describe('stellar.ts constants', () => {
  test('NETWORK_PASSPHRASE is Stellar Testnet passphrase', () => {
    expect(NETWORK_PASSPHRASE).toBe('Test SDF Network ; September 2015');
  });

  test('SOROBAN_RPC_URL targets testnet by default', () => {
    expect(SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
  });
});

describe('shortAddress', () => {
  const SAMPLE = 'GAHLQHGRSB7MFVXUZXLNXJHPOBXLXGJLCVXR5TJWFXBWUMLXL6HIFQHZ';

  test('truncates a full G-address with ellipsis', () => {
    const result = shortAddress(SAMPLE);
    expect(result).toMatch(/^G.{3}….*Z$/);
    expect(result.length).toBeLessThan(SAMPLE.length);
  });

  test('returns "—" for null', () => {
    expect(shortAddress(null)).toBe('—');
  });

  test('returns "—" for undefined', () => {
    expect(shortAddress(undefined)).toBe('—');
  });

  test('returns address unchanged when shorter than 2*chars+1', () => {
    const short = 'GABC';
    expect(shortAddress(short)).toBe(short);
  });

  test('respects custom chars parameter', () => {
    const result = shortAddress(SAMPLE, 6);
    expect(result.startsWith(SAMPLE.slice(0, 6))).toBe(true);
    expect(result.endsWith(SAMPLE.slice(-6))).toBe(true);
  });
});

describe('txExplorerUrl', () => {
  test('builds testnet explorer URL from hash', () => {
    const hash = 'abc123';
    const url = txExplorerUrl(hash);
    expect(url).toBe(`https://stellar.expert/explorer/testnet/tx/${hash}`);
  });

  test('returns null for null hash', () => {
    expect(txExplorerUrl(null)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(txExplorerUrl('')).toBeNull();
  });
});
