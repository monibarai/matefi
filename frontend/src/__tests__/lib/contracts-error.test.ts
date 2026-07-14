/**
 * Unit tests for ContractsNotDeployedError and contractsConfigured flag.
 * These test the graceful degradation path when env vars are absent.
 */

jest.mock('@stellar/stellar-sdk', () => ({
  Contract: jest.fn(),
  TransactionBuilder: jest.fn(),
  nativeToScVal: jest.fn(),
  scValToNative: jest.fn(),
  xdr: { ScVal: { scvVec: jest.fn(), scvSymbol: jest.fn() } },
  rpc: {
    Server: jest.fn(),
    Api: { isSimulationError: jest.fn(), GetTransactionStatus: { NOT_FOUND: 'NOT_FOUND', FAILED: 'FAILED' } },
    assembleTransaction: jest.fn(),
  },
}));

jest.mock('@/lib/stellar', () => ({
  getRpcServer: jest.fn(),
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  getKit: jest.fn(),
}));

jest.mock('@/hooks/useWallet', () => ({
  ensureKitWallet: jest.fn(),
}));

jest.mock('@/lib/usdc', () => ({
  usdcToStroops: jest.fn().mockReturnValue(10_000_000n),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ContractsNotDeployedError } = require('@/lib/contracts');

describe('ContractsNotDeployedError', () => {
  test('is an instance of Error', () => {
    const err = new ContractsNotDeployedError('NEXT_PUBLIC_MATCH_REGISTRY_ID');
    expect(err).toBeInstanceOf(Error);
  });

  test('has correct name', () => {
    const err = new ContractsNotDeployedError('NEXT_PUBLIC_MATCH_REGISTRY_ID');
    expect(err.name).toBe('ContractsNotDeployedError');
  });

  test('message includes the missing env var name', () => {
    const varName = 'NEXT_PUBLIC_PREDICTION_POOL_ID';
    const err = new ContractsNotDeployedError(varName);
    expect(err.message).toContain(varName);
  });

  test('message includes deployment instructions', () => {
    const err = new ContractsNotDeployedError('NEXT_PUBLIC_SETTLEMENT_ID');
    expect(err.message).toContain('Deploy the Soroban contracts');
  });
});

describe('horizon.ts constants', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.mock('@stellar/stellar-sdk', () => ({
      Horizon: {
        Server: jest.fn().mockImplementation((url: string) => ({ _url: url })),
      },
      Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    }));
  });

  test('HORIZON_TESTNET_URL is correct', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HORIZON_TESTNET_URL } = require('@/lib/horizon');
    expect(HORIZON_TESTNET_URL).toBe('https://horizon-testnet.stellar.org');
  });

  test('TESTNET_PASSPHRASE matches Stellar testnet', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TESTNET_PASSPHRASE } = require('@/lib/horizon');
    expect(TESTNET_PASSPHRASE).toBe('Test SDF Network ; September 2015');
  });
});
