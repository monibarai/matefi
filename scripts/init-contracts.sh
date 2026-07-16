#!/usr/bin/env bash
# scripts/init-contracts.sh — Re-initialize already-deployed contracts.
# Use when you need to re-run initialization (e.g., fresh deployment IDs).
# Reads contract IDs from docs/contract-addresses.json.

set -euo pipefail

DOCS="$(cd "$(dirname "$0")/.." && pwd)/docs/contract-addresses.json"
if [[ ! -f "$DOCS" ]]; then
  echo "Error: $DOCS not found. Run deploy-all.sh first." >&2
  exit 1
fi

REGISTRY_ID=$(python3 -c "import json; d=json.load(open('$DOCS')); print(d['contracts']['match_registry'])")
ESCROW_ID=$(python3 -c "import json; d=json.load(open('$DOCS')); print(d['contracts']['escrow_vault'])")
POOL_ID=$(python3 -c "import json; d=json.load(open('$DOCS')); print(d['contracts']['prediction_pool'])")
ORACLE_ID=$(python3 -c "import json; d=json.load(open('$DOCS')); print(d['contracts']['oracle_gateway'])")
SETTLEMENT_ID=$(python3 -c "import json; d=json.load(open('$DOCS')); print(d['contracts']['settlement'])")
USDC_CONTRACT_ID=$(python3 -c "import json; d=json.load(open('$DOCS')); print(d['contracts']['usdc_sac'])")

RELAYER_PUBLIC_KEY="${RELAYER_PUBLIC_KEY:?RELAYER_PUBLIC_KEY must be set}"
TREASURY_ADDRESS="${TREASURY_ADDRESS:?TREASURY_ADDRESS must be set}"
ARBITER_ADDRESS="${ARBITER_ADDRESS:-$TREASURY_ADDRESS}"
SOURCE="${SOURCE:-deployer}"
NETWORK="${NETWORK:-testnet}"

echo "Re-initializing contracts on $NETWORK..."
echo "  Registry:   $REGISTRY_ID"
echo "  Escrow:     $ESCROW_ID"
echo "  Pool:       $POOL_ID"
echo "  Oracle:     $ORACLE_ID"
echo "  Settlement: $SETTLEMENT_ID"

stellar contract invoke --id "$ESCROW_ID" --source "$SOURCE" --network "$NETWORK" -- initialize \
  --usdc_token "$USDC_CONTRACT_ID" --settlement "$SETTLEMENT_ID" --registry "$REGISTRY_ID" \
  --prediction_pool "$POOL_ID" --treasury "$TREASURY_ADDRESS"

stellar contract invoke --id "$POOL_ID" --source "$SOURCE" --network "$NETWORK" -- initialize \
  --usdc_token "$USDC_CONTRACT_ID" --oracle "$ORACLE_ID" --settlement "$SETTLEMENT_ID" \
  --registry "$REGISTRY_ID" --escrow_vault "$ESCROW_ID" --treasury "$TREASURY_ADDRESS"

stellar contract invoke --id "$ORACLE_ID" --source "$SOURCE" --network "$NETWORK" -- initialize \
  --relayer "$RELAYER_PUBLIC_KEY" --prediction_pool "$POOL_ID" --settlement "$SETTLEMENT_ID"

stellar contract invoke --id "$SETTLEMENT_ID" --source "$SOURCE" --network "$NETWORK" -- initialize \
  --usdc_token "$USDC_CONTRACT_ID" --escrow_vault "$ESCROW_ID" --prediction_pool "$POOL_ID" \
  --match_registry "$REGISTRY_ID" --oracle "$ORACLE_ID" --treasury "$TREASURY_ADDRESS" \
  --arbiter "$ARBITER_ADDRESS"

stellar contract invoke --id "$REGISTRY_ID" --source "$SOURCE" --network "$NETWORK" -- initialize \
  --usdc_token "$USDC_CONTRACT_ID" --escrow_vault "$ESCROW_ID" \
  --prediction_pool "$POOL_ID" --settlement "$SETTLEMENT_ID"

echo "Done."
