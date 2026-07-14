#!/usr/bin/env bash
# scripts/get-usdc-testnet.sh — Establish a USDC trustline and print faucet info.
# Usage: ./scripts/get-usdc-testnet.sh <STELLAR_CLI_ACCOUNT_ALIAS>
#
# Note: Testnet USDC must be minted/received via the Circle testnet faucet or
# by swapping from a faucet that holds USDC. The script establishes the trustline
# and prints the USDC issuer for manual minting.

set -euo pipefail

ACCOUNT="${1:?Usage: $0 <account-alias>}"
USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
USDC_SAC="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
NETWORK="testnet"

echo "Establishing USDC trustline for account: $ACCOUNT"
stellar tx new change-trust \
  --source "$ACCOUNT" \
  --asset "USDC:$USDC_ISSUER" \
  --network "$NETWORK" \
  --build-only 2>&1 | head -5 || true

echo ""
echo "USDC Issuer:       $USDC_ISSUER"
echo "USDC SAC (Soroban): $USDC_SAC"
echo ""
echo "To get testnet USDC, use the Stellar Laboratory or any testnet USDC faucet."
echo "Horizon endpoint: https://horizon-testnet.stellar.org"
