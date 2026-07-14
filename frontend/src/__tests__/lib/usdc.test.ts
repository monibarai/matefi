/**
 * Unit tests for USDC conversion utilities in src/lib/usdc.ts
 * These functions are pure math — no network or wallet required.
 */

// Mock @stellar/stellar-sdk so Jest doesn't try to process ESM
jest.mock('@stellar/stellar-sdk', () => ({
  BASE_FEE: '100',
  Contract: jest.fn(),
  TransactionBuilder: jest.fn(),
  nativeToScVal: jest.fn(),
  scValToNative: jest.fn(),
  rpc: {
    Server: jest.fn(),
    Api: { isSimulationSuccess: jest.fn() },
  },
}));

jest.mock('@/lib/stellar', () => ({
  getRpcServer: jest.fn(),
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usdcToStroops, stroopsToUsdc, formatUsdc, STROOPS_PER_USDC, USDC_DECIMALS } =
  require('@/lib/usdc');

describe('USDC constants', () => {
  test('USDC_DECIMALS is 7', () => {
    expect(USDC_DECIMALS).toBe(7);
  });

  test('STROOPS_PER_USDC is 10_000_000n', () => {
    expect(STROOPS_PER_USDC).toBe(10_000_000n);
  });
});

describe('usdcToStroops', () => {
  test('converts whole number to stroops', () => {
    expect(usdcToStroops(1)).toBe(10_000_000n);
  });

  test('converts decimal string to stroops without float drift', () => {
    expect(usdcToStroops('12.5')).toBe(125_000_000n);
  });

  test('converts "0.1" correctly', () => {
    expect(usdcToStroops('0.1')).toBe(1_000_000n);
  });

  test('converts large amount', () => {
    expect(usdcToStroops(100)).toBe(1_000_000_000n);
  });

  test('converts "0.0000001" (minimum unit)', () => {
    expect(usdcToStroops('0.0000001')).toBe(1n);
  });

  test('throws on negative input', () => {
    expect(() => usdcToStroops('-5')).toThrow();
  });

  test('throws on non-numeric input', () => {
    expect(() => usdcToStroops('abc')).toThrow();
  });
});

describe('stroopsToUsdc', () => {
  test('converts stroops to USDC number', () => {
    expect(stroopsToUsdc(10_000_000n)).toBe(1);
  });

  test('converts partial stroops', () => {
    expect(stroopsToUsdc(5_000_000n)).toBe(0.5);
  });

  test('handles number input', () => {
    expect(stroopsToUsdc(10_000_000)).toBe(1);
  });

  test('handles string input', () => {
    expect(stroopsToUsdc('10000000')).toBe(1);
  });

  test('handles zero', () => {
    expect(stroopsToUsdc(0)).toBe(0);
  });
});

describe('formatUsdc', () => {
  test('formats 1 USDC with 2 decimals', () => {
    expect(formatUsdc(10_000_000n)).toBe('1.00');
  });

  test('formats with custom decimals', () => {
    expect(formatUsdc(10_000_000n, { decimals: 4 })).toBe('1.0000');
  });

  test('formats large compact value', () => {
    const result = formatUsdc(100_000_000_000n, { compact: true });
    expect(result).toMatch(/10K|10,000/);
  });
});
