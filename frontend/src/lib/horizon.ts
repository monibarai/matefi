import { Horizon, Networks } from '@stellar/stellar-sdk';

export const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';
export const TESTNET_PASSPHRASE = Networks.TESTNET; // 'Test SDF Network ; September 2015'

let _server: Horizon.Server | null = null;

export function getHorizonServer(): Horizon.Server {
  if (!_server) {
    _server = new Horizon.Server(HORIZON_TESTNET_URL);
  }
  return _server;
}
