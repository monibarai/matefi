#!/usr/bin/env bash
# scripts/deploy-all.sh — Build, deploy, and initialize all 5 ChessBet contracts.
# Usage:
#   RELAYER_PUBLIC_KEY=G...  TREASURY_ADDRESS=G...  ARBITER_ADDRESS=G...  ./scripts/deploy-all.sh
#
# ARBITER_ADDRESS defaults to TREASURY_ADDRESS if unset — the arbiter resolves
# Settlement disputes (contracts/settlement §"dispute"); use a dedicated key
# in production via `settlement.set_arbiter` after deploy, or set this env
# var before running.
#
# Prerequisites:
#   - stellar CLI installed and "deployer" key configured
#   - Rust wasm32v1-none target: rustup target add wasm32v1-none
#   - Deployer account funded on testnet

set -euo pipefail

NETWORK="testnet"
SOURCE="deployer"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

USDC_CONTRACT_ID="${USDC_CONTRACT_ID:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}"
RELAYER_PUBLIC_KEY="${RELAYER_PUBLIC_KEY:?RELAYER_PUBLIC_KEY must be set}"
TREASURY_ADDRESS="${TREASURY_ADDRESS:?TREASURY_ADDRESS must be set}"
ARBITER_ADDRESS="${ARBITER_ADDRESS:-$TREASURY_ADDRESS}"

CONTRACTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/contracts"
WASM_DIR="$CONTRACTS_DIR/target/wasm32v1-none/release"

echo "=== Building contracts ==="
cd "$CONTRACTS_DIR"
stellar contract build 2>&1

echo ""
echo "=== Deploying contracts ==="

echo "1/5 Deploying EscrowVault..."
ESCROW_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/escrow_vault.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks 2>&1 | grep -E '^C[A-Z2-7]{55}$' | tail -1)
echo "    EscrowVault: $ESCROW_ID"

echo "2/5 Deploying PredictionPool..."
POOL_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/prediction_pool.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks 2>&1 | grep -E '^C[A-Z2-7]{55}$' | tail -1)
echo "    PredictionPool: $POOL_ID"

echo "3/5 Deploying OracleGateway..."
ORACLE_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/oracle_gateway.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks 2>&1 | grep -E '^C[A-Z2-7]{55}$' | tail -1)
echo "    OracleGateway: $ORACLE_ID"

echo "4/5 Deploying Settlement..."
SETTLEMENT_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/settlement.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks 2>&1 | grep -E '^C[A-Z2-7]{55}$' | tail -1)
echo "    Settlement: $SETTLEMENT_ID"

echo "5/5 Deploying MatchRegistry..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm "$WASM_DIR/match_registry.wasm" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks 2>&1 | grep -E '^C[A-Z2-7]{55}$' | tail -1)
echo "    MatchRegistry: $REGISTRY_ID"

echo ""
echo "=== Initializing contracts ==="

echo "Initializing EscrowVault..."
stellar contract invoke --id "$ESCROW_ID" --source "$SOURCE" --network "$NETWORK" -- \
  initialize \
  --usdc_token "$USDC_CONTRACT_ID" \
  --settlement "$SETTLEMENT_ID" \
  --registry "$REGISTRY_ID" \
  --prediction_pool "$POOL_ID" \
  --treasury "$TREASURY_ADDRESS"

echo "Initializing PredictionPool..."
stellar contract invoke --id "$POOL_ID" --source "$SOURCE" --network "$NETWORK" -- \
  initialize \
  --usdc_token "$USDC_CONTRACT_ID" \
  --oracle "$ORACLE_ID" \
  --settlement "$SETTLEMENT_ID" \
  --registry "$REGISTRY_ID" \
  --escrow_vault "$ESCROW_ID" \
  --treasury "$TREASURY_ADDRESS"

echo "Initializing OracleGateway..."
stellar contract invoke --id "$ORACLE_ID" --source "$SOURCE" --network "$NETWORK" -- \
  initialize \
  --relayer "$RELAYER_PUBLIC_KEY" \
  --prediction_pool "$POOL_ID" \
  --settlement "$SETTLEMENT_ID"

echo "Initializing Settlement..."
stellar contract invoke --id "$SETTLEMENT_ID" --source "$SOURCE" --network "$NETWORK" -- \
  initialize \
  --usdc_token "$USDC_CONTRACT_ID" \
  --escrow_vault "$ESCROW_ID" \
  --prediction_pool "$POOL_ID" \
  --match_registry "$REGISTRY_ID" \
  --oracle "$ORACLE_ID" \
  --treasury "$TREASURY_ADDRESS" \
  --arbiter "$ARBITER_ADDRESS"

echo "Initializing MatchRegistry..."
stellar contract invoke --id "$REGISTRY_ID" --source "$SOURCE" --network "$NETWORK" -- \
  initialize \
  --usdc_token "$USDC_CONTRACT_ID" \
  --escrow_vault "$ESCROW_ID" \
  --prediction_pool "$POOL_ID" \
  --settlement "$SETTLEMENT_ID"

echo ""
echo "=== All contracts deployed and initialized! ==="

ADDRESSES=$(cat <<EOF
{
  "network": "testnet",
  "contracts": {
    "match_registry": "$REGISTRY_ID",
    "escrow_vault":   "$ESCROW_ID",
    "prediction_pool": "$POOL_ID",
    "oracle_gateway": "$ORACLE_ID",
    "settlement":     "$SETTLEMENT_ID",
    "usdc_sac":       "$USDC_CONTRACT_ID"
  }
}
EOF
)

echo "$ADDRESSES"

DOCS_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs"
mkdir -p "$DOCS_DIR"
echo "$ADDRESSES" > "$DOCS_DIR/contract-addresses.json"
echo ""
echo "Addresses saved to docs/contract-addresses.json"
echo ""
echo "=== Update relayer/.env ==="
echo "MATCH_REGISTRY_CONTRACT_ID=$REGISTRY_ID"
echo "ESCROW_VAULT_CONTRACT_ID=$ESCROW_ID"
echo "PREDICTION_POOL_CONTRACT_ID=$POOL_ID"
echo "ORACLE_GATEWAY_CONTRACT_ID=$ORACLE_ID"
echo "SETTLEMENT_CONTRACT_ID=$SETTLEMENT_ID"
echo "USDC_CONTRACT_ID=$USDC_CONTRACT_ID"
echo ""
echo "=== Update frontend/.env.local ==="
echo "NEXT_PUBLIC_ARBITER_ADDRESS=$ARBITER_ADDRESS"
