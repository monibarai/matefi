# MateFi — Soroban Smart Contracts

Five Rust/Soroban contracts that power the on-chain layer of **MateFi**, a P2P chess-betting and live-prediction-market dApp on Stellar Testnet.

---

## Contract Architecture

```
MatchRegistry ──creates/joins──► EscrowVault  (holds USDC deposits)
      │                             ▲
      │  opens market               │  release / refund
      ▼                             │
PredictionPool ◄──── OracleGateway  │
      │  settle                     │
      └──────► Settlement ──────────┘
                    │  complete_match
                    ▼
               MatchRegistry
```

| Contract | Address (Testnet) | Purpose |
|---|---|---|
| `match_registry` | `CALMF5ALUJ4CQMTQZFPD7IGOYVMOWFWAX2ZUZD45T4S5RTYRSO7KQM27` | State machine: Open → Active → Completed |
| `escrow_vault` | `CA2MU6Y6JP5ZYCX44DNVW2IQIXNQWUNTWJUEBPGBQZHR2OW3DJAAJVUB` | Holds player USDC deposits |
| `prediction_pool` | `CBN5AFLUV6GFBWTEC7R5EYHQYMLV3O2Y474VGCQIE3CRSXSCIUWM6VIP` | Parimutuel trading market per match |
| `oracle_gateway` | `CDMSMCWOV22QU5GYFWCNCIZSF646SNBRC46HJUWZMIPSGPOYUWJZDTLU` | Receives Stockfish evaluations, locks market |
| `settlement` | `CBT5K7PFCV3JCDUVAQZBWYK7YXBXSZ7TKSH2ZMPZC62FALNBAFGGPXYX` | Distributes prizes, closes match on-chain |

---

## Folder Structure

```
contracts/
├── Cargo.toml          # workspace — all 5 crates
├── Cargo.lock
├── Makefile
├── match_registry/
│   └── src/
│       ├── lib.rs      # contract entry points
│       ├── state.rs    # storage types (Match, MatchState, DataKey)
│       ├── events.rs   # emitted events
│       ├── errors.rs   # typed error codes
│       └── test.rs     # integration tests
├── escrow_vault/  (same structure)
├── prediction_pool/ (same structure)
├── oracle_gateway/ (same structure)
└── settlement/    (same structure)
```

---

## Public Interface

### MatchRegistry
| Function | Description |
|---|---|
| `initialize(admin, escrow, pool, settlement)` | One-time setup |
| `create_match(player_a, bet_amount, time_control)` → `u64` | Creates match, transfers USDC to escrow |
| `join_match(match_id, player_b)` | Player B joins, activates match, opens market |
| `cancel_match(match_id, player_a)` | Player A cancels open match, refunds deposit |
| `complete_match(match_id)` | Called by Settlement only — marks Completed |
| `get_match(match_id)` → `Match` | Read match state |

### EscrowVault
| Function | Description |
|---|---|
| `initialize(admin, registry, settlement, usdc)` | One-time setup |
| `record_deposit(match_id, player, amount)` | Records player's locked USDC |
| `add_bonus(match_id, amount)` | Flywheel: trading fees added to prize pool |
| `release(match_id, winner, amount)` | Pays winner net of protocol fee |
| `release_draw(match_id)` | Returns deposits to both players |
| `refund(match_id, player, amount)` | Returns deposit on cancel |
| `get_record(match_id)` → `DepositRecord` | Read vault record |

### PredictionPool
| Function | Description |
|---|---|
| `initialize(admin, registry, settlement, usdc, treasury)` | One-time setup |
| `open_market(match_id, player_a, player_b)` | Opens trading market |
| `buy_outcome(match_id, trader, outcome, amount)` | Places a prediction bet |
| `lock_market(match_id, eval_score)` | Locks market — called by OracleGateway |
| `settle(match_id, winner)` → `(i128, i128)` | Distributes pool on game end |
| `pay_trader(match_id, trader, outcome)` → `i128` | Pays individual winning trader |
| `get_market(match_id)` → `Market` | Read market state |
| `get_position(match_id, trader, outcome)` → `i128` | Read trader's position |
| `get_odds(match_id)` → `(u32, u32, u32)` | Live implied probabilities (0–100) |

### OracleGateway
| Function | Description |
|---|---|
| `initialize(relayer, pool, settlement)` | One-time setup |
| `post_evaluation(match_id, fen, depth, score)` | Relayer posts Stockfish eval |
| `post_result(match_id, winner)` | Relayer posts final game result |
| `set_threshold(caller, new_threshold)` | Change centipawn lock threshold (relayer only) |
| `set_confirmations(caller, new_confirmations)` | Change confirmation count (relayer only) |
| `get_threshold()` → `i32` | Current threshold (default: 250) |
| `get_confirmations()` → `u32` | Current required confirmations (default: 3) |
| `get_eval(match_id, sequence)` → `Option<EvalRecord>` | Read stored evaluation |

### Settlement
| Function | Description |
|---|---|
| `initialize(admin, registry, escrow, pool, oracle, treasury, usdc)` | One-time setup |
| `execute(match_id, winner)` | Full settlement: pool → escrow → registry → trader payouts |

---

## Prerequisites

```bash
# 1. Rust (stable, ≥ 1.82)
rustup update stable

# 2. WASM target for Soroban SDK 26.x
rustup target add wasm32v1-none

# 3. Stellar CLI ≥ 26
cargo install --locked stellar-cli --features opt
```

---

## Build

```bash
cd contracts
make build
# WASMs appear in target/wasm32v1-none/release/
```

---

## Test

```bash
cd contracts
make test
```

Expected output: all 50+ test cases pass across the 5 contracts.

---

## Deploy to Testnet

### Option A — individual contracts via Makefile

```bash
export STELLAR_SECRET_KEY=S...your_secret...
cd contracts
make deploy
```

### Option B — sequenced deploy + init (recommended)

```bash
# From repo root
export STELLAR_SECRET_KEY=S...
export STELLAR_RELAYER_SECRET=S...
export STELLAR_TREASURY=G...
export STELLAR_USDC_SAC=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA

scripts/deploy-all.sh      # deploys WASMs, writes contract IDs
scripts/init-contracts.sh  # calls initialize() on each contract
```

After deploying, copy the contract IDs into `frontend/.env.local`.

---

## Required Environment Variables

| Variable | Description |
|---|---|
| `STELLAR_SECRET_KEY` | Deployer account secret key (S...) |
| `STELLAR_NETWORK` | `testnet` (default) or `mainnet` |
| `STELLAR_RELAYER_SECRET` | Relayer account secret (whitelisted in OracleGateway) |
| `STELLAR_TREASURY` | Treasury G-address (receives protocol fees) |
| `STELLAR_USDC_SAC` | USDC Stellar Asset Contract address |

---

## Security Notes

- **Access control:** Every gated function uses `require_auth()` or checks against an admin/relayer address stored at initialization.
- **Re-entrancy:** Soroban's contract model prevents classic re-entrancy; each cross-contract call is synchronous.
- **Oracle trust:** v1 uses a single whitelisted relayer key. v2 should use multi-sig threshold.
- **Overflow:** All arithmetic uses `i128`; `overflow-checks = true` in release profile.
- **No `std`:** All contracts are `#![no_std]` — only Soroban-compatible types used.
