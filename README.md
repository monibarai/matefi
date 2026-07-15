# MateFi — On-Chain Chess Betting & Prediction Market on Stellar

<img width="2879" height="1486" alt="Screenshot from 2026-07-15 18-05-02" src="https://github.com/user-attachments/assets/e5c43134-7c93-456b-9dc2-79511264f501" />


<div align="center">
<img src="https://img.shields.io/badge/Stellar-Soroban-7B2FBE?style=for-the-badge" />
<img src="https://img.shields.io/badge/Rust-1.70%2B-red?style=for-the-badge" />
<img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge" />
<img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge" />
<img src="https://img.shields.io/badge/Status-Live%20on%20Testnet-brightgreen?style=for-the-badge" />

 **P2P chess betting fused with a live parimutuel prediction market, built on Stellar's Soroban smart contract platform. USDC only. Stellar Testnet.**

</div>

---

## 🚀 Deployed Contracts (Stellar Testnet)

**Network:** Stellar Testnet · Passphrase `Test SDF Network ; September 2015`

**Live app:** ⟨LIVE_APP_URL⟩ · **Deployer:** `⟨DEPLOYER_G_ADDRESS⟩`

| Contract | Deployed Address (testnet) | Explorer |
|---|---|---|
| **match_registry** | `⟨MATCH_REGISTRY_ID⟩` | [view](⟨EXPLORER_LINK⟩) |
| **escrow_vault** | `⟨ESCROW_VAULT_ID⟩` | [view](⟨EXPLORER_LINK⟩) |
| **prediction_pool** | `⟨PREDICTION_POOL_ID⟩` | [view](⟨EXPLORER_LINK⟩) |
| **oracle_gateway** | `⟨ORACLE_GATEWAY_ID⟩` | [view](⟨EXPLORER_LINK⟩) |
| **settlement** | `⟨SETTLEMENT_ID⟩` | [view](⟨EXPLORER_LINK⟩) |
| USDC (Stellar Asset Contract) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | [view](https://stellar.expert/explorer/testnet/contract/CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA) |

> USDC is a SAC wrapping the classic asset `USDC` issued by `⟨USDC_ISSUER_G_ADDRESS⟩` (issuer G-address, used only to build `change_trust` trustline txs — **not** for Soroban token calls). All player stakes, trader bets, and fee distributions are denominated in USDC.

### Smart-contract folder structure

```
contracts/
├── Cargo.toml            # Rust workspace (5 contracts)
├── Cargo.lock
├── Makefile              # build / test / fmt / lint / deploy helpers
├── README.md
├── match_registry/src/lib.rs      # match lifecycle: create, join, cancel, complete
├── escrow_vault/src/
│   ├── lib.rs                      # USDC stake custody: deposit, refund, release, bonus
│   └── events.rs                   # deposit / release / refund events
├── prediction_pool/src/lib.rs     # three-outcome parimutuel market: bet, lock, settle, pay
├── oracle_gateway/src/lib.rs      # Stockfish eval ingestion + threshold auto-lock
└── settlement/src/lib.rs          # orchestrates escrow + pool payout on match end
```

### Contract ↔ frontend/relayer function mapping

| Contract fn (Rust) | Caller (TypeScript) |
|---|---|
| `match_registry.create_match` / `join_match` / `cancel_match` | `frontend/src/lib/contracts.ts` ← `app/create/page.tsx`, `hooks/useMatch.ts` |
| `escrow_vault.record_deposit` / `refund` / `release` | `relayer/src/stellar/contracts/escrowVault.ts` (settlement path) |
| `prediction_pool.open_market` / `buy_outcome` / `get_odds` | `frontend/src/lib/contracts.ts` ← `components/trading/BetForm.tsx`, `hooks/useTrading.ts` |
| `prediction_pool.lock_market` / `settle` / `pay_trader` | `relayer/src/stellar/contracts/predictionPool.ts` |
| `oracle_gateway.post_evaluation` / `post_result` | `relayer/src/stellar/contracts/oracleGateway.ts` (eval relayer) |
| `settlement.execute` | `relayer/src/stellar/contracts/settlement.ts` |

Contract IDs are wired through `frontend/src/lib/contracts.ts` from `NEXT_PUBLIC_*` env vars (see [§23](#23-environment-variables)). Full evidence with tx-hash links: [§25 Deployment Evidence](#25-deployment-evidence).

### CI/CD (GitHub Actions — `.github/workflows/`)

- **`ci.yml`** (push/PR to any branch) — **contracts job:** `cargo fmt --check` → `cargo clippy -D warnings` → `cargo test` → `cargo build --target wasm32v1-none --release` → upload wasm; **frontend job:** `npm ci` → `npm run lint` → `tsc --noEmit` → `npm run test:ci` → `npm run build`. Fails on any lint/type/test/build error.
- **`deploy.yml`** (push to `main` + manual dispatch) — **deploy-contract:** *manual-only* (gated behind `workflow_dispatch`); build wasm → `stellar contract deploy` (all 5 contracts) on testnet; **deploy-frontend:** runs on every push → `npm run build` with `NEXT_PUBLIC_*` → `vercel --prod`. Contracts are **never** redeployed on a normal push (that would mint new addresses); the frontend falls back to the existing contract IDs from secrets. Details in [§21](#21-cicd-pipeline)–[§22](#22-deployment--rollback).

---

## Mobile Responsive UI

<div align="center">
  <img
    src="https://github.com/user-attachments/assets/cddc2bb9-b702-4d61-aec0-abbdcc9cbd77"
    alt="Mobile Responsive UI"
    width="300"
  />
</div>

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Why Chess Betting on Stellar](#2-why-chess-betting-on-stellar)
4. [Full System Architecture](#4-full-system-architecture)
   - 4.1 [High-Level Architecture](#41-high-level-architecture)
   - 4.2 [Contract Layer](#42-contract-layer)
   - 4.3 [Frontend Layer](#43-frontend-layer)
   - 4.4 [Data Flow Diagram](#44-data-flow-diagram)
8. [The Match & Market Flow — End-to-End](#8-the-match--market-flow--end-to-end)
   - 8.1 [Creating & Joining a Match](#81-creating--joining-a-match)
   - 8.2 [Placing a Prediction Bet](#82-placing-a-prediction-bet)
   - 8.3 [Market Auto-Lock](#83-market-auto-lock)
   - 8.4 [Settlement & Payout](#84-settlement--payout)
9. [Frontend Architecture](#9-frontend-architecture)
   - 9.1 [Match Page](#91-match-page)
   - 9.2 [Trading Panel](#92-trading-panel)
   - 9.3 [Lobby & History](#93-lobby--history)
10. [USDC Testnet Setup](#10-usdc-testnet-setup)
11. [Project Structure](#11-project-structure)
12. [Development Setup](#12-development-setup)
13. [Contract Deployment](#13-contract-deployment)
14. [Testing Strategy](#14-testing-strategy)
15. [Security Considerations](#15-security-considerations)
16. [Known Limitations & Future Work](#16-known-limitations--future-work)
18. [Wallet Integration (Freighter)](#18-wallet-integration-freighter)
19. [Event Streaming & Real-Time Updates](#19-event-streaming--real-time-updates)
20. [Testing — Run & Outputs](#20-testing--run--outputs)
21. [CI/CD Pipeline](#21-cicd-pipeline)
22. [Deployment & Rollback](#22-deployment--rollback)
23. [Environment Variables](#23-environment-variables)
24. [Troubleshooting](#24-troubleshooting)
25. [Deployment Evidence](#25-deployment-evidence)
26. [User Feedback Implementation](#26-user-feedback-implementation)

---
## Quick Links

| Resource | Link |
|----|-----|
| Live Demo | [Live Link](⟨LIVE_APP_URL⟩) |
| Demo Video | [Video link](⟨DEMO_VIDEO_URL⟩) |

---

## 1. Project Overview

MateFi is a fully decentralised application on Stellar Testnet that merges two products into one on-chain experience: **peer-to-peer chess betting** and a **live parimutuel prediction market**. It is built entirely on Stellar's **Soroban** smart contract platform.

### What It Is

Two players agree on a USDC stake, both lock funds into a Soroban escrow contract, play a standard timed chess game, and the winner receives the full prize pool automatically through smart-contract settlement — no custodian, no manual payout. While the match is live, any spectator can bet USDC on the outcome through a three-outcome parimutuel pool (Player A / Player B / Draw).

### What This Project Builds

The MVP covers the full end-to-end loop:

| Section | What it does |
|---|---|
| **Lobby** | Browse open and live matches; create or join a staked game. |
| **Match** | Live chess board, per-player clock, Stockfish eval bar, prize pool. |
| **Trading** | Bet on the live match outcome with real-time parimutuel odds. |
| **History** | Completed matches, results, and settlement records. |

### The Flywheel

A portion of trading fees flows back into the player prize pool, creating a self-reinforcing loop:

```
Bigger prizes → Better players → More spectators → More trading volume → Bigger prizes
```

### Target Environment

| Setting | Value |
|---|---|
| Network | Stellar Testnet |
| Smart Contract VM | Soroban (WASM) |
| Contract Language | Rust |
| Token | USDC (SEP-41 SAC on testnet) |
| Frontend | Next.js 14 + TypeScript + Stellar SDK |
| Wallet | Freighter (browser extension) |

---

## 2. Why Chess Betting on Stellar

### The Trust Problem

Online chess wagering today is either custodial or trust-based — someone always holds the money, can freeze funds, and pays out at their own discretion. MateFi removes the intermediary entirely: stakes sit in smart-contract escrow and settlement is executed by code.

### Why Soroban Changes Everything

Soroban brings general-purpose smart contracts to Stellar. This unlocks:

- **Arbitrary on-chain logic** — escrow state machines, parimutuel payout math, oracle thresholds
- **Composable DeFi** — settlement orchestrates escrow + prediction pool in one flow
- **Custom token standards** — SEP-41 compliant USDC callable from contracts

### Why USDC on Stellar

- **Sub-cent fees & ~5s finality** — betting is many small transactions (bet, approve, settle, payout); Stellar makes them economical.
- **Stable-value wagering** — players and spectators bet in dollars, not a volatile token.
- **Native USDC** — Circle issues USDC natively on Stellar, available on testnet.

---

## 4. Full System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 14)                    │
│  ┌──────────┐   ┌─────────────┐   ┌──────────────────────┐  │
│  │  Lobby   │   │    Match    │   │      Trading         │  │
│  └──────────┘   └─────────────┘   └──────────────────────┘  │
│       │                │                      │              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Stellar SDK + Freighter Wallet              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────┬──────────────┘
               │ XDR transactions              │ WebSocket
               ▼                               ▼
┌───────────────────────────────┐   ┌──────────────────────────┐
│   STELLAR TESTNET (Soroban)   │   │   RELAYER (Node + WS)    │
│                               │   │  Stockfish eval, move    │
│  match_registry ─┐            │◀──│  sync, event listener,   │
│  escrow_vault    │            │   │  settlement orchestration│
│  prediction_pool ├─ settlement│   └──────────────────────────┘
│  oracle_gateway ─┘            │
│         │ token transfers     │
│         ▼                     │
│  ┌─────────────┐              │
│  │  USDC SAC   │              │
│  └─────────────┘              │
└───────────────────────────────┘
```

### 4.2 Contract Layer

| Contract | Purpose | Key Functions |
|---|---|---|
| `match_registry` | Match lifecycle & players | `create_match`, `join_match`, `cancel_match`, `complete_match`, `get_match` |
| `escrow_vault` | USDC stake custody | `record_deposit`, `refund`, `release`, `release_draw`, `add_bonus` |
| `prediction_pool` | Three-outcome parimutuel market | `open_market`, `buy_outcome`, `lock_market`, `settle`, `pay_trader`, `get_odds` |
| `oracle_gateway` | Eval ingestion & auto-lock | `post_evaluation`, `post_result`, `set_threshold`, `set_confirmations` |
| `settlement` | Payout orchestration | `execute` |

### 4.3 Frontend Layer

| Module | Tech | Purpose |
|---|---|---|
| `app/match/[matchId]` | Next.js + Stellar SDK | Live board, clocks, eval bar, trading panel |
| `components/board/*` | react-chessboard + chess.js | Board, eval bar, move history |
| `components/trading/*` | React | Bet form, live odds, pool bars, market status |
| `hooks/useMatch.ts` | React | Match state + on-chain reads |
| `hooks/useTrading.ts` | React | Parimutuel odds, place-bet flow |
| `hooks/useWebSocket.ts` | React | Real-time move & event stream from relayer |
| `lib/contracts.ts` | Stellar SDK | Soroban contract call wrappers |
| `lib/stellar.ts` / `usdc.ts` | Stellar SDK | Tx building, signing, USDC reads |

### 4.4 Data Flow Diagram

**Prediction bet flow:**
```
Spectator inputs "bet 50 USDC on Player A"
        │
        ▼
Frontend reads live odds via prediction_pool.get_odds() (Soroban sim, no fee)
        │
        ▼
User confirms → Frontend builds Transaction:
  - USDC approve → prediction_pool.buy_outcome(match_id, outcome, amount)
        │
        ▼
Freighter signs → Stellar SDK submits to testnet
        │
        ▼
prediction_pool updates outcome pools, records the trader's position
        │
        ▼
Relayer's event listener picks up the on-chain event → pushes over WebSocket
        │
        ▼
Trading UI re-renders live odds / pool bars for every connected spectator
```

**Oracle / auto-lock flow:**
```
After each move, relayer runs Stockfish (depth 18)
        │
        ▼
Relayer signs oracle_gateway.post_evaluation(match_id, centipawns)
        │
        ▼
oracle_gateway tracks sustained advantage:
  if |eval| ≥ threshold (±250 cp) for N consecutive moves (default 3)
        │
        ▼
Market auto-locks (prediction_pool.lock_market) — no more bets (anti-snipe)
        │
        ▼
On game end → settlement.execute → escrow release + pool settle + fee flywheel
```

---

## 8. The Match & Market Flow — End-to-End

### 8.1 Creating & Joining a Match

**Scenario:** Player A wants to stake 100 USDC on a 10-minute game.

```
1. Player A opens /create
   Sets stake = 100 USDC, time control = 10 min
   Frontend: USDC approve → match_registry.create_match(stake, time_control)
   escrow_vault.record_deposit(match_id, player_a, 100)
   → Match created in "Open" state, 100 USDC locked

2. Player B opens the lobby, sees the open match, clicks Join
   Frontend: USDC approve → match_registry.join_match(match_id)
   escrow_vault.record_deposit(match_id, player_b, 100)
   → Match becomes "Active", prize pool = 200 USDC
   → prediction_pool.open_market(match_id) — spectator betting opens

3. If nobody joins, Player A can cancel:
   match_registry.cancel_match(match_id) → escrow_vault.refund(match_id)
   → Player A's 100 USDC returned
```

### 8.2 Placing a Prediction Bet

```
1. Spectator opens the live match page
   Trading panel reads prediction_pool.get_odds(match_id)
   → Player A 55% · Draw 12% · Player B 33% (implied from pool totals)

2. Spectator bets 50 USDC on Player A
   Frontend: USDC approve → prediction_pool.buy_outcome(match_id, OUTCOME_A, 50)
   → Pool A grows, odds shift live, position recorded for the spectator

3. Odds update in real time for all viewers via the relayer WebSocket
```

### 8.3 Market Auto-Lock

```
The relayer posts a Stockfish evaluation after every move:
  oracle_gateway.post_evaluation(match_id, centipawns)

Lock rule (anti-snipe):
  if |eval| ≥ 250 cp for 3 consecutive moves → market locks
  (a transient tactical spike that recovers does NOT lock)

Once locked:
  prediction_pool.buy_outcome() rejects new bets
  existing positions remain, awaiting settlement
```

### 8.4 Settlement & Payout

```
On game end (checkmate / resignation / timeout / draw):
  relayer calls settlement.execute(match_id, result)

settlement orchestrates:
  1. escrow_vault.release(match_id, winner)      # winner takes the 200 USDC prize
     — or escrow_vault.release_draw(match_id)    # draw refunds both players
  2. prediction_pool.settle(match_id, result)    # winning outcome recorded
  3. fee flywheel: a share of trading fees → escrow_vault.add_bonus (prize pool)
  4. winning spectators call prediction_pool.pay_trader() for proportional payout
  5. match_registry.complete_match(match_id)     # match marked completed
```

---

## 9. Frontend Architecture

### 9.1 Match Page

Live game view at `app/match/[matchId]/page.tsx`.

**Component tree:**
```
MatchPage
├── ChessBoard            # react-chessboard + chess.js, real-time move sync
├── EvalBar               # animated Stockfish centipawn advantage
├── MoveHistory           # SAN move list
├── Clock (×2)            # per-player countdown, auto-flag on timeout
├── PlayerInfo (×2)       # G-address, side, connection state
├── PrizePool             # live escrowed USDC total
├── TradingPanel          # bet form + odds + pool bars (see §9.2)
└── SettlementModal       # result + payout on game end
```

### 9.2 Trading Panel

```
TradingPanel
├── MarketStatus          # Open / Locked / Settled
├── OddsDisplay           # live implied probabilities from pool totals
├── PoolBars              # visual A / Draw / B pool sizes
└── BetForm
    └── Calls prediction_pool.buy_outcome() (USDC approve → bet)
```

**Real-time odds (via relayer WebSocket + on-chain reads):**
```typescript
// hooks/useTrading.ts
export function useTrading(matchId: string) {
  // reads prediction_pool.get_odds() and subscribes to WS pool updates
  // exposes { odds, pools, marketStatus, placeBet, isLoading, error }
}
```

### 9.3 Lobby & History

- **Lobby** (`app/page.tsx`) — `OpenMatches` + `LiveMatches` lists built from `MatchCard`s.
- **History** (`app/history/page.tsx`) — completed matches with results and settlement records.
- **Wallet** (`app/wallet/page.tsx`) — Freighter connect, XLM balance, send-XLM demo (see §18).

---

## 10. USDC Testnet Setup

### Token Address (Stellar Testnet)

| Token | Type | Soroban address (SAC) | Classic issuer |
|---|---|---|---|
| USDC | SEP-41 SAC over classic USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | `⟨USDC_ISSUER_G_ADDRESS⟩` |

> USDC in Soroban is accessed via the Stellar Asset Contract (SAC) — the `C…` address, not the issuer G-address. The issuer is only used to build `change_trust` trustline transactions.

### Getting Testnet Funds

- **XLM:** Fund any account via [friendbot](https://friendbot.stellar.org) (needed for tx fees).
- **USDC:** Establish a USDC trustline, then use the Circle testnet faucet for USDC.

---

## 11. Project Structure

```
matefi/
│
├── contracts/                    # Soroban smart contracts (Rust)
│   ├── match_registry/src/lib.rs
│   ├── escrow_vault/src/
│   │   ├── lib.rs
│   │   ├── events.rs
│   │   └── test.rs
│   ├── prediction_pool/src/lib.rs
│   ├── oracle_gateway/src/lib.rs
│   ├── settlement/src/lib.rs
│   ├── Cargo.toml                # Workspace
│   ├── Cargo.lock
│   └── Makefile
│
├── frontend/                     # Next.js 14 + TypeScript
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Lobby
│   │   │   ├── create/page.tsx    # Create match
│   │   │   ├── match/[matchId]/page.tsx
│   │   │   ├── history/page.tsx
│   │   │   └── wallet/page.tsx
│   │   ├── components/
│   │   │   ├── board/             # ChessBoard, EvalBar, MoveHistory
│   │   │   ├── match/             # Clock, PlayerInfo, PrizePool, SettlementModal
│   │   │   ├── trading/           # BetForm, OddsDisplay, PoolBars, MarketStatus
│   │   │   ├── lobby/             # OpenMatches, LiveMatches, MatchCard
│   │   │   ├── wallet/            # WalletStatus, XlmBalance, SendXlmForm
│   │   │   └── shared/            # Navbar, WalletButton, USDCBalance
│   │   ├── hooks/                 # useMatch, useTrading, useWallet, useWebSocket, ...
│   │   ├── lib/                   # contracts.ts, stellar.ts, usdc.ts, chess.ts, horizon.ts
│   │   └── types/                 # match.ts, trading.ts, events.ts
│   ├── package.json
│   └── jest.config.js
│
├── relayer/                      # Node oracle relayer + WebSocket server
│   ├── src/
│   │   ├── api/                  # matches, traders, router
│   │   ├── chess/                # engine (Stockfish), gameManager, validator
│   │   ├── db/                   # client, migrate, migrations, queries
│   │   ├── stellar/              # client, eventListener, reconcile, signer, contracts/*
│   │   ├── websocket/            # server, events
│   │   ├── config.ts
│   │   └── index.ts
│   └── package.json
│
├── scripts/                      # Deployment + helper scripts
├── docs/                         # Additional documentation
├── docker-compose.yml
├── .github/workflows/            # ci.yml, deploy.yml
└── README.md                     # This file
```

---

## 12. Development Setup

### Prerequisites

```bash
# Rust + Soroban toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
cargo install --locked stellar-cli

# Node.js 20+
nvm install 20

# Stellar CLI
stellar version
```

### Environment Variables

Create `frontend/.env.local` (see `frontend/.env.local.example`) and `relayer/.env` (see `relayer/.env.example`):

```env
# --- Network ---
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# --- Deployed contract addresses (current testnet deployment) ---
NEXT_PUBLIC_MATCH_REGISTRY_ID=⟨MATCH_REGISTRY_ID⟩
NEXT_PUBLIC_ESCROW_VAULT_ID=⟨ESCROW_VAULT_ID⟩
NEXT_PUBLIC_PREDICTION_POOL_ID=⟨PREDICTION_POOL_ID⟩
NEXT_PUBLIC_ORACLE_GATEWAY_ID=⟨ORACLE_GATEWAY_ID⟩
NEXT_PUBLIC_SETTLEMENT_ID=⟨SETTLEMENT_ID⟩
NEXT_PUBLIC_USDC_CONTRACT_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA

# --- Relayer / API ---
NEXT_PUBLIC_API_URL=⟨API_URL⟩
NEXT_PUBLIC_WS_URL=⟨WEBSOCKET_URL⟩

# --- Relayer secrets (relayer/.env, never commit) ---
STELLAR_SECRET_KEY=⟨FUNDED_TESTNET_SECRET⟩
```

### Build Contracts

```bash
cd contracts
make build      # cargo build --target wasm32v1-none --release
make test       # cargo test
make lint       # cargo clippy -- -D warnings
```

### Start Frontend & Relayer

```bash
# Frontend
cd frontend
npm install
npm run dev      # http://localhost:3002

# Relayer (separate terminal)
cd relayer
npm install
npm run migrate  # set up the database
npm run dev
```

---

## 13. Contract Deployment

Deploy all five contracts to testnet:

```bash
# 1. Set up a funded testnet account
stellar keys generate deployer --network testnet
stellar keys fund deployer --network testnet   # Friendbot funds it

# 2. Build WASM
cd contracts
cargo build --target wasm32v1-none --release

# 3. Deploy each contract
for c in match_registry escrow_vault prediction_pool oracle_gateway settlement; do
  stellar contract deploy \
    --wasm target/wasm32v1-none/release/$c.wasm \
    --source deployer \
    --network testnet \
    --alias $c
done

# 4. Initialize each contract (see contracts/README.md for init args)
#    e.g. stellar contract invoke --id <id> --source deployer --network testnet -- initialize ...
```

> `deploy.yml`'s `deploy-contract` job automates this on **manual dispatch only** — see §21.

---

## 14. Testing Strategy

### Unit Tests (Rust — `soroban_sdk::testutils`)

Each contract has an inline `#[cfg(test)]` / `src/test.rs` suite covering access control, state transitions, and payout math:

```rust
// contracts/prediction_pool/src/lib.rs (excerpt)

#[test]
fn buy_outcome_updates_pools_and_records_position() { /* ... */ }

#[test]
fn buy_outcome_rejected_when_locked() { /* ... */ }

#[test]
fn pay_trader_pays_proportional_share() { /* ... */ }

#[test]
fn settle_distributes_fees_and_records_result() { /* ... */ }
```

### Integration Tests

```rust
// contracts/settlement/src/lib.rs
#[test]
fn full_e2e_via_oracle_flow() {
    // create → join → bet → post evaluations → lock → execute → assert payouts
}
```

### Frontend Tests (Jest)

```bash
cd frontend
npm run test:ci   # jest --ci --coverage
```

---

## 15. Security Considerations

### One-Way State Transitions

Escrow, registry, prediction pool, and settlement enforce irreversible transitions: a **locked** market can never reopen, a **settled** match can never re-settle, and a **completed** match can never be replayed — preventing double-spend and double-payout.

### Authorization

Every fund-moving operation checks `require_auth()` on the acting party. The oracle gateway restricts `post_evaluation` / `set_threshold` to the authorized **relayer** identity; players cannot post their own evaluations.

### Oracle Manipulation

Bets can't be sniped on a decisive position: the market only auto-locks after a **sustained** advantage (±250 cp for 3 consecutive moves). A transient tactical spike that recovers keeps the market open, and evaluations are relayer-signed.

### Integer Overflow & Payout Math

Parimutuel payouts use integer arithmetic with checked operations; edge cases (no bets on the winning outcome → net swept to treasury, draw → refund both players) are covered by tests.

### Escrow Custody

Stakes are only released by `settlement.execute` on a verified result, or refunded via `cancel_match`. No party can withdraw another player's deposit.

---

## 16. Known Limitations & Future Work

| Limitation | Impact | Future fix |
|---|---|---|
| Single relayer oracle | Centralized eval source | Decentralize the evaluation oracle / multi-signer |
| USDC only | No multi-asset stakes | Add more SEP-41 assets |
| Testnet only | Not real value | Mainnet deploy with production USDC |
| Manual settlement trigger | Relayer must be online | Keeper / redundancy for `settlement.execute` |
| Frontend test coverage | ~11% statements | Expand hook + component tests |
| Soroban resource limits | Large markets may hit compute limits | Batch reads, optimize storage |

---

## 18. Wallet Integration (Freighter)

The app integrates the [Freighter](https://freighter.app) browser wallet on **Stellar testnet**. The integration is split into a small, explicit set of files so the wallet flow is easy to audit:

| File | Responsibility |
|---|---|
| `frontend/src/hooks/useFreighterWallet.ts` | Explicit `@stellar/freighter-api` calls: detect (`isConnected`), connect (`isAllowed` + `requestAccess` + `getAddress`), `signTransaction` with testnet passphrase. |
| `frontend/src/lib/horizon.ts` | Horizon helpers: fetch XLM balance (GET `/accounts/{id}`, 404 → `0`), build native payment, submit signed tx → `{ hash }`. |
| `frontend/src/hooks/useWallet.ts` / `useXlmBalance.ts` | Wallet + balance state: `{ address, balance, isConnected, isLoading, error, connect, disconnect, refreshBalance, sendXlm }`. |
| `frontend/src/components/wallet/*` | UI: `WalletStatus` (install prompt → connect → address + balance), `XlmBalance`, `SendXlmForm` (tx hash with stellar.expert link). |
| `frontend/src/lib/usdc.ts` | Reads on-chain USDC balance via Soroban simulation; used by `components/shared/USDCBalance.tsx`. |

**Flow:** detect → connect → fetch balance → sign match/bet/settlement contract invocations through Freighter's `signTransaction` API → display transaction hash linking to `stellar.expert/explorer/testnet/tx/<hash>`.

---

## 19. Event Streaming & Real-Time Updates

### On-chain events

Each state-changing contract action publishes a Soroban event (e.g. `contracts/escrow_vault/src/events.rs`):

| Contract | Event | Emitted on |
|---|---|---|
| match_registry | `match_created` / `match_joined` / `match_completed` | lifecycle transitions |
| escrow_vault | `deposit` / `release` / `refund` | stake custody changes |
| prediction_pool | `bet` / `market_locked` / `settled` | betting + settlement |
| oracle_gateway | `evaluation` / `result` | each posted Stockfish eval / final result |

### Relayer + frontend real-time model

The relayer (`relayer/src/stellar/eventListener.ts`) subscribes to Soroban RPC, de-duplicates events (`db/migrations/002_event_dedupe.sql`), and rebroadcasts to the browser over a **WebSocket** (`relayer/src/websocket/server.ts`):

- `hooks/useWebSocket.ts` subscribes to match + market channels; moves, odds, eval bar, and market status update live without a page refresh.
- **Move sync:** the relayer's `chess/gameManager.ts` validates moves and streams them to both players and spectators.
- **Reconnection/sync:** on reconnect, the client re-subscribes and the relayer's `stellar/reconcile.ts` reconciles any missed on-chain state, so a dropped connection self-heals.

---

## 20. Testing — Run & Outputs

### Smart-contract tests (Rust / `soroban_sdk::testutils`)
```bash
cd contracts
make test            # or: cargo test
```
```
   Running unittests src/lib.rs (escrow_vault)
test result: ok. 12 passed; 0 failed; 0 ignored
   Running unittests src/lib.rs (match_registry)
test result: ok. 13 passed; 0 failed; 0 ignored
   Running unittests src/lib.rs (oracle_gateway)
test result: ok. 18 passed; 0 failed; 0 ignored
   Running unittests src/lib.rs (prediction_pool)
test result: ok. 17 passed; 0 failed; 0 ignored
   Running unittests src/lib.rs (settlement)
test result: ok. 9 passed; 0 failed; 0 ignored
```
- **69 passing contract tests** across the 5 contracts: access control, one-way state transitions, parimutuel payout math, oracle lock thresholds, and a full end-to-end oracle → settlement flow.

### Frontend tests (Jest)
```bash
cd frontend
npm run test:ci      # jest --ci --coverage
```
```
Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total
```
- **33 passing frontend tests** covering the Stellar libs, contract wrappers, and USDC helpers.

---

## 21. CI/CD Pipeline

<!-- ⟨paste CI/CD pipeline screenshot here⟩ -->
<img width="2854" height="1104" alt="MateFi CI/CD pipeline" src="⟨CICD_SCREENSHOT_URL⟩" />

Two GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — runs on every push & pull request
| Job | Steps |
|---|---|
| **contracts** | checkout → install Rust + `wasm32v1-none` → `cargo fmt --check` → `cargo clippy -D warnings` → `cargo test` → `cargo build --target wasm32v1-none --release` → upload wasm artifacts |
| **frontend** | checkout → `setup-node@v4` (npm cache) → `npm ci` → `npm run lint` → `tsc --noEmit` → `npm run test:ci` → `npm run build` → upload `.next` artifact |

The build fails if **any** step fails (lint error, type error, failing test, or broken build), satisfying "fails correctly when errors occur." Both jobs produce downloadable artifacts (contract wasm + frontend build).

### `deploy.yml` — manual dispatch (contracts) + push to `main` (frontend)
| Job | Steps |
|---|---|
| **deploy-contract** | *manual-only* (`workflow_dispatch` + `deploy_contracts` flag) → install Rust + wasm target → install Stellar CLI → build wasm → `stellar contract deploy` (all 5 contracts) using `secrets.STELLAR_SECRET_KEY`, network testnet → expose contract-id outputs |
| **deploy-frontend** | runs on every push (`if: !failure()`) → `npm ci` → `npm run build` with `NEXT_PUBLIC_*` from secrets (falls back to existing contract IDs when contracts aren't redeployed) → `vercel --prod` |
| **smoke-test** | `needs: deploy-frontend` → curl the deployed URL, assert HTTP 200 |

> **Contracts are never redeployed on a normal push** — that would mint brand-new addresses and wipe on-chain state. Redeploying is a deliberate manual action (Actions → Deploy → *Run workflow* → tick "Redeploy smart contracts").

---

## 22. Deployment & Rollback

### Contracts (testnet)
```bash
cd contracts
make deploy STELLAR_SECRET_KEY=S...     # or the manual deploy-contract job
```

### Frontend (Vercel)
Set the `NEXT_PUBLIC_*` variables (see §23) in **Vercel → Settings → Environment Variables**, then `vercel --prod` (or the `deploy-frontend` job). `NEXT_PUBLIC_*` values are **inlined at build time** — change them ⇒ rebuild.

### Rollback
- **Frontend:** Vercel keeps every deployment immutable — use *Instant Rollback* (or `vercel rollback <url>`).
- **Contracts:** Soroban deploys are immutable per contract id. To roll back, re-point the frontend `NEXT_PUBLIC_*_ID` at the previous known-good contract ids and redeploy the frontend.

### Verification
After deploy: open a match page → the prize pool + odds read live on-chain state (proves contract reads work), connect Freighter, place a bet — the tx hash links to stellar.expert.

---

## 23. Environment Variables

Frontend (`frontend/.env.local` locally, Vercel env in prod):

| Variable | Example | Notes |
|---|---|---|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | testnet |
| `NEXT_PUBLIC_MATCH_REGISTRY_ID` | `C…` | match_registry contract id |
| `NEXT_PUBLIC_ESCROW_VAULT_ID` | `C…` | escrow_vault contract id |
| `NEXT_PUBLIC_PREDICTION_POOL_ID` | `C…` | prediction_pool contract id |
| `NEXT_PUBLIC_ORACLE_GATEWAY_ID` | `C…` | oracle_gateway contract id |
| `NEXT_PUBLIC_SETTLEMENT_ID` | `C…` | settlement contract id |
| `NEXT_PUBLIC_USDC_CONTRACT_ID` | `C…` | USDC SAC |
| `NEXT_PUBLIC_API_URL` | `https://…/api` | relayer REST API |
| `NEXT_PUBLIC_WS_URL` | `wss://…` | relayer WebSocket |

Contracts / CI secrets: `STELLAR_SECRET_KEY` (funded testnet secret), `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, plus the `NEXT_PUBLIC_*` values as GitHub Actions secrets for the deploy job. Templates: `frontend/.env.local.example`, `relayer/.env.example`.

---

## 24. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deployed site shows **no matches / odds** | `NEXT_PUBLIC_*` not set in Vercel (they inline at build time). | Add them in Vercel → Settings → Environment Variables, then **redeploy with build cache off**. |
| "Freighter not detected" | Extension missing/locked. | Install from freighter.app; unlock; set network to Testnet. |
| Bet / join fails with auth error | USDC spend not approved. | The UI builds an `approve` before `buy_outcome` / `join_match`; ensure it's signed first. |
| Balance shows `0 XLM (account not funded)` | Testnet account not created. | Fund via [friendbot](https://friendbot.stellar.org). |
| Odds / moves don't update live | Relayer / WebSocket down. | Check `NEXT_PUBLIC_WS_URL` and that the relayer is running. |
| `cargo test` can't find `wasm32` target | Target not installed. | `rustup target add wasm32v1-none`. |
| CI `npm ci` fails | `package-lock.json` out of sync. | Commit the updated lockfile. |

---

## 25. Deployment Evidence

**Network:** Stellar Testnet · `Test SDF Network ; September 2015`

| Contract | Address (testnet) |
|---|---|
| match_registry | `⟨MATCH_REGISTRY_ID⟩` |
| escrow_vault | `⟨ESCROW_VAULT_ID⟩` |
| prediction_pool | `⟨PREDICTION_POOL_ID⟩` |
| oracle_gateway | `⟨ORACLE_GATEWAY_ID⟩` |
| settlement | `⟨SETTLEMENT_ID⟩` |
| USDC (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

**Transaction hashes (contract interaction evidence):**

| Action | Tx Hash | Explorer |
|---|---|---|
| create_match | `⟨TX_HASH⟩` | [view](⟨TX_EXPLORER_LINK⟩) |
| join_match | `⟨TX_HASH⟩` | [view](⟨TX_EXPLORER_LINK⟩) |
| buy_outcome (bet) | `⟨TX_HASH⟩` | [view](⟨TX_EXPLORER_LINK⟩) |
| settlement.execute | `⟨TX_HASH⟩` | [view](⟨TX_EXPLORER_LINK⟩) |

Explore every contract's deploy + interaction transaction hashes on [stellar.expert](https://stellar.expert/explorer/testnet) (Contract → History tab lists every invocation hash). Live frontend: ⟨LIVE_APP_URL⟩.

**Test evidence:** 69 passing contract tests + 33 passing frontend tests (§20).
**Build evidence:** `npm run build` prerenders all routes; `cargo build --target wasm32v1-none --release` produces 5 contract wasms.

---

## 26. User Feedback Implementation

The product went through a round of hands-on user feedback. Each row maps the feedback received to the concrete change shipped for it and the commit that contains that change.

| # | User Feedback | Implementation | Commit |
|---|---|---|---|
| 1 | ⟨feedback⟩ | ⟨implementation⟩ | [`⟨commit⟩`](⟨COMMIT_LINK⟩) |
| 2 | ⟨feedback⟩ | ⟨implementation⟩ | [`⟨commit⟩`](⟨COMMIT_LINK⟩) |
| 3 | ⟨feedback⟩ | ⟨implementation⟩ | [`⟨commit⟩`](⟨COMMIT_LINK⟩) |

---
