# MateFi — On-Chain Chess Betting & Prediction Market

> P2P chess betting with a live parimutuel prediction market. USDC only. Stellar Soroban Testnet.

[![CI](https://github.com/monibarai/matefi/actions/workflows/ci.yml/badge.svg)](https://github.com/monibarai/matefi/actions/workflows/ci.yml)
[![Deploy](https://github.com/monibarai/matefi/actions/workflows/deploy.yml/badge.svg)](https://github.com/monibarai/matefi/actions/workflows/deploy.yml)
[![Tests](https://img.shields.io/badge/frontend%20tests-33%20passing-brightgreen)]()
[![Contract Tests](https://img.shields.io/badge/contract%20tests-50%2B%20passing-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [System Architecture](#3-system-architecture)
4. [Technology Stack](#4-technology-stack)
5. [Deployed Contract Addresses](#5-deployed-contract-addresses)
6. [Quick Start](#6-quick-start)
7. [Environment Variables](#7-environment-variables)
8. [Smart Contract Guide](#8-smart-contract-guide)
9. [Contract Function Reference](#9-contract-function-reference)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Event Streaming Architecture](#11-event-streaming-architecture)
12. [Fee & Prize Economics](#12-fee--prize-economics)
13. [Testing](#13-testing)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Deployment Guide](#15-deployment-guide)
16. [Security Notes](#16-security-notes)
17. [Troubleshooting](#17-troubleshooting)
18. [Demo Walkthrough](#18-demo-walkthrough)

---

## 1. Project Overview

**MateFi** is a fully decentralised application on Stellar Testnet that merges two products into one on-chain experience:

### Product 1 — P2P Chess Betting

Two players agree on a USDC stake, both lock funds into a Soroban escrow contract, play a standard timed chess game, and the winner receives the full prize pool automatically through smart contract settlement. No custodian. No trust required. No manual payout.

### Product 2 — Live Parimutuel Prediction Market

While a match is active, any spectator can place USDC bets on who will win using a three-outcome parimutuel pool (Player A / Player B / Draw). The market automatically locks when Stockfish's position evaluation crosses ±250 centipawns for 3 consecutive moves — preventing late sniping. A portion of trading fees flows back into the player prize pool, creating a **flywheel**:

```
Bigger prizes → Better players → More spectators → More trading volume → Bigger prizes
```

### Token

**USDC only.** All player bets, trader bets, and fee distributions are denominated in Circle-issued USDC on Stellar Testnet (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`).

### Network

**Stellar Testnet throughout.** The same architecture works on mainnet with environment variable changes only.

---

## 2. Features

| Feature | Description | Status |
|---|---|---|
| Freighter wallet | Connect, disconnect, display full G-address | ✅ |
| XLM balance | Fetch from Horizon testnet, refresh, display | ✅ |
| Send XLM | Build → sign (Freighter) → submit to Horizon | ✅ |
| USDC balance | Read from on-chain token contract via simulation | ✅ |
| Create match | Approve USDC + call `create_match`, deposit to escrow | ✅ |
| Join match | Approve USDC + `join_match`, activates match + market | ✅ |
| Cancel match | `cancel_match` refunds Player A's deposit | ✅ |
| Live chess board | react-chessboard + chess.js, real-time move sync | ✅ |
| Chess clock | Per-player countdown, auto-flag on timeout | ✅ |
| Stockfish eval | Depth-18 evaluation after every move | ✅ |
| Eval bar | Animated centipawn advantage visualisation | ✅ |
| Prediction market | Three-outcome parimutuel pool per match | ✅ |
| Place bet | `approve` USDC + `buy_outcome` on-chain | ✅ |
| Live odds | Real-time implied probabilities from pool totals | ✅ |
| Market lock | Auto-lock when Stockfish threshold crossed | ✅ |
| On-chain settlement | Winner, draw, and cancel all handled by contracts | ✅ |
| Trader payouts | `pay_trader` proportional to winning pool share | ✅ |
| Match history | Completed matches with settlement hash + stellar.expert link | ✅ |
| WebSocket events | Real-time UI updates via relayer WebSocket | ✅ |
| Mobile responsive | Works on mobile, tablet, and desktop | ✅ |
| 33 frontend tests | Jest + ts-jest, zero config, CI-ready | ✅ |
| 50+ contract tests | soroban-sdk testutils, cross-contract integration | ✅ |
| GitHub Actions CI | Format, lint, test, build on every push | ✅ |
| GitHub Actions CD | Auto-deploy contracts + frontend on push to main | ✅ |

---

## 3. System Architecture

### 3.1 Layer Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js 14, App Router, Tailwind CSS, TypeScript)      │
│                                                                    │
│  /           Lobby — open + live matches                           │
│  /create     Create match form (bet amount + time control)         │
│  /match/[id] Live chess board + eval bar + trading panel           │
│  /history    Completed matches + settlement details                │
│  /wallet     Freighter wallet + XLM balance + send XLM            │
│                                                                    │
│  Wallet: @creit.tech/stellar-wallets-kit (Freighter module)        │
│  State:  Zustand (persisted to localStorage)                       │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ REST + WebSocket
                           │ GET /api/matches, /api/history
                           │ ws://relayer:3001
┌──────────────────────────▼─────────────────────────────────────────┐
│  RELAYER  (Node.js + TypeScript)                                   │
│                                                                    │
│  REST API   :3000  — match list, history, move submission          │
│  WebSocket  :3001  — real-time push to all subscribed frontends    │
│  PostgreSQL        — matches, moves, evaluations, traders tables   │
│  Stockfish         — depth-18 eval after every move (npm:stockfish)│
│                                                                    │
│  Stellar event listener — polls Soroban contract events            │
│  Stellar signer         — signs and submits relayer transactions   │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ Soroban RPC  (https://soroban-testnet.stellar.org)
                           │ Horizon      (https://horizon-testnet.stellar.org)
┌──────────────────────────▼─────────────────────────────────────────┐
│  STELLAR TESTNET  (Soroban)                                        │
│                                                                    │
│  match_registry   — state machine Open → Active → Completed        │
│  escrow_vault     — holds and distributes player USDC deposits     │
│  prediction_pool  — parimutuel market, odds, payouts               │
│  oracle_gateway   — receives Stockfish evals, locks market         │
│  settlement       — orchestrates full prize distribution           │
└────────────────────────────────────────────────────────────────────┘
```

### 3.2 Inter-Contract Communication

The five contracts communicate through Soroban's synchronous cross-contract call system. No external message passing or off-chain coordination needed for state transitions.

```
Player A calls:
  MatchRegistry.create_match()
      └──► EscrowVault.record_deposit(player_a, bet)

Player B calls:
  MatchRegistry.join_match()
      ├──► EscrowVault.record_deposit(player_b, bet)
      └──► PredictionPool.open_market(match_id, player_a, player_b)

Relayer (Stockfish) calls:
  OracleGateway.post_evaluation(match_id, fen, depth, score)
      └──► PredictionPool.lock_market(match_id, score)   [if threshold crossed]

Relayer calls:
  OracleGateway.post_result(match_id, winner)
      └──► Settlement.execute(match_id, winner)
               ├──► PredictionPool.settle(match_id, winner)  → (trading_net, bonus)
               ├──► EscrowVault.add_bonus(match_id, bonus)
               ├──► EscrowVault.release(match_id, winner, amount)
               │       OR EscrowVault.release_draw(match_id)
               └──► MatchRegistry.complete_match(match_id)
```

### 3.3 Match State Machine

```
                  create_match()
                       │
                  ┌────▼────┐
                  │  OPEN   │◄──── Player A waiting
                  └────┬────┘
          join_match() │    │ cancel_match()
                       │    └────────────► CANCELLED
                  ┌────▼────┐
                  │ ACTIVE  │◄──── Both players, market open
                  └────┬────┘
       Settlement.execute() │
                  ┌────▼────┐
                  │COMPLETED│◄──── Prizes distributed
                  └─────────┘
```

---

## 4. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Smart contracts | Rust + Soroban SDK | 26.0.1 |
| WASM target | `wasm32v1-none` | — |
| Stellar CLI | stellar-cli | ≥ 26 |
| Blockchain | Stellar Testnet (Soroban) | Protocol 22 |
| Frontend framework | Next.js (App Router) | 14.2.32 |
| UI library | React | 18.3 |
| Language | TypeScript | 5.6 |
| Styling | Tailwind CSS | 3.4 |
| Wallet integration | @creit.tech/stellar-wallets-kit | 1.9.5 |
| Freighter API | @stellar/freighter-api | 5.0.0 |
| Stellar SDK | @stellar/stellar-sdk | 15.1.0 |
| Chess logic | chess.js | 1.4.0 |
| Chess UI | react-chessboard | 4.6.0 |
| State management | Zustand | 4.5.7 |
| Relayer runtime | Node.js | ≥ 20 |
| Stockfish | stockfish (npm) | — |
| Database | PostgreSQL | 15 |
| Container | Docker + Docker Compose | — |
| Frontend tests | Jest + ts-jest | 30.x / 29.x |
| Contract tests | soroban-sdk testutils | — |
| CI/CD | GitHub Actions | — |
| Hosting | Vercel (frontend) | — |

---

## 5. Deployed Contract Addresses

All five contracts are live on **Stellar Testnet**, deployed on **2026-06-12**.

| Contract | Testnet Address |
|---|---|
| `match_registry` | `CALMF5ALUJ4CQMTQZFPD7IGOYVMOWFWAX2ZUZD45T4S5RTYRSO7KQM27` |
| `escrow_vault` | `CA2MU6Y6JP5ZYCX44DNVW2IQIXNQWUNTWJUEBPGBQZHR2OW3DJAAJVUB` |
| `prediction_pool` | `CBN5AFLUV6GFBWTEC7R5EYHQYMLV3O2Y474VGCQIE3CRSXSCIUWM6VIP` |
| `oracle_gateway` | `CDMSMCWOV22QU5GYFWCNCIZSF646SNBRC46HJUWZMIPSGPOYUWJZDTLU` |
| `settlement` | `CBT5K7PFCV3JCDUVAQZBWYK7YXBXSZ7TKSH2ZMPZC62FALNBAFGGPXYX` |
| `usdc_sac` | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

**Deployer account:** `GAL6ZVVRE2RPFS2X23I65QANHHIBGHKTGGVIT5AJURRKTIMEVUMJJUZZ`

**Relayer account:** `GD7ZTJ6XFHONCB5P52LBXOG2DQUOOKAWXPKTCTJCHI352RCWPKUBMG6Z`

**Treasury account:** `GDWUNMZZJMJNRQ2TJXOEPGGKO7MEYR6UALATAM3ANSIYSXI6Q4TVCBPR`

**USDC issuer:** `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

### Explorer Links

| Contract | stellar.expert |
|---|---|
| match_registry | https://stellar.expert/explorer/testnet/contract/CALMF5ALUJ4CQMTQZFPD7IGOYVMOWFWAX2ZUZD45T4S5RTYRSO7KQM27 |
| escrow_vault | https://stellar.expert/explorer/testnet/contract/CA2MU6Y6JP5ZYCX44DNVW2IQIXNQWUNTWJUEBPGBQZHR2OW3DJAAJVUB |
| prediction_pool | https://stellar.expert/explorer/testnet/contract/CBN5AFLUV6GFBWTEC7R5EYHQYMLV3O2Y474VGCQIE3CRSXSCIUWM6VIP |
| oracle_gateway | https://stellar.expert/explorer/testnet/contract/CDMSMCWOV22QU5GYFWCNCIZSF646SNBRC46HJUWZMIPSGPOYUWJZDTLU |
| settlement | https://stellar.expert/explorer/testnet/contract/CBT5K7PFCV3JCDUVAQZBWYK7YXBXSZ7TKSH2ZMPZC62FALNBAFGGPXYX |

### Contract Addresses JSON

Full deployment metadata is in [`docs/contract-addresses.json`](docs/contract-addresses.json).

---

## 6. Quick Start

### Prerequisites

- **Node.js** ≥ 20 (`node --version`)
- **Rust** stable ≥ 1.82 (`rustup update stable`)
- **Docker + Docker Compose** (for local PostgreSQL)
- **[Freighter](https://freighter.app)** browser extension installed and set to Testnet

### Step 1 — Clone the repository

```bash
git clone https://github.com/monibarai/matefi.git
cd matefi
```

### Step 2 — Start PostgreSQL (Docker)

```bash
docker compose up -d postgres
# PostgreSQL is now running on localhost:5432
# Connection: postgresql://matefi:matefi@localhost:5432/matefi
```

### Step 3 — Start the Relayer

```bash
cd relayer
cp .env.example .env
# Edit .env — add STELLAR_SECRET_KEY (relayer account) and contract IDs
npm install
npm run migrate       # creates tables in PostgreSQL
npm run dev           # API on :3000, WebSocket on :3001
```

### Step 4 — Start the Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Edit .env.local — contract IDs are pre-filled with deployed testnet addresses
npm install
npm run dev           # http://localhost:3002
```

### Step 5 — Fund your testnet wallet

In the browser, navigate to `http://localhost:3002/wallet`, connect Freighter (set to Testnet), then fund your account via [Stellar Friendbot](https://laboratory.stellar.org/#account-creator?network=test).

To get testnet USDC, run:

```bash
./scripts/get-usdc-testnet.sh <YOUR_G_ADDRESS>
```

---

## 7. Environment Variables

### 7.1 Frontend — `frontend/.env.local`

Copy from `frontend/.env.local.example`. All variables are `NEXT_PUBLIC_` (bundled into the client).

| Variable | Default / Deployed Value | Required | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | ✅ | Soroban JSON-RPC endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | ✅ | Stellar network passphrase |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api` | ✅ | Relayer REST API base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001` | ✅ | Relayer WebSocket URL |
| `NEXT_PUBLIC_MATCH_REGISTRY_ID` | `CALMF5ALUJ4CQMTQZFPD7IGOYVMOWFWAX2ZUZD45T4S5RTYRSO7KQM27` | ✅ | MatchRegistry contract |
| `NEXT_PUBLIC_ESCROW_VAULT_ID` | `CA2MU6Y6JP5ZYCX44DNVW2IQIXNQWUNTWJUEBPGBQZHR2OW3DJAAJVUB` | ✅ | EscrowVault contract |
| `NEXT_PUBLIC_PREDICTION_POOL_ID` | `CBN5AFLUV6GFBWTEC7R5EYHQYMLV3O2Y474VGCQIE3CRSXSCIUWM6VIP` | ✅ | PredictionPool contract |
| `NEXT_PUBLIC_ORACLE_GATEWAY_ID` | `CDMSMCWOV22QU5GYFWCNCIZSF646SNBRC46HJUWZMIPSGPOYUWJZDTLU` | ✅ | OracleGateway contract |
| `NEXT_PUBLIC_SETTLEMENT_ID` | `CBT5K7PFCV3JCDUVAQZBWYK7YXBXSZ7TKSH2ZMPZC62FALNBAFGGPXYX` | ✅ | Settlement contract |
| `NEXT_PUBLIC_USDC_CONTRACT_ID` | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | ✅ | USDC Stellar Asset Contract |

### 7.2 Relayer — `relayer/.env`

Copy from `relayer/.env.example`. These are server-side secrets and are never exposed to the browser.

| Variable | Example | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://matefi:matefi@localhost:5432/matefi` | ✅ | PostgreSQL connection string |
| `STELLAR_SECRET_KEY` | `S...` | ✅ | Relayer signing account secret |
| `STELLAR_RELAYER_ADDRESS` | `GD7ZTJ...` | ✅ | Relayer public key (whitelisted in OracleGateway) |
| `STELLAR_NETWORK` | `testnet` | ✅ | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | ✅ | Soroban RPC |
| `MATCH_REGISTRY_ID` | `CALMF5...` | ✅ | MatchRegistry contract ID |
| `ESCROW_VAULT_ID` | `CA2MU6...` | ✅ | EscrowVault contract ID |
| `PREDICTION_POOL_ID` | `CBN5AF...` | ✅ | PredictionPool contract ID |
| `ORACLE_GATEWAY_ID` | `CDMSMC...` | ✅ | OracleGateway contract ID |
| `SETTLEMENT_ID` | `CBT5K7...` | ✅ | Settlement contract ID |
| `USDC_CONTRACT_ID` | `CBIELTK...` | ✅ | USDC SAC ID |
| `TREASURY_ADDRESS` | `GDWUNM...` | ✅ | Treasury G-address for protocol fees |
| `WS_PORT` | `3001` | — | WebSocket server port (default 3001) |
| `API_PORT` | `3000` | — | REST API port (default 3000) |
| `DEV_MODE` | `false` | — | `true` to run game flow off-chain (no contracts needed) |

### 7.3 GitHub Actions Secrets (CI/CD)

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `STELLAR_SECRET_KEY` | Deployer account secret key (S...) |
| `VERCEL_TOKEN` | Vercel personal access token |
| `VERCEL_ORG_ID` | Vercel organisation ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `NEXT_PUBLIC_API_URL` | Deployed relayer REST URL |
| `NEXT_PUBLIC_WS_URL` | Deployed relayer WebSocket URL |
| `NEXT_PUBLIC_USDC_CONTRACT_ID` | USDC SAC (same on all deploys) |
| `NEXT_PUBLIC_MATCH_REGISTRY_ID` | Deployed contract ID (override) |
| `NEXT_PUBLIC_ESCROW_VAULT_ID` | Deployed contract ID (override) |
| `NEXT_PUBLIC_PREDICTION_POOL_ID` | Deployed contract ID (override) |
| `NEXT_PUBLIC_ORACLE_GATEWAY_ID` | Deployed contract ID (override) |
| `NEXT_PUBLIC_SETTLEMENT_ID` | Deployed contract ID (override) |
| `DEPLOY_URL` | Live frontend URL for post-deploy smoke test |

---

## 8. Smart Contract Guide

### 8.1 Prerequisites

```bash
# Rust stable ≥ 1.82
rustup update stable

# WASM target for Soroban SDK 26.x (uses wasm32v1-none, NOT wasm32-unknown-unknown)
rustup target add wasm32v1-none

# Stellar CLI ≥ 26
cargo install --locked stellar-cli --features opt

# Verify
stellar --version   # should print 26.x
```

### 8.2 Workspace Structure

```
contracts/
├── Cargo.toml              workspace root (soroban-sdk = "26.0.1")
├── Cargo.lock
├── Makefile                build / test / lint / deploy targets
├── README.md               contract API reference
├── match_registry/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs          contract entry points
│       ├── state.rs        Match, MatchState, DataKey storage types
│       ├── events.rs       emitted event definitions
│       ├── errors.rs       typed error codes (contracterror)
│       └── test.rs         integration tests
├── escrow_vault/           (same structure)
├── prediction_pool/        (same structure)
├── oracle_gateway/         (same structure)
└── settlement/             (same structure)
```

### 8.3 Build

```bash
cd contracts
make build
# Compiles all 5 contracts to WASM
# Output: target/wasm32v1-none/release/
#   match_registry.wasm
#   escrow_vault.wasm
#   prediction_pool.wasm
#   oracle_gateway.wasm
#   settlement.wasm
```

Or using cargo directly:

```bash
cargo build --target wasm32v1-none --release
```

### 8.4 Test

```bash
cd contracts
make test
# Runs all tests across all 5 contracts
# Expected: 50+ tests pass
```

Or individually:

```bash
cargo test -p match_registry
cargo test -p escrow_vault
cargo test -p prediction_pool
cargo test -p oracle_gateway
cargo test -p settlement
```

### 8.5 Format and Lint

```bash
make fmt      # cargo fmt --all
make lint     # cargo clippy --all-targets --all-features -- -D warnings
```

### 8.6 Deploy to Testnet

#### Option A — Makefile (individual contracts)

```bash
export STELLAR_SECRET_KEY=S...
cd contracts
make deploy
```

#### Option B — Full sequenced deploy + initialise (recommended)

```bash
# From repository root
export STELLAR_SECRET_KEY=S...
export STELLAR_RELAYER_SECRET=S...
export STELLAR_TREASURY=G...
export STELLAR_USDC_SAC=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA

./scripts/deploy-all.sh      # deploys WASMs, writes contract IDs to a temp file
./scripts/init-contracts.sh  # calls initialize() on each contract in correct order
```

After deploying, copy the contract IDs printed to stdout into `frontend/.env.local` and `relayer/.env`.

### 8.7 Initialisation Order

The contracts have dependency relationships — initialise in this order:

```
1. escrow_vault.initialize(admin, registry, settlement, usdc)
2. prediction_pool.initialize(admin, registry, settlement, usdc, treasury)
3. match_registry.initialize(admin, escrow, pool, settlement)
4. oracle_gateway.initialize(relayer, pool, settlement)
5. settlement.initialize(admin, registry, escrow, pool, oracle, treasury, usdc)
```

`scripts/init-contracts.sh` handles this sequence automatically.

---

## 9. Contract Function Reference

### 9.1 MatchRegistry

**`CALMF5ALUJ4CQMTQZFPD7IGOYVMOWFWAX2ZUZD45T4S5RTYRSO7KQM27`**

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `initialize` | `admin: Address, escrow: Address, pool: Address, settlement: Address` | — | One-time setup. Panics on re-call. |
| `create_match` | `player_a: Address, bet_amount: i128, time_control: u32` | `u64` (match_id) | Creates match, transfers `bet_amount` USDC from player_a to EscrowVault. Min bet: 1 USDC. Min time: 60s. |
| `join_match` | `match_id: u64, player_b: Address` | — | Player B joins, transfers USDC to escrow, opens PredictionPool market. Only callable on Open matches. |
| `cancel_match` | `match_id: u64, player_a: Address` | — | Cancels Open match, refunds player_a. Only player_a can cancel. |
| `complete_match` | `match_id: u64` | — | Marks match Completed. Gated to Settlement contract via invoker auth. |
| `get_match` | `match_id: u64` | `Match` | Read match state. Panics if unknown match_id. |

**Match states:** `Open` → `Active` → `Completed` (or `Open` → `Cancelled`)

### 9.2 EscrowVault

**`CA2MU6Y6JP5ZYCX44DNVW2IQIXNQWUNTWJUEBPGBQZHR2OW3DJAAJVUB`**

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `initialize` | `admin: Address, registry: Address, settlement: Address, usdc: Address` | — | One-time setup. |
| `record_deposit` | `match_id: u64, player: Address, amount: i128` | — | Records player USDC deposit. Called by MatchRegistry only. |
| `add_bonus` | `match_id: u64, amount: i128` | — | Flywheel: adds trading fee bonus to prize pool. Called by Settlement only. |
| `release` | `match_id: u64, winner: Address, amount: i128` | — | Pays winner net of 3% fee (1% treasury, 2% prize add). Called by Settlement only. |
| `release_draw` | `match_id: u64` | — | Returns both players' deposits. Called by Settlement only. |
| `refund` | `match_id: u64, player: Address, amount: i128` | — | Refunds deposit on cancel. Called by MatchRegistry only. |
| `get_record` | `match_id: u64` | `DepositRecord` | Read vault state for a match. |

### 9.3 PredictionPool

**`CBN5AFLUV6GFBWTEC7R5EYHQYMLV3O2Y474VGCQIE3CRSXSCIUWM6VIP`**

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `initialize` | `admin: Address, registry: Address, settlement: Address, usdc: Address, treasury: Address` | — | One-time setup. |
| `open_market` | `match_id: u64, player_a: Address, player_b: Address` | — | Opens trading market. Called by MatchRegistry on join. |
| `buy_outcome` | `match_id: u64, trader: Address, outcome: Outcome, amount: i128` | — | Places prediction bet. USDC transferred from trader to pool. Min 0.01 USDC. Rejects if market locked or settled. |
| `lock_market` | `match_id: u64, eval_score: i32` | — | One-way lock. Called by OracleGateway when threshold crossed. |
| `settle` | `match_id: u64, winner: Winner` | `(i128, i128)` | Distributes pool: 3% protocol fee, remainder to winning outcome bettors. Returns `(trading_net, bonus)`. Called by Settlement only. |
| `pay_trader` | `match_id: u64, trader: Address, outcome: Outcome` | `i128` | Pays individual winning trader proportional share. Must be called after settle. |
| `get_market` | `match_id: u64` | `Market` | Read market state. |
| `get_position` | `match_id: u64, trader: Address, outcome: Outcome` | `i128` | Read trader's position for given outcome. |
| `get_odds` | `match_id: u64` | `(u32, u32, u32)` | Implied probabilities as integers 0–100 for (PlayerA, PlayerB, Draw). Sum ≈ 100. |

**Outcome enum:** `PlayerA` | `PlayerB` | `Draw`

**Winner enum:** `PlayerA` | `PlayerB` | `Draw`

### 9.4 OracleGateway

**`CDMSMCWOV22QU5GYFWCNCIZSF646SNBRC46HJUWZMIPSGPOYUWJZDTLU`**

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `initialize` | `relayer: Address, prediction_pool: Address, settlement: Address` | — | One-time setup. Whitelists relayer address. |
| `post_evaluation` | `match_id: u64, fen: Bytes, depth: u32, score: i32` | — | Submits Stockfish eval. If `score` exceeds threshold for N consecutive calls, calls `PredictionPool.lock_market`. Mate score (±30000) forces immediate lock. Relayer only. |
| `post_result` | `match_id: u64, winner: Winner` | — | Submits final game result → calls `Settlement.execute`. Relayer only. |
| `set_threshold` | `caller: Address, new_threshold: i32` | — | Change centipawn lock threshold (default: 250). Relayer only. Must be > 0. |
| `set_confirmations` | `caller: Address, new_confirmations: u32` | — | Change required consecutive confirmations (default: 3). Relayer only. Must be ≥ 1. |
| `get_threshold` | — | `i32` | Current lock threshold. |
| `get_confirmations` | — | `u32` | Current confirmation requirement. |
| `get_eval` | `match_id: u64, sequence: u32` | `Option<EvalRecord>` | Read stored eval by match + ledger sequence. |

### 9.5 Settlement

**`CBT5K7PFCV3JCDUVAQZBWYK7YXBXSZ7TKSH2ZMPZC62FALNBAFGGPXYX`**

| Function | Arguments | Returns | Description |
|---|---|---|---|
| `initialize` | `admin: Address, registry: Address, escrow: Address, pool: Address, oracle: Address, treasury: Address, usdc: Address` | — | One-time setup. |
| `execute` | `match_id: u64, winner: Winner` | — | Full settlement: settle pool → add bonus → release escrow → complete match. Called by OracleGateway only. |

---

## 10. Frontend Architecture

### 10.1 Source Tree

```
frontend/src/
├── app/                              Next.js App Router pages
│   ├── layout.tsx                    Root layout (Navbar + fonts)
│   ├── globals.css                   Tailwind + custom component classes
│   ├── page.tsx                      Lobby: open + live match grids
│   ├── create/
│   │   └── page.tsx                  Create match form
│   ├── match/
│   │   └── [matchId]/
│   │       └── page.tsx              Live match: chess + trading
│   ├── history/
│   │   └── page.tsx                  Match history with settlements
│   └── wallet/
│       └── page.tsx                  Wallet + XLM balance + send
│
├── components/
│   ├── board/
│   │   ├── ChessBoard.tsx            react-chessboard wrapper with move validation
│   │   ├── EvalBar.tsx               Animated centipawn advantage bar
│   │   └── MoveHistory.tsx           Scrollable PGN move list
│   ├── lobby/
│   │   ├── OpenMatches.tsx           Grid of joinable matches
│   │   ├── LiveMatches.tsx           Grid of active matches (spectate)
│   │   └── MatchCard.tsx             Individual match card component
│   ├── match/
│   │   ├── Clock.tsx                 Per-player countdown timer
│   │   ├── PlayerInfo.tsx            Address, color, status display
│   │   ├── PrizePool.tsx             Current prize pool in USDC
│   │   └── SettlementModal.tsx       Result modal with tx hash + explorer link
│   ├── shared/
│   │   ├── Navbar.tsx                Sticky header: logo + nav + wallet
│   │   ├── WalletButton.tsx          Connect/disconnect via Stellar Wallets Kit
│   │   └── USDCBalance.tsx           Live USDC balance (simulated contract call)
│   ├── trading/
│   │   ├── TradingPanel.tsx          Container for all trading components
│   │   ├── BetForm.tsx               Outcome selector + amount input + submit
│   │   ├── OddsDisplay.tsx           Implied probability bars
│   │   ├── PoolBars.tsx              Visual pool size comparison
│   │   └── MarketStatus.tsx          Open / Locked / Settled badge
│   └── wallet/
│       ├── WalletStatus.tsx          Freighter install/connect/disconnect UI
│       ├── XlmBalance.tsx            XLM balance from Horizon + refresh
│       └── SendXlmForm.tsx           Destination + amount + Freighter sign + submit
│
├── hooks/
│   ├── useWallet.ts                  Zustand store: address, connect, disconnect
│   ├── useFreighterWallet.ts         Direct Freighter API hook (wallet page)
│   ├── useMatch.ts                   Match data polling + WebSocket subscription
│   ├── useTrading.ts                 buy_outcome + pay_trader flow
│   ├── useWebSocket.ts               WebSocket with auto-reconnect (3s backoff)
│   ├── useXlmBalance.ts              Horizon balance fetch, funded/unfunded state
│   └── useMounted.ts                 SSR hydration guard
│
├── lib/
│   ├── stellar.ts                    Soroban RPC server, Stellar Wallets Kit
│   ├── stellar-sdk.ts                Re-export SDK + server (single import point)
│   ├── contracts.ts                  All on-chain invocations (wallet-based signing)
│   ├── contract.ts                   callContractFunction (secret-key signing)
│   ├── horizon.ts                    Horizon testnet URL + server singleton
│   ├── usdc.ts                       usdcToStroops, stroopsToUsdc, formatUsdc
│   └── chess.ts                      chess.js helpers
│
└── types/
    ├── match.ts                      MatchRecord, MatchStatus, Winner, PlayerColor
    ├── trading.ts                    Outcome, OddsUpdate, TraderPosition
    └── events.ts                     WebSocket event union types
```

### 10.2 Key Design Decisions

| Decision | Rationale |
|---|---|
| Next.js App Router | Server components for static lobby pages, client components for wallet-gated actions |
| Zustand over Context | Persists wallet address to localStorage across page refreshes without a provider tree |
| `useMounted()` guard | Prevents hydration mismatch when wallet state rehydrates from localStorage |
| Polling fallback | Lobby polls `/api/matches` every 8s as fallback when WebSocket is unavailable |
| `ContractsNotDeployedError` | Graceful UI degradation when env vars are empty (shows "Deploy contracts first" banner) |
| `wasm32v1-none` in notes | Frontend never runs WASM directly — Soroban SDK handles serialisation over RPC |

### 10.3 Wallet Integration

The wallet integration uses two separate systems:

**1. Stellar Wallets Kit** (main app wallet for USDC operations)
```typescript
// hooks/useWallet.ts — Zustand store
const kit = await getKit();           // @creit.tech/stellar-wallets-kit
await kit.openModal({ ... });         // shows wallet selection modal
const { address } = await kit.getAddress();
await kit.signTransaction(xdr, opts); // signs Soroban transactions
```

**2. Freighter API directly** (wallet page — demonstrates Req 1-4)
```typescript
// hooks/useFreighterWallet.ts
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
const { isConnected: installed } = await isConnected();
const { address } = await requestAccess();
const { signedTxXdr } = await signTransaction(xdr, { networkPassphrase });
```

### 10.4 Contract Invocation Pipeline

Every on-chain write follows the same pattern in `lib/contracts.ts`:

```typescript
async function invokeWithWallet(contractId, method, args, signerAddress) {
  const server = getRpcServer();

  // 1. Load source account
  const account = await server.getAccount(signerAddress);

  // 2. Build transaction
  const tx = new TransactionBuilder(account, { fee, networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build();

  // 3. Simulate (get auth + resource estimates)
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

  // 4. Assemble (inject auth + footprint)
  const prepared = rpc.assembleTransaction(tx, sim).build();

  // 5. Sign with Stellar Wallets Kit
  const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), opts);

  // 6. Submit and poll for confirmation
  const sent = await server.sendTransaction(signed);
  // ... poll until NOT_FOUND resolves to SUCCESS or FAILED
}
```

---

## 11. Event Streaming Architecture

### 11.1 On-Chain Events (Soroban Contract Events)

Every significant state change emits a typed Soroban event. The relayer subscribes via `server.getEvents()` polling.

#### MatchRegistry Events

| Event | Fields | Description |
|---|---|---|
| `match_created` | `match_id, player_a, bet_amount, time_control` | New match opened |
| `match_joined` | `match_id, player_b` | Match activated, market opened |
| `match_cancelled` | `match_id, player_a` | Open match cancelled, refund issued |
| `match_completed` | `match_id, winner` | Match finalised by Settlement |

#### EscrowVault Events

| Event | Fields | Description |
|---|---|---|
| `deposit_recorded` | `match_id, player, amount` | Player USDC locked in vault |
| `bonus_added` | `match_id, amount` | Trading flywheel bonus credited |
| `winner_paid` | `match_id, winner, amount` | Prize transferred to winner |
| `draw_refund` | `match_id, player_a_amount, player_b_amount` | Deposits returned on draw |
| `refund_issued` | `match_id, player, amount` | Deposit returned on cancel |

#### PredictionPool Events

| Event | Fields | Description |
|---|---|---|
| `market_opened` | `match_id, player_a, player_b` | Trading market initialised |
| `bet_placed` | `match_id, trader, outcome, amount` | Prediction bet recorded |
| `market_locked` | `match_id, eval_score` | Market closed to new bets |
| `market_settled` | `match_id, winner, protocol_fee, net_pool` | Final distribution calculated |
| `trader_paid` | `match_id, trader, outcome, amount` | Individual trader payout |

#### OracleGateway Events

| Event | Fields | Description |
|---|---|---|
| `eval_posted` | `match_id, sequence, fen, depth, score` | Stockfish eval stored |
| `market_locked` | `match_id, score, confirmations` | Lock triggered by oracle |
| `result_posted` | `match_id, winner` | Final result submitted |

#### Settlement Events

| Event | Fields | Description |
|---|---|---|
| `settlement_executed` | `match_id, winner, player_prize, trading_net, bonus` | Full settlement complete |

### 11.2 WebSocket Events (Relayer → Frontend)

The relayer aggregates Soroban events and broadcasts to all connected frontend clients. Typed in `frontend/src/types/events.ts`.

```typescript
type WsEvent =
  | { type: 'match_updated';       match: MatchRecord }
  | { type: 'move_made';           matchId: string; fen: string; pgn: string; clock: ClockState }
  | { type: 'market_updated';      matchId: string; odds: [number, number, number]; locked: boolean }
  | { type: 'evaluation_posted';   matchId: string; score: number; depth: number; fen: string }
  | { type: 'match_settled';       matchId: string; winner: Winner; txHash: string }
  | { type: 'ping' };
```

### 11.3 Event Flow — Market Lock

```
[Move made by player]
        │
        ▼
Relayer validates move → GameManager.applyMove()
        │
        ▼
Stockfish.evaluate(fen, depth=18)  →  score: i32 (centipawns)
        │
        ▼
relayer/stellar/contracts/oracleGateway.ts
  .postEvaluation(match_id, fen, depth, score)
        │
        ▼  Soroban transaction
OracleGateway.post_evaluation()
        │  checks: abs(score) >= threshold (250) for N consecutive (3) evals
        ▼  if yes:
PredictionPool.lock_market()         ← cross-contract call
        │  emits: market_locked event
        ▼
Relayer event listener sees market_locked
        │
        ▼
WebSocket broadcast: { type: 'market_updated', locked: true }
        │
        ▼
Frontend: BetForm disabled, MarketStatus shows "Locked"
```

### 11.4 WebSocket Reconnection

`useWebSocket.ts` implements automatic reconnection with exponential-like backoff:

```typescript
// Reconnects after 3s, resets on successful message
const RECONNECT_DELAY_MS = 3_000;

ws.onclose = () => {
  setTimeout(() => connect(), RECONNECT_DELAY_MS);
};
```

On reconnect, the hook re-fetches the latest match state via REST to catch any events missed during the disconnection window.

---

## 12. Fee & Prize Economics

### Player Pool

| Item | Amount |
|---|---|
| Player A deposit | `bet_amount` USDC |
| Player B deposit | `bet_amount` USDC |
| **Total player pool** | `2 × bet_amount` |
| Trading flywheel bonus | `+2% of trading_net` |
| **Winner receives** | `(2 × bet_amount + bonus) × 97%` |
| Protocol fee (treasury) | `(2 × bet_amount + bonus) × 3%` |

### Trading Pool (Prediction Market)

| Item | Amount |
|---|---|
| Total bets placed | `gross_pool` USDC |
| Protocol fee | `3% of gross_pool` |
| **Net pool to winners** | `97% of gross_pool` |
| Treasury share of protocol fee | `1% of gross_pool` |
| Flywheel to player prize | `2% of gross_pool` |

### Draw Handling

| Item | Amount |
|---|---|
| Player A refund | `bet_amount` (full, no fee) |
| Player B refund | `bet_amount` (full, no fee) |
| Draw traders' payout | proportional to Draw pool share × 97% net |
| Flywheel bonus on draw | `2% of gross_trading_pool` → treasury (not prize pool) |

### USDC Precision

All amounts are in **stroops** (Stellar's 7-decimal unit: `1 USDC = 10,000,000 stroops`). The frontend uses `usdcToStroops()` and `stroopsToUsdc()` from `lib/usdc.ts` to convert without floating-point drift.

---

## 13. Testing

### 13.1 Frontend Tests

```bash
cd frontend
npm test           # interactive watch mode
npm run test:ci    # CI mode with coverage report
```

**Output:**

```
Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total
Snapshots:   0 total
Time:        ~1.0s
Ran all test suites.
```

**Coverage by suite:**

| Suite | File | Tests | What is covered |
|---|---|---|---|
| `usdc.test.ts` | `lib/usdc.ts` | 15 | `usdcToStroops`, `stroopsToUsdc`, `formatUsdc`, constants |
| `stellar.test.ts` | `lib/stellar.ts` | 10 | `shortAddress`, `txExplorerUrl`, `NETWORK_PASSPHRASE`, `SOROBAN_RPC_URL` |
| `contracts-error.test.ts` | `lib/contracts.ts`, `lib/horizon.ts` | 8 | `ContractsNotDeployedError`, `HORIZON_TESTNET_URL`, `TESTNET_PASSPHRASE` |

**Selected test cases:**

```typescript
// usdcToStroops — no float drift
expect(usdcToStroops('12.5')).toBe(125_000_000n);
expect(usdcToStroops('0.0000001')).toBe(1n);    // minimum unit

// shortAddress
expect(shortAddress(null)).toBe('—');
expect(shortAddress('GABC')).toBe('GABC');       // short enough, unchanged

// txExplorerUrl
expect(txExplorerUrl('abc123'))
  .toBe('https://stellar.expert/explorer/testnet/tx/abc123');
expect(txExplorerUrl(null)).toBeNull();

// ContractsNotDeployedError
const err = new ContractsNotDeployedError('NEXT_PUBLIC_MATCH_REGISTRY_ID');
expect(err).toBeInstanceOf(Error);
expect(err.name).toBe('ContractsNotDeployedError');
expect(err.message).toContain('NEXT_PUBLIC_MATCH_REGISTRY_ID');
```

### 13.2 Smart Contract Tests

```bash
cd contracts
cargo test
```

**50+ tests across 5 contracts.** Each contract has `src/test.rs` with:

- Initialization guard (second call panics)
- Happy-path scenario (full flow)
- Rejection cases (wrong caller, bad state, bad args)
- Cross-contract integration (multi-contract setup in single test env)
- Mathematical invariant checks (fees sum correctly, balances match)

**Selected test names per contract:**

`match_registry`:
- `create_match_returns_match_id_and_transfers_usdc`
- `join_match_activates_match_and_opens_market`
- `cancel_match_refunds_player_a`
- `complete_match_only_callable_by_settlement`
- `create_match_rejected_below_min_bet`

`escrow_vault`:
- `release_pays_winner_and_treasury_exactly`
- `release_draw_refunds_deposits_and_sends_bonus_to_treasury`
- `add_bonus_credits_flywheel`
- `gated_functions_reject_unauthorized_callers`
- `record_deposit_rejects_double_deposit_by_player_a`

`prediction_pool`:
- `buy_outcome_updates_pools_and_records_position`
- `get_odds_matches_spec_example`
- `settle_distributes_fees_and_records_result`
- `pay_trader_pays_proportional_share`
- `no_bets_on_winning_outcome_sweeps_net_to_treasury`

`oracle_gateway`:
- `post_evaluation_locks_after_sustained_advantage`
- `post_evaluation_mate_score_forces_lock`
- `alternating_side_advantages_do_not_lock`
- `transient_spike_then_recovery_keeps_market_open`
- `set_threshold_rejected_for_non_relayer`

`settlement`:
- `execute_player_a_wins_no_trading`
- `execute_draw_refunds_both_players`
- `execute_with_trading_flywheel_bonus`
- `execute_rejected_when_match_not_active`
- `full_e2e_via_oracle_flow` (all 5 contracts in one test)

---

## 14. CI/CD Pipeline

Two GitHub Actions workflows in `.github/workflows/`.

### 14.1 CI Workflow — `ci.yml`

**Trigger:** Every `git push` and every Pull Request on any branch.

**Jobs:**

```
┌─────────────────────────────────────────────────────────────┐
│  Job: contracts                                             │
│                                                             │
│  runs-on: ubuntu-latest                                     │
│  working-directory: contracts                               │
│                                                             │
│  steps:                                                     │
│    1. actions/checkout@v4                                   │
│    2. dtolnay/rust-toolchain@stable                         │
│         targets: wasm32v1-none                              │
│         components: clippy, rustfmt                         │
│    3. actions/cache@v4  (Cargo registry + build)            │
│    4. cargo fmt --all -- --check                            │
│    5. cargo clippy -- -D warnings                           │
│    6. cargo test                          ← 50+ tests       │
│    7. cargo build --target wasm32v1-none --release          │
│    8. upload-artifact: contract-wasms (*.wasm)              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Job: frontend                                              │
│                                                             │
│  runs-on: ubuntu-latest                                     │
│  working-directory: frontend                                │
│                                                             │
│  steps:                                                     │
│    1. actions/checkout@v4                                   │
│    2. actions/setup-node@v4  (Node 20, npm cache)           │
│    3. npm ci                                                │
│    4. npm run lint                                          │
│    5. npx tsc --noEmit            ← type-check              │
│    6. npm run test:ci             ← 33 tests + coverage     │
│    7. npm run build                                         │
│    8. upload-artifact: next-build (.next/)                  │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 CD Workflow — `deploy.yml`

**Trigger:** Push to `main` branch only.

**Concurrency:** Cancel in-progress deployments if a newer push arrives.

```
┌─────────────────────────────────────────────────────────────┐
│  Job: deploy-contract                                       │
│                                                             │
│  1. Checkout + Rust toolchain                               │
│  2. cargo build --target wasm32v1-none --release            │
│  3. cargo install --locked stellar-cli --features opt       │
│  4. stellar keys add deployer --secret-key                  │
│  5. stellar contract deploy match_registry.wasm    ─┐       │
│  6. stellar contract deploy escrow_vault.wasm       │       │
│  7. stellar contract deploy prediction_pool.wasm    ├─ IDs  │
│  8. stellar contract deploy oracle_gateway.wasm     │       │
│  9. stellar contract deploy settlement.wasm        ─┘       │
│  10. Expose all contract IDs as job outputs                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ needs: [deploy-contract]
┌──────────────────────────▼──────────────────────────────────┐
│  Job: deploy-frontend                                       │
│                                                             │
│  1. npm ci                                                  │
│  2. npm run build  (env: freshly-deployed contract IDs)     │
│  3. npx vercel --prod --token $VERCEL_TOKEN                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ needs: [deploy-frontend]
┌──────────────────────────▼──────────────────────────────────┐
│  Job: smoke-test                                            │
│                                                             │
│  1. sleep 30  (wait for Vercel propagation)                 │
│  2. curl $DEPLOY_URL → assert HTTP 200                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 15. Deployment Guide

### 15.1 Prerequisites

- GitHub repository with Actions enabled
- Vercel account and project created
- Stellar testnet account with XLM (for deployer)
- Stellar testnet account with XLM (for relayer)

### 15.2 Set GitHub Secrets

Navigate to **Settings → Secrets and variables → Actions → New repository secret** and add all secrets listed in [Section 7.3](#73-github-actions-secrets-cicd).

### 15.3 Automated Deploy via CI/CD

Push to `main` to trigger the full pipeline:

```bash
git checkout main
git push origin main
# GitHub Actions: ci.yml runs first (all branches)
# deploy.yml triggers on main: deploys contracts → deploys frontend → smoke test
```

Monitor in **Actions** tab. The deploy-contract job prints all 5 contract IDs in its logs.

### 15.4 Manual Deploy

```bash
# Step 1: Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Step 2: Fund deployer account
./scripts/fund-testnet.sh $STELLAR_SECRET_KEY

# Step 3: Build and deploy contracts
export STELLAR_SECRET_KEY=S...
cd contracts && make deploy

# Step 4: Initialise contracts
export STELLAR_RELAYER_SECRET=S...
export STELLAR_TREASURY=G...
export STELLAR_USDC_SAC=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
./scripts/init-contracts.sh

# Step 5: Set frontend env vars
# Copy printed contract IDs into frontend/.env.local

# Step 6: Build and deploy frontend
cd frontend
npm run build
npx vercel --prod
```

### 15.5 Rollback

**Frontend rollback:**
```bash
npx vercel rollback --token $VERCEL_TOKEN
```

**Contract rollback:**
Soroban contracts are immutable once deployed. To rollback:
1. Re-deploy the previous WASM version using the same process
2. Update `NEXT_PUBLIC_*` env vars in Vercel to point to the old contract IDs
3. Re-trigger the frontend deploy (no need to re-init the old contracts)

---

## 16. Security Notes

### Access Control

Every gated function uses Soroban's built-in auth system:

| Contract | Gated Function | Who can call |
|---|---|---|
| EscrowVault | `record_deposit`, `refund` | MatchRegistry only (invoker auth) |
| EscrowVault | `add_bonus`, `release`, `release_draw` | Settlement only (invoker auth) |
| PredictionPool | `open_market` | MatchRegistry only |
| PredictionPool | `lock_market` | OracleGateway only |
| PredictionPool | `settle` | Settlement only |
| OracleGateway | `post_evaluation`, `post_result` | Whitelisted relayer address |
| OracleGateway | `set_threshold`, `set_confirmations` | Whitelisted relayer address |
| MatchRegistry | `complete_match` | Settlement only |
| Settlement | `execute` | OracleGateway only |

### Known Limitations (v1 Testnet)

| Risk | Mitigation in v1 | v2 Plan |
|---|---|---|
| Single relayer oracle | Whitelisted key, open-source code | Multi-sig threshold oracle |
| No time-out settlement | Players must finish the game | Auto-settle on clock flag |
| No pause/admin escape hatch | Testnet only — acceptable | Admin pause with timelock |
| Eval depth fixed at 18 | Configurable by relayer in oracle | On-chain depth setting |

### Overflow Protection

All contracts use `i128` for token amounts (max ~1.7 × 10³⁸ stroops). The release profile has `overflow-checks = true`. No `unsafe` code. All contracts are `#![no_std]`.

---

## 17. Troubleshooting

### "Contracts not deployed yet" banner in the UI

The `NEXT_PUBLIC_*_ID` env vars are empty or missing. Either:
- Copy deployed contract IDs from `docs/contract-addresses.json` into `frontend/.env.local`
- Or run `scripts/deploy-all.sh` to deploy fresh contracts

Then restart the dev server: `npm run dev`.

### Freighter "Install Freighter" screen

The Freighter browser extension is not installed or not detected. Steps:
1. Install from [freighter.app](https://freighter.app)
2. Open the extension and set network to **Testnet**
3. Reload the page

### "0 XLM (account not funded)"

Your testnet account has no XLM. Fund it at [Stellar Friendbot](https://laboratory.stellar.org/#account-creator?network=test) or run `./scripts/fund-testnet.sh <G_ADDRESS>`.

### Relayer `Cannot connect to database`

PostgreSQL is not running. Start it:

```bash
docker compose up -d postgres
docker compose ps   # verify postgres is running
```

### `cargo build` fails: `error[E0463]: can't find crate for std`

The `wasm32v1-none` target is not installed. Fix:

```bash
rustup target add wasm32v1-none
rustup show   # verify wasm32v1-none is listed under "installed targets"
```

Note: `wasm32-unknown-unknown` is the **wrong** target for Soroban SDK 26.x. Use `wasm32v1-none`.

### `simulation failed: HostError` on contract call

Common causes:
- `u64` argument passed as `number` instead of `BigInt` — fix in `contracts.ts`
- Wrong contract ID in env var — check `frontend/.env.local`
- Account has insufficient USDC balance or allowance

### WebSocket disconnects on every page refresh

Expected behaviour — the WebSocket reconnects within 3 seconds. If it never reconnects, check that the relayer is running on `:3001`:

```bash
curl http://localhost:3000/api/matches   # should return JSON
```

### `npm run lint` fails on CI

Check the specific ESLint error. Common fixes:
- Add `void` before floating promises: `void someAsync()`
- Remove unused imports
- Fix `any` types: use explicit type annotations

### `cargo clippy -- -D warnings` fails on CI

Clippy is strict. Common fixes:
- Replace `.unwrap()` with `?` or `panic_with_error!`
- Remove unused variables (prefix with `_`)
- Add `#[allow(dead_code)]` for intentionally unused items

---

## 18. Demo Walkthrough

### Step 1 — Set Up Your Wallet

1. Install [Freighter](https://freighter.app) and set it to **Testnet**
2. Navigate to `http://localhost:3002/wallet`
3. Click **Connect Wallet** — Freighter opens and asks for permission
4. Your full G-address appears, along with your XLM balance
5. Click the **Friendbot** link to fund your account with 10,000 testnet XLM
6. Run `./scripts/get-usdc-testnet.sh <YOUR_ADDRESS>` to receive testnet USDC

### Step 2 — Create a Match

1. Go to `http://localhost:3002/create`
2. Enter a bet amount in USDC (e.g. `5.00`) and time control in seconds (e.g. `300` for 5 minutes)
3. Click **Create Match**
4. Freighter prompts for **two** transactions:
   - `approve` — grants MatchRegistry permission to spend your USDC
   - `create_match` — locks your USDC into EscrowVault, creates the match on-chain
5. The Lobby now shows your match as **Open**

### Step 3 — Join a Match (second player)

1. Switch Freighter to a second testnet account (or use a second browser)
2. Open the Lobby and click on an **Open** match
3. Click **Join Match** — Freighter prompts two transactions again
4. After confirmation, the match becomes **Active** and the chess board loads

### Step 4 — Play Chess

1. The live match page shows the chess board, clocks, and prize pool
2. Make moves by clicking and dragging pieces
3. The relayer validates each move against chess.js rules
4. After each move, Stockfish evaluates the position at depth 18
5. The **Eval Bar** shows the centipawn advantage in real time

### Step 5 — Place Prediction Trades (as a spectator)

1. Open a live match URL with a third account (or as an unsigned visitor)
2. The **Trading Panel** on the right shows live odds for Player A / Draw / Player B
3. Select an outcome, enter a USDC amount, and click **Place Bet**
4. Freighter signs `approve` + `buy_outcome` — your position is recorded on-chain
5. Odds update immediately as pool totals change

### Step 6 — Watch the Market Lock

When Stockfish evaluates the same side as favoured for 3 consecutive moves at ≥ ±250 centipawns:

1. The oracle calls `OracleGateway.post_evaluation()` → `PredictionPool.lock_market()`
2. A **Market Locked** badge appears in the Trading Panel
3. The BetForm is disabled — no new bets accepted

### Step 7 — Settlement

When checkmate, resignation, or stalemate occurs:

1. The relayer calls `OracleGateway.post_result(match_id, winner)`
2. On-chain: `Settlement.execute()` orchestrates prize distribution across all 5 contracts
3. A **Settlement Modal** appears with:
   - Winner name and prize amount
   - Settlement transaction hash
   - Link to stellar.expert

The match moves to `/history` with full settlement details including trader payouts.

---

## License

MIT © 2026 MateFi
