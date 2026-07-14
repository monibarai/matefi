#!/usr/bin/env bash
# scripts/fund-testnet.sh — Fund a Stellar testnet account via Friendbot.
# Usage: ./scripts/fund-testnet.sh <PUBLIC_KEY>

set -euo pipefail

ADDRESS="${1:?Usage: $0 <PUBLIC_KEY>}"
echo "Funding $ADDRESS via Friendbot..."
curl -s "https://friendbot.stellar.org?addr=$ADDRESS" | python3 -c "
import json, sys
r = json.load(sys.stdin)
if 'hash' in r:
    print('Funded! tx:', r['hash'])
else:
    print('Response:', json.dumps(r, indent=2))
"
