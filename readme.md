# ChessBet — On-Chain Chess Betting & Prediction Market on Stellar Testnet

> **For Claude Code:** This README is the single source of truth for building ChessBet end-to-end. Read every section before writing a single line of code. Every architectural decision, contract interface, data flow, and UI requirement is specified here. Build exactly what is described — do not substitute libraries, change contract structures, or simplify flows without explicit justification.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Locked Design Decisions](#2-locked-design-decisions)
3. [System Architecture](#3-system-architecture)
4. [Project Skeleton](#4-project-skeleton)
5. [Soroban Smart Contracts (Rust)](#5-soroban-smart-contracts-rust)
6. [Off-Chain Relayer (Node.js)](#6-off-chain-relayer-nodejs)
7. [Frontend (Next.js)](#7-frontend-nextjs)
8. [End-to-End Game Flow](#8-end-to-end-game-flow)
9. [End-to-End Trading Flow](#9-end-to-end-trading-flow)
10. [Fee & Prize Math](#10-fee--prize-math)
11. [Stockfish Evaluation Lock Mechanism](#11-stockfish-evaluation-lock-mechanism)
12. [Database Schema (PostgreSQL)](#12-database-schema-postgresql)
13. [WebSocket Event Specification](#13-websocket-event-specification)
14. [Environment Variables](#14-environment-variables)
15. [Deployment Guide (Stellar Testnet)](#15-deployment-guide-stellar-testnet)
16. [Build Order](#16-build-order)

---

## 1. Project Overview

ChessBet is a decentralized application on Stellar Testnet that combines two products:

**Product 1 — P2P Chess Betting:** Two players agree on a USDC bet amount, both lock their funds into a Soroban escrow vault, play a chess game, and the winner receives the full prize pool automatically via smart contract settlement.

**Product 2 — Live Prediction Market:** While a match is active, any spectator (trader) can bet USDC on who they think will win using a parimutuel pool system. The market locks when Stockfish's position evaluation crosses a configurable centipawn threshold, preventing late sniping. A percentage of trading fees flows back into the player prize pool, creating a flywheel: bigger bets → more spectators → more trading volume → bigger prizes → better players.

**Token:** USDC only. All player bets, trader bets, and fee distributions are denominated in USDC (Circle-issued USDC on Stellar Testnet).

**Smart Contract Platform:** Stellar Soroban (Rust → WASM).

**Frontend:** Next.js 14 (App Router).

**Relayer:** Node.js with Stockfish integration.

**Network:** Stellar Testnet throughout. Mainnet deployment follows the same architecture.

---

## 2. Locked Design Decisions

These decisions were made during design and must not be changed:

| Decision | Choice | Reason |
|---|---|---|
| Token | USDC only | Stable math, no XLM price volatility, Circle-issued on Stellar |
| Prediction market mechanism | Parimutuel pool | No LP risk, binary outcomes native, simplest Soroban logic |
| Market lock trigger | Stockfish evaluation threshold | Prevents late sniping based on actual game state |
| Evaluation threshold | ±250 centipawns (absolute value) | Sweet spot — position is better for one side but still uncertain |
| Stockfish depth | 18 | Deep enough for meaningful eval, fast enough for real-time |
| Lock direction | One-way only | Once locked, never unlocks — no flickering |
| Number of outcomes | 3 — Player A wins / Player B wins / Draw | Standard chess outcomes |
| Draw handling | Players get deposits back; Draw traders split net pool | Fairest outcome for all parties |
| Protocol fee | 3% of total trading volume + 3% of player pool | Sustainable revenue |
| Fee split | 1% treasury + 2% added to player prize pool | Flywheel mechanic |
| Player prize split | 97% winner, 3% protocol | Standard rake |
| Contract count | 5 contracts | One responsibility each |
| v1 oracle trust | Single relayer, whitelisted key | Acceptable for testnet; v2 = multi-sig |
| Frontend | Next.js 14 App Router | Modern React with server components |
| Chess engine (frontend) | chess.js + react-chessboard | Standard, well-maintained |
| Relayer runtime | Node.js + stockfish npm package | Simple, fast, Stellar SDK available |

---

## 3. System Architecture

### 3.1 Layer Overview

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 14)                                      │
│  Lobby Page │ Match Page │ History Page                     │
│  chess.js + react-chessboard │ @stellar/stellar-sdk        │
└────────────────────┬────────────────────────────────────────┘
                     │ WebSocket + REST
┌────────────────────▼────────────────────────────────────────┐
│  OFF-CHAIN RELAYER (Node.js)                                │
│  Game State Manager │ Stockfish Engine │ Move Validator     │
│  Stellar Tx Signer │ PostgreSQL Writer │ WebSocket Server   │
└────────────────────┬────────────────────────────────────────┘
                     │ Soroban RPC calls (signed txs)
┌────────────────────▼────────────────────────────────────────┐
│  STELLAR TESTNET — SOROBAN CONTRACTS (Rust/WASM)           │
│                                                             │
│  [1] MatchRegistry   [2] EscrowVault   [3] PredictionPool  │
│  [4] OracleGateway   [5] Settlement                        │
└────────────────────┬────────────────────────────────────────┘
                     │ reads
┌────────────────────▼────────────────────────────────────────┐
│  POSTGRESQL (off-chain cache)                               │
│  matches │ moves │ evaluations │ traders │ settlements      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Five Soroban Contracts and Their Responsibilities

#### Contract 1: MatchRegistry
- Entry point for all match creation and joining
- Validates bet amounts match between players
- Transitions match state machine: `Open → Active → Completed`
- Calls EscrowVault to lock funds on both players joining
- Emits events: `MatchCreated`, `MatchJoined`, `MatchActive`

#### Contract 2: EscrowVault
- Holds all player USDC — completely separate from trader USDC
- Has no public withdrawal function
- Only releases funds when called by Settlement contract
- Emits events: `FundsLocked`, `FundsReleased`

#### Contract 3: PredictionPool
- Manages the three-bucket parimutuel market per match
- Opens automatically when match becomes Active
- Accepts `buy_outcome()` from traders until market is locked
- Tracks positions: `Map<(match_id, trader, outcome), amount>`
- Stores pool totals: `pool_a`, `pool_b`, `pool_draw` per match
- Locks market when OracleGateway calls `lock_market()`
- Calculates and pays out winning traders on Settlement trigger
- Holds trader USDC separately from player USDC

#### Contract 4: OracleGateway
- Trust boundary between relayer and on-chain state
- Maintains whitelist of authorized relayer public keys
- Accepts `post_evaluation(match_id, fen, depth, score)` — stores eval history
- Accepts `post_result(match_id, winner)` — triggers Settlement
- Calls `PredictionPool.lock_market()` when eval threshold crossed
- Every call emits a full on-chain event for auditability

#### Contract 5: Settlement
- Triggered by OracleGateway posting a result
- Calls `EscrowVault.release()` for player funds
- Calculates each winning trader's parimutuel share
- Computes protocol fee (3% of trading volume + 3% of player pool)
- Adds 2% of trading fee back to player prize (flywheel)
- Distributes all funds in a single atomic operation
- Emits: `MatchSettled` with full breakdown

### 3.3 Money Flow Diagram

```
PLAYER BETS
Player A ──→ MatchRegistry ──→ EscrowVault (locked)
Player B ──→ MatchRegistry ──→ EscrowVault (locked)

TRADER BETS
Traders ──→ PredictionPool (3 buckets: A / B / Draw)
          [market locks when eval ≥ ±250 cp]

SETTLEMENT (triggered by Oracle posting result)
EscrowVault
  └─→ Player prize pool = (A_deposit + B_deposit)
      + (trading_volume × 0.02)        ← flywheel bonus
      └─→ Winner gets 97% of player prize pool
      └─→ 3% of player prize pool → treasury

PredictionPool (net = total_trading × 0.97)
  └─→ Winning traders split net pool proportionally
  └─→ Losing traders → redistributed to winners
  └─→ 1% of trading volume → treasury
  └─→ 2% of trading volume → player prize (above)
```

---

## 4. Project Skeleton

Create this exact directory structure before writing any code:

```
chessbet/
│
├── contracts/                          # Soroban Rust workspace
│   ├── Cargo.toml                      # workspace manifest
│   ├── match_registry/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state.rs
│   │       ├── events.rs
│   │       └── errors.rs
│   ├── escrow_vault/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state.rs
│   │       ├── events.rs
│   │       └── errors.rs
│   ├── prediction_pool/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state.rs
│   │       ├── events.rs
│   │       └── errors.rs
│   ├── oracle_gateway/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── state.rs
│   │       ├── events.rs
│   │       └── errors.rs
│   └── settlement/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── state.rs
│           ├── events.rs
│           └── errors.rs
│
├── relayer/                            # Node.js off-chain relayer
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts                    # entry point, starts all services
│       ├── config.ts                   # env vars, contract addresses
│       ├── stellar/
│       │   ├── client.ts               # Soroban RPC client setup
│       │   ├── signer.ts               # keypair management, tx signing
│       │   └── contracts/
│       │       ├── matchRegistry.ts    # contract call wrappers
│       │       ├── escrowVault.ts
│       │       ├── predictionPool.ts
│       │       ├── oracleGateway.ts
│       │       └── settlement.ts
│       ├── chess/
│       │   ├── engine.ts               # Stockfish wrapper
│       │   ├── validator.ts            # move validation with chess.js
│       │   └── gameManager.ts          # per-match game state
│       ├── websocket/
│       │   ├── server.ts               # ws server, room management
│       │   └── events.ts               # event type definitions
│       ├── api/
│       │   ├── router.ts               # Express routes
│       │   ├── matches.ts              # match CRUD endpoints
│       │   └── traders.ts              # trader query endpoints
│       └── db/
│           ├── client.ts               # PostgreSQL connection
│           ├── migrations/
│           │   └── 001_init.sql
│           └── queries/
│               ├── matches.ts
│               ├── moves.ts
│               ├── evaluations.ts
│               └── traders.ts
│
├── frontend/                           # Next.js 14 App Router
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── .env.local.example
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # root layout, wallet provider
│       │   ├── page.tsx                # lobby — open + live matches
│       │   ├── match/
│       │   │   └── [matchId]/
│       │   │       └── page.tsx        # live match + trading panel
│       │   ├── history/
│       │   │   └── page.tsx            # completed matches
│       │   └── create/
│       │       └── page.tsx            # create new match form
│       ├── components/
│       │   ├── board/
│       │   │   ├── ChessBoard.tsx      # react-chessboard wrapper
│       │   │   ├── EvalBar.tsx         # Stockfish evaluation bar
│       │   │   └── MoveHistory.tsx     # PGN move list
│       │   ├── trading/
│       │   │   ├── TradingPanel.tsx    # full right-side trading UI
│       │   │   ├── PoolBars.tsx        # three pool size bars
│       │   │   ├── OddsDisplay.tsx     # live implied odds
│       │   │   ├── BetForm.tsx         # place trade form
│       │   │   └── MarketStatus.tsx    # open / locked / settled badge
│       │   ├── lobby/
│       │   │   ├── MatchCard.tsx       # single match card
│       │   │   ├── OpenMatches.tsx     # joinable matches list
│       │   │   └── LiveMatches.tsx     # active matches list
│       │   ├── match/
│       │   │   ├── PlayerInfo.tsx      # player names, time, bet size
│       │   │   ├── PrizePool.tsx       # live prize pool display
│       │   │   └── SettlementModal.tsx # post-game result modal
│       │   └── shared/
│       │       ├── WalletButton.tsx    # Freighter wallet connect
│       │       ├── USDCBalance.tsx     # user USDC balance display
│       │       └── Navbar.tsx
│       ├── hooks/
│       │   ├── useWebSocket.ts         # ws connection + event handling
│       │   ├── useMatch.ts             # match state from ws + API
│       │   ├── useTrading.ts           # pool sizes, odds, place bet
│       │   └── useWallet.ts            # Freighter wallet integration
│       ├── lib/
│       │   ├── stellar.ts              # Stellar SDK setup
│       │   ├── contracts.ts            # contract interaction helpers
│       │   ├── usdc.ts                 # USDC approval + transfer helpers
│       │   └── chess.ts                # chess.js helpers
│       └── types/
│           ├── match.ts
│           ├── trading.ts
│           └── events.ts
│
├── scripts/                            # deployment + utility scripts
│   ├── deploy-all.sh                   # deploy all 5 contracts in order
│   ├── fund-testnet.sh                 # fund deployer with friendbot
│   ├── init-contracts.sh               # initialize contracts post-deploy
│   └── get-usdc-testnet.sh             # mint testnet USDC
│
└── docs/
    └── contract-addresses.json         # populated after deployment
```

---

## 5. Soroban Smart Contracts (Rust)

### 5.1 Workspace Cargo.toml

```toml
# contracts/Cargo.toml
[workspace]
members = [
    "match_registry",
    "escrow_vault",
    "prediction_pool",
    "oracle_gateway",
    "settlement",
]
resolver = "2"

[workspace.dependencies]
soroban-sdk = { version = "21.0.0", features = ["testutils"] }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

### 5.2 Shared Types (used across contracts)

Each contract defines its own types but the following enums must be identical across all contracts that reference them:

```rust
// Shared across all contracts — replicate in each crate's state.rs

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub enum MatchState {
    Open,       // created, waiting for Player B
    Active,     // both players joined, game in progress
    Locked,     // market locked (eval threshold crossed), game still live
    Completed,  // game over, settlement triggered
    Cancelled,  // Player B never joined, Player A refunded
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub enum Outcome {
    PlayerA,
    PlayerB,
    Draw,
}

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub enum Winner {
    PlayerA,
    PlayerB,
    Draw,
}
```

### 5.3 Contract 1: MatchRegistry

```rust
// contracts/match_registry/src/lib.rs

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String, Symbol
};

// --- State types ---

#[contracttype]
#[derive(Clone)]
pub struct Match {
    pub match_id: u64,
    pub player_a: Address,
    pub player_b: Option<Address>,
    pub bet_amount: i128,           // in USDC stroops (7 decimal places)
    pub time_control_secs: u32,     // total seconds per player
    pub state: MatchState,
    pub created_at: u64,            // ledger timestamp
    pub started_at: Option<u64>,
}

// Storage keys
const MATCH_COUNTER: Symbol = symbol_short!("MCOUNTER");
const USDC_TOKEN: Symbol = symbol_short!("USDC");
const ESCROW_ADDR: Symbol = symbol_short!("ESCROW");
const POOL_ADDR: Symbol = symbol_short!("POOL");

// --- Contract ---

#[contract]
pub struct MatchRegistry;

#[contractimpl]
impl MatchRegistry {

    /// Called once after deployment. Sets USDC token address and sibling contract addresses.
    pub fn initialize(
        env: Env,
        usdc_token: Address,
        escrow_vault: Address,
        prediction_pool: Address,
    ) {
        env.storage().instance().set(&USDC_TOKEN, &usdc_token);
        env.storage().instance().set(&ESCROW_ADDR, &escrow_vault);
        env.storage().instance().set(&POOL_ADDR, &prediction_pool);
        env.storage().instance().set(&MATCH_COUNTER, &0u64);
    }

    /// Player A creates a match and deposits USDC into escrow.
    /// bet_amount: USDC in stroops (e.g. 100 USDC = 1_000_000 stroops)
    /// time_control_secs: seconds per player (e.g. 600 = 10 min rapid)
    pub fn create_match(
        env: Env,
        player_a: Address,
        bet_amount: i128,
        time_control_secs: u32,
    ) -> u64 {
        player_a.require_auth();

        assert!(bet_amount >= 1_000_000, "Minimum bet is 1 USDC");
        assert!(time_control_secs >= 60, "Minimum 60 seconds per player");

        // Transfer USDC from player_a to escrow vault
        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        let escrow: Address = env.storage().instance().get(&ESCROW_ADDR).unwrap();
        usdc.transfer(&player_a, &escrow, &bet_amount);

        // Increment match counter
        let mut counter: u64 = env.storage().instance().get(&MATCH_COUNTER).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&MATCH_COUNTER, &counter);

        // Store match
        let m = Match {
            match_id: counter,
            player_a: player_a.clone(),
            player_b: None,
            bet_amount,
            time_control_secs,
            state: MatchState::Open,
            created_at: env.ledger().timestamp(),
            started_at: None,
        };
        env.storage().persistent().set(&counter, &m);

        // Notify escrow to record Player A's deposit
        // (cross-contract call — EscrowVault.record_deposit)
        let escrow_client = escrow_vault::Client::new(&env, &escrow);
        escrow_client.record_deposit(&counter, &player_a, &bet_amount);

        env.events().publish(
            (Symbol::new(&env, "MatchCreated"),),
            (counter, player_a, bet_amount, time_control_secs),
        );

        counter // returns match_id
    }

    /// Player B joins an open match and deposits the same bet amount.
    pub fn join_match(env: Env, match_id: u64, player_b: Address) {
        player_b.require_auth();

        let mut m: Match = env.storage().persistent().get(&match_id)
            .expect("Match not found");

        assert!(m.state == MatchState::Open, "Match not open");
        assert!(m.player_b.is_none(), "Match already has Player B");
        assert!(m.player_a != player_b, "Cannot play against yourself");

        // Transfer USDC from player_b to escrow
        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        let escrow: Address = env.storage().instance().get(&ESCROW_ADDR).unwrap();
        usdc.transfer(&player_b, &escrow, &m.bet_amount);

        // Update match state
        m.player_b = Some(player_b.clone());
        m.state = MatchState::Active;
        m.started_at = Some(env.ledger().timestamp());
        env.storage().persistent().set(&match_id, &m);

        // Notify escrow of Player B deposit
        let escrow_client = escrow_vault::Client::new(&env, &escrow);
        escrow_client.record_deposit(&match_id, &player_b, &m.bet_amount);

        // Open prediction market
        let pool: Address = env.storage().instance().get(&POOL_ADDR).unwrap();
        let pool_client = prediction_pool::Client::new(&env, &pool);
        pool_client.open_market(&match_id, &m.player_a, &player_b);

        env.events().publish(
            (Symbol::new(&env, "MatchActive"),),
            (match_id, m.player_a, player_b, m.bet_amount),
        );
    }

    /// Cancel an Open match (only Player A, only before Player B joins).
    pub fn cancel_match(env: Env, match_id: u64, player_a: Address) {
        player_a.require_auth();

        let mut m: Match = env.storage().persistent().get(&match_id)
            .expect("Match not found");

        assert!(m.state == MatchState::Open, "Cannot cancel active match");
        assert!(m.player_a == player_a, "Only Player A can cancel");

        m.state = MatchState::Cancelled;
        env.storage().persistent().set(&match_id, &m);

        // Refund Player A from escrow
        let escrow: Address = env.storage().instance().get(&ESCROW_ADDR).unwrap();
        let escrow_client = escrow_vault::Client::new(&env, &escrow);
        escrow_client.refund(&match_id, &player_a, &m.bet_amount);

        env.events().publish(
            (Symbol::new(&env, "MatchCancelled"),),
            (match_id, player_a),
        );
    }

    /// Read match state — called by frontend and relayer.
    pub fn get_match(env: Env, match_id: u64) -> Match {
        env.storage().persistent().get(&match_id).expect("Match not found")
    }

    /// Mark match completed — called only by Settlement contract.
    pub fn complete_match(env: Env, match_id: u64) {
        // In production: verify caller is Settlement contract
        let mut m: Match = env.storage().persistent().get(&match_id)
            .expect("Match not found");
        m.state = MatchState::Completed;
        env.storage().persistent().set(&match_id, &m);
    }
}
```

### 5.4 Contract 2: EscrowVault

```rust
// contracts/escrow_vault/src/lib.rs

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};

#[contracttype]
#[derive(Clone)]
pub struct DepositRecord {
    pub player_a: Address,
    pub player_b: Option<Address>,
    pub amount_each: i128,
    pub total_locked: i128,
    pub released: bool,
}

const USDC_TOKEN: Symbol = symbol_short!("USDC");
const AUTHORIZED: Symbol = symbol_short!("AUTH");     // Settlement contract address
const REGISTRY: Symbol = symbol_short!("REGISTRY");   // MatchRegistry address

#[contract]
pub struct EscrowVault;

#[contractimpl]
impl EscrowVault {

    pub fn initialize(env: Env, usdc_token: Address, settlement: Address, registry: Address) {
        env.storage().instance().set(&USDC_TOKEN, &usdc_token);
        env.storage().instance().set(&AUTHORIZED, &settlement);
        env.storage().instance().set(&REGISTRY, &registry);
    }

    /// Called by MatchRegistry when a player deposits. Records the deposit.
    /// Only MatchRegistry can call this.
    pub fn record_deposit(env: Env, match_id: u64, player: Address, amount: i128) {
        // Verify caller is MatchRegistry
        let registry: Address = env.storage().instance().get(&REGISTRY).unwrap();
        registry.require_auth(); // This enforces only registry can call

        let mut record: DepositRecord = env.storage().persistent()
            .get(&match_id)
            .unwrap_or(DepositRecord {
                player_a: player.clone(),
                player_b: None,
                amount_each: amount,
                total_locked: 0,
                released: false,
            });

        if record.player_b.is_none() && record.player_a != player {
            record.player_b = Some(player);
        }
        record.total_locked += amount;
        env.storage().persistent().set(&match_id, &record);

        env.events().publish(
            (Symbol::new(&env, "FundsLocked"),),
            (match_id, player, amount, record.total_locked),
        );
    }

    /// Release funds to winner. Only callable by Settlement contract.
    pub fn release(env: Env, match_id: u64, winner: Address, amount: i128) {
        let authorized: Address = env.storage().instance().get(&AUTHORIZED).unwrap();
        authorized.require_auth();

        let mut record: DepositRecord = env.storage().persistent()
            .get(&match_id)
            .expect("No deposit record");

        assert!(!record.released, "Already released");
        assert!(amount <= record.total_locked, "Amount exceeds locked funds");

        record.released = true;
        env.storage().persistent().set(&match_id, &record);

        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        usdc.transfer(&env.current_contract_address(), &winner, &amount);

        env.events().publish(
            (Symbol::new(&env, "FundsReleased"),),
            (match_id, winner, amount),
        );
    }

    /// Refund both players in case of Draw — each gets their deposit back.
    pub fn release_draw(env: Env, match_id: u64) {
        let authorized: Address = env.storage().instance().get(&AUTHORIZED).unwrap();
        authorized.require_auth();

        let mut record: DepositRecord = env.storage().persistent()
            .get(&match_id)
            .expect("No deposit record");

        assert!(!record.released, "Already released");
        record.released = true;
        env.storage().persistent().set(&match_id, &record);

        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        usdc.transfer(&env.current_contract_address(), &record.player_a, &record.amount_each);
        if let Some(pb) = record.player_b {
            usdc.transfer(&env.current_contract_address(), &pb, &record.amount_each);
        }

        env.events().publish(
            (Symbol::new(&env, "FundsReleasedDraw"),),
            (match_id,),
        );
    }

    /// Refund Player A when match is cancelled before Player B joins.
    pub fn refund(env: Env, match_id: u64, player: Address, amount: i128) {
        let registry: Address = env.storage().instance().get(&REGISTRY).unwrap();
        registry.require_auth();

        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        usdc.transfer(&env.current_contract_address(), &player, &amount);
    }

    pub fn get_record(env: Env, match_id: u64) -> DepositRecord {
        env.storage().persistent().get(&match_id).expect("No record")
    }
}
```

### 5.5 Contract 3: PredictionPool

```rust
// contracts/prediction_pool/src/lib.rs

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Map, Symbol, Vec
};

#[contracttype]
#[derive(Clone)]
pub struct Market {
    pub match_id: u64,
    pub player_a: Address,
    pub player_b: Address,
    pub pool_a: i128,           // USDC in "Player A wins" bucket
    pub pool_b: i128,           // USDC in "Player B wins" bucket
    pub pool_draw: i128,        // USDC in "Draw" bucket
    pub total_volume: i128,
    pub locked: bool,
    pub lock_eval_score: Option<i32>,  // centipawn score that triggered lock
    pub settled: bool,
}

/// Key for trader position: (match_id, trader_address, outcome)
#[contracttype]
#[derive(Clone, PartialEq, Eq)]
pub struct PositionKey {
    pub match_id: u64,
    pub trader: Address,
    pub outcome: Outcome,
}

const USDC_TOKEN: Symbol = symbol_short!("USDC");
const ORACLE_ADDR: Symbol = symbol_short!("ORACLE");
const SETTLEMENT_ADDR: Symbol = symbol_short!("SETTLE");

#[contract]
pub struct PredictionPool;

#[contractimpl]
impl PredictionPool {

    pub fn initialize(env: Env, usdc_token: Address, oracle: Address, settlement: Address) {
        env.storage().instance().set(&USDC_TOKEN, &usdc_token);
        env.storage().instance().set(&ORACLE_ADDR, &oracle);
        env.storage().instance().set(&SETTLEMENT_ADDR, &settlement);
    }

    /// Called by MatchRegistry when a match goes Active. Opens the market.
    pub fn open_market(env: Env, match_id: u64, player_a: Address, player_b: Address) {
        let market = Market {
            match_id,
            player_a,
            player_b,
            pool_a: 0,
            pool_b: 0,
            pool_draw: 0,
            total_volume: 0,
            locked: false,
            lock_eval_score: None,
            settled: false,
        };
        env.storage().persistent().set(&match_id, &market);

        env.events().publish(
            (Symbol::new(&env, "MarketOpened"),),
            (match_id,),
        );
    }

    /// Trader places a bet on an outcome. Transfers USDC into this contract.
    pub fn buy_outcome(env: Env, match_id: u64, trader: Address, outcome: Outcome, amount: i128) {
        trader.require_auth();

        let mut market: Market = env.storage().persistent().get(&match_id)
            .expect("Market not found");

        assert!(!market.locked, "Market is locked — no new bets");
        assert!(!market.settled, "Market already settled");
        assert!(amount >= 1_000_000, "Minimum bet is 1 USDC");

        // Transfer USDC from trader to this contract
        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        usdc.transfer(&trader, &env.current_contract_address(), &amount);

        // Update pool buckets
        match outcome {
            Outcome::PlayerA => market.pool_a += amount,
            Outcome::PlayerB => market.pool_b += amount,
            Outcome::Draw    => market.pool_draw += amount,
        }
        market.total_volume += amount;
        env.storage().persistent().set(&match_id, &market);

        // Record trader position
        let key = PositionKey { match_id, trader: trader.clone(), outcome: outcome.clone() };
        let existing: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(existing + amount));

        env.events().publish(
            (Symbol::new(&env, "BetPlaced"),),
            (match_id, trader, outcome, amount),
        );
    }

    /// Lock the market. Called by OracleGateway when eval threshold crossed.
    pub fn lock_market(env: Env, match_id: u64, eval_score: i32) {
        let oracle: Address = env.storage().instance().get(&ORACLE_ADDR).unwrap();
        oracle.require_auth();

        let mut market: Market = env.storage().persistent().get(&match_id)
            .expect("Market not found");

        if market.locked { return; } // idempotent — ignore if already locked

        market.locked = true;
        market.lock_eval_score = Some(eval_score);
        env.storage().persistent().set(&match_id, &market);

        env.events().publish(
            (Symbol::new(&env, "MarketLocked"),),
            (match_id, eval_score),
        );
    }

    /// Settle the market. Called by Settlement contract after game result posted.
    /// Returns (net_pool, winning_outcome) for Settlement to distribute.
    pub fn settle(env: Env, match_id: u64, winner: Winner) -> (i128, i128) {
        let settlement: Address = env.storage().instance().get(&SETTLEMENT_ADDR).unwrap();
        settlement.require_auth();

        let mut market: Market = env.storage().persistent().get(&match_id)
            .expect("Market not found");

        assert!(!market.settled, "Already settled");
        market.settled = true;
        env.storage().persistent().set(&match_id, &market);

        let total = market.total_volume;
        let protocol_cut = total * 3 / 100;
        let net_pool = total - protocol_cut;

        // Return net_pool and the winning pool size (for Settlement to distribute)
        let winning_pool = match winner {
            Winner::PlayerA => market.pool_a,
            Winner::PlayerB => market.pool_b,
            Winner::Draw    => market.pool_draw,
        };

        env.events().publish(
            (Symbol::new(&env, "MarketSettled"),),
            (match_id, winner, net_pool, winning_pool),
        );

        (net_pool, winning_pool)
    }

    /// Pay a winning trader their share. Called by Settlement for each winner.
    pub fn pay_trader(env: Env, match_id: u64, trader: Address, outcome: Outcome) -> i128 {
        let settlement: Address = env.storage().instance().get(&SETTLEMENT_ADDR).unwrap();
        settlement.require_auth();

        let market: Market = env.storage().persistent().get(&match_id)
            .expect("Market not found");

        assert!(market.settled, "Market not yet settled");

        let key = PositionKey { match_id, trader: trader.clone(), outcome: outcome.clone() };
        let trader_bet: i128 = env.storage().persistent().get(&key).unwrap_or(0);

        if trader_bet == 0 { return 0; }

        let total = market.total_volume;
        let net_pool = total - (total * 3 / 100);

        let winning_pool = match outcome {
            Outcome::PlayerA => market.pool_a,
            Outcome::PlayerB => market.pool_b,
            Outcome::Draw    => market.pool_draw,
        };

        if winning_pool == 0 { return 0; }

        let payout = (trader_bet * net_pool) / winning_pool;

        let usdc = token::Client::new(&env, &env.storage().instance().get(&USDC_TOKEN).unwrap());
        usdc.transfer(&env.current_contract_address(), &trader, &payout);

        // Clear position
        env.storage().persistent().remove(&key);

        payout
    }

    pub fn get_market(env: Env, match_id: u64) -> Market {
        env.storage().persistent().get(&match_id).expect("Market not found")
    }

    pub fn get_position(env: Env, match_id: u64, trader: Address, outcome: Outcome) -> i128 {
        let key = PositionKey { match_id, trader, outcome };
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Returns implied odds for each outcome (scaled by 100 to avoid floats).
    /// e.g. 185 means 1.85x return.
    pub fn get_odds(env: Env, match_id: u64) -> (u32, u32, u32) {
        let market: Market = env.storage().persistent().get(&match_id)
            .expect("Market not found");
        let total = market.total_volume;
        if total == 0 { return (0, 0, 0); }
        let net = total * 97 / 100;
        let odds_a  = if market.pool_a   > 0 { (net * 100 / market.pool_a)   as u32 } else { 0 };
        let odds_b  = if market.pool_b   > 0 { (net * 100 / market.pool_b)   as u32 } else { 0 };
        let odds_d  = if market.pool_draw > 0 { (net * 100 / market.pool_draw) as u32 } else { 0 };
        (odds_a, odds_b, odds_d)
    }
}
```

### 5.6 Contract 4: OracleGateway

```rust
// contracts/oracle_gateway/src/lib.rs

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

const EVAL_THRESHOLD: i32 = 250; // centipawns — absolute value

#[contracttype]
#[derive(Clone)]
pub struct EvalRecord {
    pub fen: soroban_sdk::Bytes,
    pub depth: u32,
    pub score: i32,
    pub timestamp: u64,
}

const RELAYER_KEY: Symbol = symbol_short!("RELAYER");
const POOL_ADDR: Symbol   = symbol_short!("POOL");
const SETTLE_ADDR: Symbol = symbol_short!("SETTLE");
const THRESHOLD: Symbol   = symbol_short!("THRESH");

#[contract]
pub struct OracleGateway;

#[contractimpl]
impl OracleGateway {

    pub fn initialize(
        env: Env,
        relayer: Address,
        prediction_pool: Address,
        settlement: Address,
    ) {
        env.storage().instance().set(&RELAYER_KEY, &relayer);
        env.storage().instance().set(&POOL_ADDR, &prediction_pool);
        env.storage().instance().set(&SETTLE_ADDR, &settlement);
        env.storage().instance().set(&THRESHOLD, &EVAL_THRESHOLD);
    }

    /// Posted by relayer after every move. Stores eval on-chain.
    /// If |score| >= threshold and market not locked, locks it.
    pub fn post_evaluation(
        env: Env,
        match_id: u64,
        fen: soroban_sdk::Bytes,
        depth: u32,
        score: i32,
    ) {
        let relayer: Address = env.storage().instance().get(&RELAYER_KEY).unwrap();
        relayer.require_auth();

        let threshold: i32 = env.storage().instance().get(&THRESHOLD).unwrap();

        // Store eval record
        let record = EvalRecord {
            fen: fen.clone(),
            depth,
            score,
            timestamp: env.ledger().timestamp(),
        };
        // Key: (match_id, move_number) — we use ledger sequence as proxy
        let key = (match_id, env.ledger().sequence());
        env.storage().persistent().set(&key, &record);

        // Emit for auditability
        env.events().publish(
            (Symbol::new(&env, "EvalPosted"),),
            (match_id, score, depth, env.ledger().timestamp()),
        );

        // Lock market if threshold crossed (one-way lock)
        if score.abs() >= threshold {
            let pool: Address = env.storage().instance().get(&POOL_ADDR).unwrap();
            let pool_client = prediction_pool::Client::new(&env, &pool);
            pool_client.lock_market(&match_id, &score);

            env.events().publish(
                (Symbol::new(&env, "ThresholdCrossed"),),
                (match_id, score, threshold),
            );
        }
    }

    /// Posted by relayer when game ends. Triggers Settlement.
    pub fn post_result(env: Env, match_id: u64, winner: Winner) {
        let relayer: Address = env.storage().instance().get(&RELAYER_KEY).unwrap();
        relayer.require_auth();

        env.events().publish(
            (Symbol::new(&env, "ResultPosted"),),
            (match_id, winner.clone()),
        );

        // Trigger Settlement
        let settlement: Address = env.storage().instance().get(&SETTLE_ADDR).unwrap();
        let settlement_client = settlement::Client::new(&env, &settlement);
        settlement_client.execute(&match_id, &winner);
    }

    /// Admin: update threshold (owner only, useful for tuning).
    pub fn set_threshold(env: Env, caller: Address, new_threshold: i32) {
        let relayer: Address = env.storage().instance().get(&RELAYER_KEY).unwrap();
        assert!(caller == relayer, "Unauthorized");
        caller.require_auth();
        env.storage().instance().set(&THRESHOLD, &new_threshold);
    }

    pub fn get_threshold(env: Env) -> i32 {
        env.storage().instance().get(&THRESHOLD).unwrap_or(EVAL_THRESHOLD)
    }
}
```

### 5.7 Contract 5: Settlement

```rust
// contracts/settlement/src/lib.rs

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};

const USDC_TOKEN: Symbol  = symbol_short!("USDC");
const ESCROW_ADDR: Symbol = symbol_short!("ESCROW");
const POOL_ADDR: Symbol   = symbol_short!("POOL");
const REGISTRY_ADDR: Symbol = symbol_short!("REG");
const TREASURY: Symbol    = symbol_short!("TREASURY");
const ORACLE_ADDR: Symbol = symbol_short!("ORACLE");

#[contract]
pub struct Settlement;

#[contractimpl]
impl Settlement {

    pub fn initialize(
        env: Env,
        usdc_token: Address,
        escrow_vault: Address,
        prediction_pool: Address,
        match_registry: Address,
        oracle: Address,
        treasury: Address,
    ) {
        env.storage().instance().set(&USDC_TOKEN, &usdc_token);
        env.storage().instance().set(&ESCROW_ADDR, &escrow_vault);
        env.storage().instance().set(&POOL_ADDR, &prediction_pool);
        env.storage().instance().set(&REGISTRY_ADDR, &match_registry);
        env.storage().instance().set(&ORACLE_ADDR, &oracle);
        env.storage().instance().set(&TREASURY, &treasury);
    }

    /// Main entry point — called by OracleGateway.post_result().
    /// Executes the full settlement atomically.
    pub fn execute(env: Env, match_id: u64, winner: Winner) {
        // Only OracleGateway can call this
        let oracle: Address = env.storage().instance().get(&ORACLE_ADDR).unwrap();
        oracle.require_auth();

        let escrow: Address = env.storage().instance().get(&ESCROW_ADDR).unwrap();
        let pool_addr: Address = env.storage().instance().get(&POOL_ADDR).unwrap();
        let registry: Address = env.storage().instance().get(&REGISTRY_ADDR).unwrap();
        let treasury: Address = env.storage().instance().get(&TREASURY).unwrap();
        let usdc_token: Address = env.storage().instance().get(&USDC_TOKEN).unwrap();

        // Get match info from registry
        let registry_client = match_registry::Client::new(&env, &registry);
        let m = registry_client.get_match(&match_id);

        // Get trading pool info
        let pool_client = prediction_pool::Client::new(&env, &pool_addr);
        let market = pool_client.get_market(&match_id);

        let trading_volume = market.total_volume;
        let trading_fee_total = trading_volume * 3 / 100;
        let trading_fee_treasury = trading_volume * 1 / 100;  // 1% → treasury
        let trading_fee_to_prize = trading_volume * 2 / 100;  // 2% → player prize flywheel

        // Settle the trading pool (calculates net_pool)
        let (net_pool, winning_pool) = pool_client.settle(&match_id, &winner);

        // Treasury gets 1% of trading volume
        if trading_fee_treasury > 0 {
            let usdc = token::Client::new(&env, &usdc_token);
            usdc.transfer(&env.current_contract_address(), &treasury, &trading_fee_treasury);
        }

        // Player prize pool = both deposits + flywheel bonus
        let player_pool = m.bet_amount * 2 + trading_fee_to_prize;
        let player_protocol_fee = player_pool * 3 / 100;
        let player_prize = player_pool - player_protocol_fee;

        let escrow_client = escrow_vault::Client::new(&env, &escrow);

        match winner {
            Winner::PlayerA => {
                escrow_client.release(&match_id, &m.player_a, &player_prize);
                // Treasury gets 3% of player pool
                let usdc = token::Client::new(&env, &usdc_token);
                usdc.transfer(&env.current_contract_address(), &treasury, &player_protocol_fee);
            }
            Winner::PlayerB => {
                if let Some(pb) = m.player_b {
                    escrow_client.release(&match_id, &pb, &player_prize);
                    let usdc = token::Client::new(&env, &usdc_token);
                    usdc.transfer(&env.current_contract_address(), &treasury, &player_protocol_fee);
                }
            }
            Winner::Draw => {
                // Both players get deposits back (no fee on draw player pool)
                escrow_client.release_draw(&match_id);
            }
        }

        // Mark match completed
        let registry_client = match_registry::Client::new(&env, &registry);
        registry_client.complete_match(&match_id);

        env.events().publish(
            (Symbol::new(&env, "MatchSettled"),),
            (
                match_id,
                winner,
                player_prize,
                net_pool,
                winning_pool,
                trading_fee_treasury,
                trading_fee_to_prize,
            ),
        );
    }
}
```

---

## 6. Off-Chain Relayer (Node.js)

### 6.1 package.json

```json
{
  "name": "chessbet-relayer",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@stellar/stellar-sdk": "^12.0.0",
    "chess.js": "^1.0.0",
    "stockfish": "^16.0.0",
    "express": "^4.18.0",
    "ws": "^8.16.0",
    "pg": "^8.11.0",
    "dotenv": "^16.0.0",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/express": "^4.17.0",
    "@types/ws": "^8.5.0",
    "@types/pg": "^8.10.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0"
  }
}
```

### 6.2 src/chess/engine.ts — Stockfish Integration

```typescript
// src/chess/engine.ts
import { Stockfish } from 'stockfish';

export interface EvalResult {
  score: number;      // centipawns (positive = white better)
  depth: number;
  mate: number | null; // moves to mate, null if no mate found
}

export class StockfishEngine {
  private engine: any;
  private ready: boolean = false;

  constructor() {
    this.engine = new Stockfish();
    this.engine.onmessage = () => {};
    this.engine.postMessage('uci');
    this.engine.postMessage('isready');
  }

  async evaluate(fen: string, depth: number = 18): Promise<EvalResult> {
    return new Promise((resolve) => {
      let bestScore = 0;
      let bestDepth = 0;
      let mateIn: number | null = null;

      this.engine.onmessage = (event: any) => {
        const line: string = typeof event === 'string' ? event : event.data;

        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/depth (\d+)/);
          const cpMatch = line.match(/score cp (-?\d+)/);
          const mateMatch = line.match(/score mate (-?\d+)/);

          if (depthMatch) bestDepth = parseInt(depthMatch[1]);
          if (cpMatch) bestScore = parseInt(cpMatch[1]);
          if (mateMatch) mateIn = parseInt(mateMatch[1]);
        }

        if (line.startsWith('bestmove')) {
          resolve({
            score: bestScore,
            depth: bestDepth,
            mate: mateIn,
          });
        }
      };

      this.engine.postMessage(`position fen ${fen}`);
      this.engine.postMessage(`go depth ${depth}`);
    });
  }

  quit() {
    this.engine.postMessage('quit');
  }
}
```

### 6.3 src/chess/gameManager.ts — Per-Match State

```typescript
// src/chess/gameManager.ts
import { Chess } from 'chess.js';
import { StockfishEngine } from './engine';
import { SorobanContractClient } from '../stellar/client';
import { broadcastToMatch } from '../websocket/server';
import { db } from '../db/client';

const EVAL_THRESHOLD = 250; // centipawns — absolute value

export interface GameState {
  matchId: string;
  chess: Chess;
  playerA: string;       // Stellar address
  playerB: string;
  playerAColor: 'white' | 'black';
  marketLocked: boolean;
  moveCount: number;
  lastEval: number | null;
  status: 'active' | 'locked' | 'completed';
}

const games = new Map<string, GameState>();
const engine = new StockfishEngine();

export async function initGame(
  matchId: string,
  playerA: string,
  playerB: string,
  playerAColor: 'white' | 'black' = 'white'
): Promise<void> {
  games.set(matchId, {
    matchId,
    chess: new Chess(),
    playerA,
    playerB,
    playerAColor,
    marketLocked: false,
    moveCount: 0,
    lastEval: null,
    status: 'active',
  });

  await db.query(
    'INSERT INTO games (match_id, player_a, player_b, status) VALUES ($1, $2, $3, $4)',
    [matchId, playerA, playerB, 'active']
  );
}

export async function submitMove(
  matchId: string,
  playerAddress: string,
  move: string               // UCI format: e.g. "e2e4", "e7e5"
): Promise<{ success: boolean; error?: string; gameOver?: boolean }> {
  const state = games.get(matchId);
  if (!state) return { success: false, error: 'Game not found' };

  // Verify it's this player's turn
  const isWhiteTurn = state.chess.turn() === 'w';
  const isPlayerAWhite = state.playerAColor === 'white';
  const expectedPlayer = isWhiteTurn
    ? (isPlayerAWhite ? state.playerA : state.playerB)
    : (isPlayerAWhite ? state.playerB : state.playerA);

  if (playerAddress !== expectedPlayer) {
    return { success: false, error: 'Not your turn' };
  }

  // Validate and apply move
  let result;
  try {
    result = state.chess.move(move);
  } catch {
    return { success: false, error: 'Illegal move' };
  }

  state.moveCount++;

  // Persist move to DB
  await db.query(
    'INSERT INTO moves (match_id, move_number, move_uci, fen, player) VALUES ($1, $2, $3, $4, $5)',
    [matchId, state.moveCount, move, state.chess.fen(), playerAddress]
  );

  // Broadcast move to all WebSocket clients watching this match
  broadcastToMatch(matchId, {
    type: 'MOVE',
    matchId,
    move,
    fen: state.chess.fen(),
    moveNumber: state.moveCount,
    turn: state.chess.turn(),
  });

  // Check game over
  if (state.chess.isGameOver()) {
    await handleGameOver(state);
    return { success: true, gameOver: true };
  }

  // Run Stockfish evaluation asynchronously
  runEvaluation(state);

  return { success: true };
}

async function runEvaluation(state: GameState): Promise<void> {
  const fen = state.chess.fen();
  const evalResult = await engine.evaluate(fen, 18);

  state.lastEval = evalResult.score;

  // Persist evaluation
  await db.query(
    'INSERT INTO evaluations (match_id, move_number, fen, depth, score) VALUES ($1, $2, $3, $4, $5)',
    [state.matchId, state.moveCount, fen, evalResult.depth, evalResult.score]
  );

  // Broadcast evaluation to frontend
  broadcastToMatch(state.matchId, {
    type: 'EVAL',
    matchId: state.matchId,
    score: evalResult.score,
    depth: evalResult.depth,
    mate: evalResult.mate,
    moveNumber: state.moveCount,
  });

  // Post to Oracle contract (every move, for auditability)
  await SorobanContractClient.oracle.postEvaluation(
    state.matchId,
    fen,
    evalResult.depth,
    evalResult.score
  );

  // Oracle contract handles locking automatically if threshold crossed.
  // Update local state to reflect.
  if (!state.marketLocked && Math.abs(evalResult.score) >= EVAL_THRESHOLD) {
    state.marketLocked = true;
    state.status = 'locked';

    broadcastToMatch(state.matchId, {
      type: 'MARKET_LOCKED',
      matchId: state.matchId,
      evalScore: evalResult.score,
      message: `Market locked at evaluation ${evalResult.score > 0 ? '+' : ''}${evalResult.score} cp`,
    });
  }
}

async function handleGameOver(state: GameState): Promise<void> {
  state.status = 'completed';

  let winner: 'PlayerA' | 'PlayerB' | 'Draw';

  if (state.chess.isDraw() || state.chess.isStalemate() || state.chess.isThreefoldRepetition()) {
    winner = 'Draw';
  } else {
    // Checkmate — the player whose turn it is LOST
    const loserColor = state.chess.turn(); // 'w' or 'b'
    const playerAIsWhite = state.playerAColor === 'white';

    if (loserColor === 'w') {
      // White lost — if Player A is white, Player B wins
      winner = playerAIsWhite ? 'PlayerB' : 'PlayerA';
    } else {
      winner = playerAIsWhite ? 'PlayerA' : 'PlayerB';
    }
  }

  // Post result to Oracle — this triggers full settlement
  await SorobanContractClient.oracle.postResult(state.matchId, winner);

  broadcastToMatch(state.matchId, {
    type: 'GAME_OVER',
    matchId: state.matchId,
    winner,
    reason: state.chess.isDraw() ? 'draw' : 'checkmate',
    pgn: state.chess.pgn(),
  });

  await db.query(
    'UPDATE games SET status = $1, winner = $2, pgn = $3 WHERE match_id = $4',
    ['completed', winner, state.chess.pgn(), state.matchId]
  );

  games.delete(state.matchId);
}

export function handleResignation(matchId: string, playerAddress: string): void {
  const state = games.get(matchId);
  if (!state) return;

  const winner = playerAddress === state.playerA ? 'PlayerB' : 'PlayerA';

  // Immediately post result
  SorobanContractClient.oracle.postResult(matchId, winner).then(() => {
    broadcastToMatch(matchId, {
      type: 'GAME_OVER',
      matchId,
      winner,
      reason: 'resignation',
    });
  });

  games.delete(matchId);
}

export function getGameState(matchId: string): GameState | undefined {
  return games.get(matchId);
}
```

### 6.4 src/stellar/client.ts — Soroban RPC Client

```typescript
// src/stellar/client.ts
import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { config } from '../config';

const server = new SorobanRpc.Server(config.SOROBAN_RPC_URL);
const relayerKeypair = Keypair.fromSecret(config.RELAYER_SECRET);

async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<any> {
  const account = await server.getAccount(relayerKeypair.publicKey());

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(relayerKeypair);

  const sendResult = await server.sendTransaction(preparedTx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction failed: ${sendResult.errorResult}`);
  }

  // Poll for confirmation
  let getResult = await server.getTransaction(sendResult.hash);
  while (getResult.status === 'NOT_FOUND') {
    await new Promise(r => setTimeout(r, 1000));
    getResult = await server.getTransaction(sendResult.hash);
  }

  if (getResult.status === 'FAILED') {
    throw new Error('Transaction failed on-chain');
  }

  return getResult.returnValue ? scValToNative(getResult.returnValue) : null;
}

export const SorobanContractClient = {
  oracle: {
    async postEvaluation(matchId: string, fen: string, depth: number, score: number) {
      return invokeContract(config.ORACLE_CONTRACT_ID, 'post_evaluation', [
        nativeToScVal(BigInt(matchId), { type: 'u64' }),
        nativeToScVal(Buffer.from(fen), { type: 'bytes' }),
        nativeToScVal(depth, { type: 'u32' }),
        nativeToScVal(score, { type: 'i32' }),
      ]);
    },

    async postResult(matchId: string, winner: 'PlayerA' | 'PlayerB' | 'Draw') {
      const winnerScVal = xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol(winner)
      ]);
      return invokeContract(config.ORACLE_CONTRACT_ID, 'post_result', [
        nativeToScVal(BigInt(matchId), { type: 'u64' }),
        winnerScVal,
      ]);
    },
  },

  predictionPool: {
    async getMarket(matchId: string) {
      // Read-only — use simulateTransaction
      const account = await server.getAccount(relayerKeypair.publicKey());
      const contract = new Contract(config.PREDICTION_POOL_CONTRACT_ID);
      const tx = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(contract.call('get_market',
          nativeToScVal(BigInt(matchId), { type: 'u64' })
        ))
        .setTimeout(30)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationSuccess(sim) && sim.result) {
        return scValToNative(sim.result.retval);
      }
      return null;
    },
  },
};
```

### 6.5 src/api/router.ts — REST Endpoints

```typescript
// src/api/router.ts
import { Router } from 'express';
import { db } from '../db/client';
import { submitMove, handleResignation, getGameState } from '../chess/gameManager';

const router = Router();

// GET /api/matches — all open and active matches (lobby)
router.get('/matches', async (req, res) => {
  const result = await db.query(
    `SELECT m.*, 
      (SELECT COUNT(*) FROM traders t WHERE t.match_id = m.match_id) as trader_count
     FROM games m 
     WHERE m.status IN ('active', 'open')
     ORDER BY m.created_at DESC
     LIMIT 50`
  );
  res.json(result.rows);
});

// GET /api/matches/:matchId — single match details
router.get('/matches/:matchId', async (req, res) => {
  const { matchId } = req.params;
  const result = await db.query('SELECT * FROM games WHERE match_id = $1', [matchId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  
  const moves = await db.query(
    'SELECT * FROM moves WHERE match_id = $1 ORDER BY move_number ASC',
    [matchId]
  );
  const evals = await db.query(
    'SELECT * FROM evaluations WHERE match_id = $1 ORDER BY move_number ASC',
    [matchId]
  );

  res.json({ match: result.rows[0], moves: moves.rows, evaluations: evals.rows });
});

// POST /api/matches/:matchId/move — submit a chess move
router.post('/matches/:matchId/move', async (req, res) => {
  const { matchId } = req.params;
  const { playerAddress, move } = req.body;

  if (!playerAddress || !move) {
    return res.status(400).json({ error: 'playerAddress and move required' });
  }

  const result = await submitMove(matchId, playerAddress, move);
  if (!result.success) return res.status(400).json({ error: result.error });

  res.json({ success: true, gameOver: result.gameOver });
});

// POST /api/matches/:matchId/resign — player resigns
router.post('/matches/:matchId/resign', async (req, res) => {
  const { matchId } = req.params;
  const { playerAddress } = req.body;
  handleResignation(matchId, playerAddress);
  res.json({ success: true });
});

// GET /api/matches/history — completed matches
router.get('/history', async (req, res) => {
  const result = await db.query(
    `SELECT * FROM games WHERE status = 'completed' 
     ORDER BY created_at DESC LIMIT 20`
  );
  res.json(result.rows);
});

// GET /api/matches/:matchId/traders — trader positions for a match
router.get('/matches/:matchId/traders', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM traders WHERE match_id = $1 ORDER BY created_at ASC',
    [req.params.matchId]
  );
  res.json(result.rows);
});

export default router;
```

### 6.6 src/websocket/server.ts

```typescript
// src/websocket/server.ts
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';

const wss = new WebSocketServer({ port: 3001 });

// Map of matchId → Set of connected WebSocket clients
const matchRooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url!, `ws://localhost`);
  const matchId = url.searchParams.get('matchId');

  if (!matchId) { ws.close(); return; }

  // Join room
  if (!matchRooms.has(matchId)) matchRooms.set(matchId, new Set());
  matchRooms.get(matchId)!.add(ws);

  ws.send(JSON.stringify({ type: 'CONNECTED', matchId }));

  ws.on('close', () => {
    matchRooms.get(matchId)?.delete(ws);
    if (matchRooms.get(matchId)?.size === 0) matchRooms.delete(matchId);
  });

  ws.on('error', () => ws.close());
});

export function broadcastToMatch(matchId: string, data: object): void {
  const room = matchRooms.get(matchId);
  if (!room) return;
  const msg = JSON.stringify(data);
  room.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

export { wss };
```

---

## 7. Frontend (Next.js)

### 7.1 package.json

```json
{
  "name": "chessbet-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "chess.js": "^1.0.0",
    "react-chessboard": "^4.6.0",
    "@stellar/stellar-sdk": "^12.0.0",
    "@creit.tech/stellar-wallets-kit": "^1.0.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "clsx": "^2.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/react": "^18.3.0",
    "@types/node": "^20.0.0"
  }
}
```

### 7.2 src/hooks/useWebSocket.ts

```typescript
// src/hooks/useWebSocket.ts
'use client';
import { useEffect, useRef, useCallback } from 'react';

export type WsEventType =
  | 'CONNECTED'
  | 'MOVE'
  | 'EVAL'
  | 'MARKET_LOCKED'
  | 'GAME_OVER'
  | 'BET_PLACED';

export interface WsEvent {
  type: WsEventType;
  matchId: string;
  [key: string]: any;
}

export function useWebSocket(
  matchId: string,
  onEvent: (event: WsEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}?matchId=${matchId}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WsEvent;
        onEventRef.current(data);
      } catch {}
    };

    ws.onerror = () => ws.close();

    return () => ws.close();
  }, [matchId]);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
```

### 7.3 src/hooks/useMatch.ts

```typescript
// src/hooks/useMatch.ts
'use client';
import { useState, useEffect } from 'react';
import { useWebSocket, WsEvent } from './useWebSocket';

export interface MatchState {
  fen: string;
  moveHistory: string[];
  evalScore: number | null;
  evalDepth: number;
  marketLocked: boolean;
  lockEvalScore: number | null;
  gameOver: boolean;
  winner: 'PlayerA' | 'PlayerB' | 'Draw' | null;
  poolA: number;
  poolB: number;
  poolDraw: number;
  oddsA: number;
  oddsB: number;
  oddsDraw: number;
  turn: 'w' | 'b';
}

export function useMatch(matchId: string) {
  const [state, setState] = useState<MatchState>({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moveHistory: [],
    evalScore: null,
    evalDepth: 0,
    marketLocked: false,
    lockEvalScore: null,
    gameOver: false,
    winner: null,
    poolA: 0,
    poolB: 0,
    poolDraw: 0,
    oddsA: 0,
    oddsB: 0,
    oddsDraw: 0,
    turn: 'w',
  });

  useWebSocket(matchId, (event: WsEvent) => {
    switch (event.type) {
      case 'MOVE':
        setState(prev => ({
          ...prev,
          fen: event.fen,
          moveHistory: [...prev.moveHistory, event.move],
          turn: event.turn,
        }));
        break;

      case 'EVAL':
        setState(prev => ({
          ...prev,
          evalScore: event.score,
          evalDepth: event.depth,
        }));
        break;

      case 'MARKET_LOCKED':
        setState(prev => ({
          ...prev,
          marketLocked: true,
          lockEvalScore: event.evalScore,
        }));
        break;

      case 'GAME_OVER':
        setState(prev => ({
          ...prev,
          gameOver: true,
          winner: event.winner,
        }));
        break;

      case 'BET_PLACED':
        setState(prev => ({
          ...prev,
          poolA: event.poolA,
          poolB: event.poolB,
          poolDraw: event.poolDraw,
          oddsA: event.oddsA,
          oddsB: event.oddsB,
          oddsDraw: event.oddsDraw,
        }));
        break;
    }
  });

  // Initial fetch
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/matches/${matchId}`)
      .then(r => r.json())
      .then(data => {
        if (data.match) {
          setState(prev => ({
            ...prev,
            fen: data.match.current_fen || prev.fen,
            moveHistory: data.moves?.map((m: any) => m.move_uci) || [],
          }));
        }
      });
  }, [matchId]);

  return state;
}
```

### 7.4 src/components/board/ChessBoard.tsx

```tsx
// src/components/board/ChessBoard.tsx
'use client';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useState, useCallback } from 'react';

interface ChessBoardProps {
  fen: string;
  playerAddress: string;
  playerColor: 'white' | 'black' | null; // null = spectator
  matchId: string;
  onMove: (move: string) => void;
}

export function ChessBoardComponent({
  fen, playerAddress, playerColor, matchId, onMove
}: ChessBoardProps) {
  const [chess] = useState(() => new Chess(fen));

  const onPieceDrop = useCallback((
    sourceSquare: string,
    targetSquare: string
  ): boolean => {
    if (!playerColor) return false; // spectators cannot move

    const move = chess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // always promote to queen
    });

    if (!move) return false;

    const uciMove = `${sourceSquare}${targetSquare}`;
    onMove(uciMove);
    return true;
  }, [chess, playerColor, onMove]);

  return (
    <div className="w-full max-w-[560px]">
      <Chessboard
        id={`board-${matchId}`}
        position={fen}
        onPieceDrop={onPieceDrop}
        boardOrientation={playerColor || 'white'}
        areArrowsAllowed
        animationDuration={200}
        customBoardStyle={{
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        }}
      />
    </div>
  );
}
```

### 7.5 src/components/board/EvalBar.tsx

```tsx
// src/components/board/EvalBar.tsx
'use client';

interface EvalBarProps {
  score: number | null;   // centipawns
  depth: number;
  locked: boolean;
  lockScore: number | null;
}

export function EvalBar({ score, depth, locked, lockScore }: EvalBarProps) {
  // Convert centipawn score to a 0–100 percentage for the bar
  // Clamp score to ±800 cp for display purposes
  const clampedScore = Math.max(-800, Math.min(800, score ?? 0));
  const whitePercent = 50 + (clampedScore / 800) * 50;

  const scoreDisplay = score === null
    ? '—'
    : score > 0
      ? `+${(score / 100).toFixed(2)}`
      : (score / 100).toFixed(2);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Eval</span>
        <span className={`text-sm font-mono font-medium ${
          (score ?? 0) > 0 ? 'text-gray-900' : 'text-gray-500'
        }`}>
          {scoreDisplay}
        </span>
        {depth > 0 && (
          <span className="text-xs text-gray-400">depth {depth}</span>
        )}
        {locked && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            Market locked at {lockScore && lockScore > 0 ? '+' : ''}{((lockScore ?? 0) / 100).toFixed(2)}
          </span>
        )}
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden bg-gray-800 relative">
        <div
          className="h-full bg-white transition-all duration-500 ease-out"
          style={{ width: `${whitePercent}%` }}
        />
        {/* Threshold markers at ±250 cp */}
        <div
          className="absolute top-0 h-full w-0.5 bg-amber-400 opacity-60"
          style={{ left: `${50 + (250/800)*50}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-amber-400 opacity-60"
          style={{ left: `${50 - (250/800)*50}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>Black advantage</span>
        <span>±2.5 = lock</span>
        <span>White advantage</span>
      </div>
    </div>
  );
}
```

### 7.6 src/components/trading/TradingPanel.tsx

```tsx
// src/components/trading/TradingPanel.tsx
'use client';
import { useState } from 'react';
import { PoolBars } from './PoolBars';
import { OddsDisplay } from './OddsDisplay';
import { BetForm } from './BetForm';
import { MarketStatus } from './MarketStatus';

interface TradingPanelProps {
  matchId: string;
  playerAName: string;
  playerBName: string;
  poolA: number;
  poolB: number;
  poolDraw: number;
  oddsA: number;    // multiplied by 100 from contract, divide by 100 for display
  oddsB: number;
  oddsDraw: number;
  marketLocked: boolean;
  gameOver: boolean;
  winner: string | null;
  walletAddress: string | null;
}

export function TradingPanel({
  matchId, playerAName, playerBName,
  poolA, poolB, poolDraw,
  oddsA, oddsB, oddsDraw,
  marketLocked, gameOver, winner,
  walletAddress,
}: TradingPanelProps) {
  const totalPool = poolA + poolB + poolDraw;

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      <MarketStatus locked={marketLocked} gameOver={gameOver} winner={winner} />

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900">Prediction market</h3>
          <span className="text-xs text-gray-400">
            {(totalPool / 1_000_000).toFixed(2)} USDC total
          </span>
        </div>

        <PoolBars
          poolA={poolA}
          poolB={poolB}
          poolDraw={poolDraw}
          playerAName={playerAName}
          playerBName={playerBName}
        />
      </div>

      <OddsDisplay
        oddsA={oddsA / 100}
        oddsB={oddsB / 100}
        oddsDraw={oddsDraw / 100}
        poolA={poolA}
        poolB={poolB}
        poolDraw={poolDraw}
        playerAName={playerAName}
        playerBName={playerBName}
      />

      {!marketLocked && !gameOver && walletAddress && (
        <BetForm
          matchId={matchId}
          walletAddress={walletAddress}
          playerAName={playerAName}
          playerBName={playerBName}
        />
      )}

      {marketLocked && !gameOver && (
        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Market is locked. Waiting for game to finish...
        </div>
      )}

      {gameOver && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          Game over. Settlement processing on-chain...
        </div>
      )}
    </div>
  );
}
```

### 7.7 src/components/trading/BetForm.tsx

```tsx
// src/components/trading/BetForm.tsx
'use client';
import { useState } from 'react';
import { placeTrade } from '@/lib/contracts';

type Outcome = 'PlayerA' | 'PlayerB' | 'Draw';

interface BetFormProps {
  matchId: string;
  walletAddress: string;
  playerAName: string;
  playerBName: string;
}

export function BetForm({ matchId, walletAddress, playerAName, playerBName }: BetFormProps) {
  const [outcome, setOutcome] = useState<Outcome>('PlayerA');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) < 1) {
      setError('Minimum bet is 1 USDC');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const amountStroops = BigInt(Math.floor(parseFloat(amount) * 1_000_000));
      await placeTrade(matchId, walletAddress, outcome, amountStroops);
      setSuccess(true);
      setAmount('');
    } catch (e: any) {
      setError(e.message || 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Place a trade</h3>

      <div className="flex gap-2 mb-3">
        {(['PlayerA', 'PlayerB', 'Draw'] as Outcome[]).map(o => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
              outcome === o
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {o === 'PlayerA' ? playerAName : o === 'PlayerB' ? playerBName : 'Draw'}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="number"
            min="1"
            step="1"
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-14"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            USDC
          </span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? '...' : 'Bet'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {success && <p className="text-xs text-emerald-600 mt-2">Bet placed successfully!</p>}
    </div>
  );
}
```

### 7.8 src/app/match/[matchId]/page.tsx — Match Page

```tsx
// src/app/match/[matchId]/page.tsx
'use client';
import { use } from 'react';
import { ChessBoardComponent } from '@/components/board/ChessBoard';
import { EvalBar } from '@/components/board/EvalBar';
import { MoveHistory } from '@/components/board/MoveHistory';
import { TradingPanel } from '@/components/trading/TradingPanel';
import { PlayerInfo } from '@/components/match/PlayerInfo';
import { PrizePool } from '@/components/match/PrizePool';
import { useMatch } from '@/hooks/useMatch';
import { useWallet } from '@/hooks/useWallet';

interface Props {
  params: Promise<{ matchId: string }>;
}

export default function MatchPage({ params }: Props) {
  const { matchId } = use(params);
  const matchState = useMatch(matchId);
  const { address: walletAddress } = useWallet();

  const submitMove = async (move: string) => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/matches/${matchId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerAddress: walletAddress, move }),
    });
  };

  // Determine if the connected wallet is a player or spectator
  // These would come from match metadata in a full implementation
  const playerColor = null; // derive from match data: 'white' | 'black' | null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Left: Chess Board */}
          <div className="flex flex-col gap-4">
            <PlayerInfo
              playerAName="Player A"
              playerBName="Player B"
              betAmount={0}
              prizePool={0}
            />

            <ChessBoardComponent
              fen={matchState.fen}
              playerAddress={walletAddress || ''}
              playerColor={playerColor}
              matchId={matchId}
              onMove={submitMove}
            />

            <EvalBar
              score={matchState.evalScore}
              depth={matchState.evalDepth}
              locked={matchState.marketLocked}
              lockScore={matchState.lockEvalScore}
            />

            <MoveHistory moves={matchState.moveHistory} />
          </div>

          {/* Right: Trading Panel */}
          <div className="flex flex-col gap-4">
            <PrizePool
              playerPool={0}
              tradeBonus={0}
              totalPrize={0}
            />

            <TradingPanel
              matchId={matchId}
              playerAName="Player A"
              playerBName="Player B"
              poolA={matchState.poolA}
              poolB={matchState.poolB}
              poolDraw={matchState.poolDraw}
              oddsA={matchState.oddsA}
              oddsB={matchState.oddsB}
              oddsDraw={matchState.oddsDraw}
              marketLocked={matchState.marketLocked}
              gameOver={matchState.gameOver}
              winner={matchState.winner}
              walletAddress={walletAddress}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 7.9 src/lib/contracts.ts — Frontend Contract Helpers

```typescript
// src/lib/contracts.ts
import {
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import { kit } from './stellar'; // Stellar Wallets Kit instance

const server = new SorobanRpc.Server(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL!);

export async function createMatch(
  playerAddress: string,
  betAmountUsdc: number,       // in USDC (e.g. 100)
  timeControlSecs: number
): Promise<string> {
  const betStroops = BigInt(betAmountUsdc * 1_000_000);

  // 1. Approve USDC transfer to MatchRegistry
  await approveUsdc(playerAddress, process.env.NEXT_PUBLIC_MATCH_REGISTRY_ID!, betStroops);

  // 2. Call create_match
  const account = await server.getAccount(playerAddress);
  const contract = new Contract(process.env.NEXT_PUBLIC_MATCH_REGISTRY_ID!);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(
      'create_match',
      nativeToScVal(playerAddress, { type: 'address' }),
      nativeToScVal(betStroops, { type: 'i128' }),
      nativeToScVal(timeControlSecs, { type: 'u32' }),
    ))
    .setTimeout(30)
    .build();

  const { signedTxXdr } = await kit.signTransaction(tx.toXDR(), {
    networkPassphrase: Networks.TESTNET,
  });

  const result = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
  );

  // Return match_id from result
  return result.hash;
}

export async function joinMatch(
  playerAddress: string,
  matchId: bigint,
  betAmountUsdc: number
): Promise<void> {
  const betStroops = BigInt(betAmountUsdc * 1_000_000);

  await approveUsdc(playerAddress, process.env.NEXT_PUBLIC_MATCH_REGISTRY_ID!, betStroops);

  const account = await server.getAccount(playerAddress);
  const contract = new Contract(process.env.NEXT_PUBLIC_MATCH_REGISTRY_ID!);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(
      'join_match',
      nativeToScVal(matchId, { type: 'u64' }),
      nativeToScVal(playerAddress, { type: 'address' }),
    ))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();

  const { signedTxXdr } = await kit.signTransaction(preparedTx.toXDR(), {
    networkPassphrase: Networks.TESTNET,
  });

  await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
  );
}

export async function placeTrade(
  matchId: string,
  traderAddress: string,
  outcome: 'PlayerA' | 'PlayerB' | 'Draw',
  amountStroops: bigint
): Promise<void> {
  await approveUsdc(traderAddress, process.env.NEXT_PUBLIC_PREDICTION_POOL_ID!, amountStroops);

  const account = await server.getAccount(traderAddress);
  const contract = new Contract(process.env.NEXT_PUBLIC_PREDICTION_POOL_ID!);

  const outcomeScVal = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(outcome)]);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(
      'buy_outcome',
      nativeToScVal(BigInt(matchId), { type: 'u64' }),
      nativeToScVal(traderAddress, { type: 'address' }),
      outcomeScVal,
      nativeToScVal(amountStroops, { type: 'i128' }),
    ))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();

  const { signedTxXdr } = await kit.signTransaction(preparedTx.toXDR(), {
    networkPassphrase: Networks.TESTNET,
  });

  await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
  );
}

async function approveUsdc(
  owner: string,
  spender: string,
  amount: bigint
): Promise<void> {
  const account = await server.getAccount(owner);
  const usdcContract = new Contract(process.env.NEXT_PUBLIC_USDC_CONTRACT_ID!);

  const tx = new TransactionBuilder(account, {
    fee: '500000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(usdcContract.call(
      'approve',
      nativeToScVal(owner, { type: 'address' }),
      nativeToScVal(spender, { type: 'address' }),
      nativeToScVal(amount, { type: 'i128' }),
      nativeToScVal(999999, { type: 'u32' }), // expiration ledger
    ))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();

  const { signedTxXdr } = await kit.signTransaction(preparedTx.toXDR(), {
    networkPassphrase: Networks.TESTNET,
  });

  await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET)
  );
}
```

---

## 8. End-to-End Game Flow

This section describes every step from match creation to settlement in exact sequence.

### Step 1 — Player A Creates Match

1. Player A visits `/create` on the frontend.
2. Connects Freighter wallet via WalletButton component.
3. Fills form: bet amount (USDC), time control (e.g. 10 min rapid).
4. Clicks "Create Match".
5. Frontend calls `approveUsdc()` → Player A signs USDC approval transaction in Freighter. USDC approval is set to `MatchRegistry` contract address.
6. Frontend calls `MatchRegistry.create_match(player_a, bet_amount, time_control_secs)`.
7. Player A signs and broadcasts transaction.
8. `MatchRegistry` receives call, transfers USDC from Player A to `EscrowVault` via SAC, calls `EscrowVault.record_deposit()`, emits `MatchCreated` event, returns `match_id`.
9. Frontend receives `match_id`, redirects Player A to `/match/{match_id}`.
10. Relayer's Stellar event listener picks up `MatchCreated`, creates entry in `games` table with status `open`, broadcasts nothing yet (no WebSocket room for this match yet).

### Step 2 — Player B Joins Match

1. Player B visits lobby `/` and sees the open match card.
2. Match card shows: Player A address (truncated), bet amount, time control.
3. Player B clicks "Join Match".
4. Wallet connection prompt if not connected.
5. Frontend calls `approveUsdc()` for the same bet amount → Player B signs.
6. Frontend calls `MatchRegistry.join_match(match_id, player_b)`.
7. Player B signs and broadcasts.
8. `MatchRegistry`: validates match is `Open`, validates amounts match, transfers Player B's USDC to `EscrowVault`, calls `EscrowVault.record_deposit()`, calls `PredictionPool.open_market(match_id, player_a, player_b)`, transitions match to `Active`, emits `MatchActive` event.
9. `PredictionPool` creates market with all three pools at zero, `locked: false`.
10. Relayer picks up `MatchActive` event, calls `gameManager.initGame(match_id, player_a, player_b)`, updates DB to `active`, broadcasts `MATCH_STARTED` to any connected WebSocket clients.
11. Both players are now redirected to (or already on) `/match/{match_id}`.

### Step 3 — Game Begins

1. Frontend opens WebSocket connection: `ws://relayer:3001?matchId={match_id}`.
2. Backend sends initial state.
3. Chess board renders starting position.
4. White player (whoever has white) sees it's their turn.
5. Trading panel shows all three pools at 0 USDC with market status "Open".

### Step 4 — Moves and Evaluations

For each move:

1. Player drags piece on board → `onPieceDrop` fires.
2. `chess.js` validates move locally and updates local board display.
3. Frontend `POST /api/matches/{matchId}/move` with `{ playerAddress, move }`.
4. Relayer receives request, calls `gameManager.submitMove()`.
5. `gameManager` validates it's the correct player's turn, applies move to server-side `Chess` instance.
6. Move persisted to `moves` table.
7. Relayer broadcasts `MOVE` event to all WebSocket clients in this match room.
8. All frontends (both players + spectators) update their board.
9. `gameManager` calls `runEvaluation()` asynchronously.
10. Stockfish runs at depth 18 on current FEN.
11. Stockfish returns score (e.g. `+183` centipawns).
12. Evaluation persisted to `evaluations` table.
13. Relayer calls `OracleGateway.post_evaluation(match_id, fen, 18, 183)` on-chain.
14. `OracleGateway` stores eval record, emits `EvalPosted` event, checks `|183| < 250` → no lock yet.
15. Relayer broadcasts `EVAL` event to WebSocket room.
16. Frontend `EvalBar` animates to new position.

### Step 5 — Market Lock Triggers

When a move results in, say, score `+267`:

1. Stockfish returns `267`.
2. Relayer calls `OracleGateway.post_evaluation(match_id, fen, 18, 267)`.
3. `OracleGateway`: `|267| >= 250` → calls `PredictionPool.lock_market(match_id, 267)`.
4. `PredictionPool` sets `market.locked = true`, stores `lock_eval_score = 267`, emits `MarketLocked`.
5. Future calls to `PredictionPool.buy_outcome()` will revert with "Market is locked".
6. Relayer broadcasts `MARKET_LOCKED { matchId, evalScore: 267 }` to WebSocket room.
7. All frontends: hide bet form, show "Market locked" badge on trading panel, highlight the eval bar lock markers.

### Step 6 — Game Ends

**Checkmate path:**
1. Player makes checkmating move.
2. `chess.isGameOver()` returns true, `chess.isCheckmate()` returns true.
3. `gameManager.handleGameOver()` called.
4. Determines winner from whose turn it is (the player to move is in checkmate = they lost).
5. Calls `SorobanContractClient.oracle.postResult(match_id, winner)`.
6. Broadcasts `GAME_OVER` to WebSocket.
7. `OracleGateway.post_result()` on-chain: stores result, calls `Settlement.execute(match_id, winner)`.

**Resignation path:**
1. Player clicks "Resign" button on frontend.
2. Frontend `POST /api/matches/{matchId}/resign` with `{ playerAddress }`.
3. `gameManager.handleResignation()` called.
4. Immediately calls `oracle.postResult()` with opponent as winner.

**Draw path:**
1. `chess.isDraw()` || `chess.isStalemate()` || `chess.isThreefoldRepetition()`.
2. `handleGameOver()` sets `winner = 'Draw'`.
3. `oracle.postResult(match_id, 'Draw')`.

### Step 7 — Settlement Executes

`Settlement.execute(match_id, winner)` runs atomically:

1. Fetches match data from `MatchRegistry`.
2. Fetches market data from `PredictionPool`.
3. Calls `PredictionPool.settle(match_id, winner)` — returns `(net_pool, winning_pool)`.
4. Sends `trading_fee_treasury` (1% of trading volume) to treasury address.
5. Computes `player_prize = (bet_a + bet_b) + (trading_volume × 2%) - player_protocol_fee`.
6. If winner is PlayerA → `EscrowVault.release(match_id, player_a, player_prize)`.
7. If winner is PlayerB → `EscrowVault.release(match_id, player_b, player_prize)`.
8. If Draw → `EscrowVault.release_draw(match_id)` (each player gets their deposit back).
9. For each winning trader: `PredictionPool.pay_trader(match_id, trader, outcome)` calculates and sends their proportional share.
10. Emits `MatchSettled` event with full breakdown.
11. Calls `MatchRegistry.complete_match(match_id)`.

---

## 9. End-to-End Trading Flow

### Trader Journey

1. Trader visits lobby, sees live matches with pool sizes and implied odds.
2. Clicks a live match → `/match/{match_id}`.
3. Connects wallet. Sees chess board (spectator, cannot move pieces).
4. Sees right panel: three pool bars, odds display, bet form.
5. Market status badge: "Open — place your bet now".
6. Trader selects outcome: "Player A wins", enters `50` USDC.
7. Clicks "Bet".
8. Frontend calls `approveUsdc(traderAddress, predictionPoolContract, 50_000_000)`.
9. Trader signs USDC approval in Freighter.
10. Frontend calls `PredictionPool.buy_outcome(match_id, trader, PlayerA, 50_000_000)`.
11. Trader signs and broadcasts.
12. `PredictionPool`: validates market is not locked, transfers 50 USDC from trader to contract, updates `pool_a += 50_000_000`, records position in `PositionKey` map, emits `BetPlaced`.
13. Relayer picks up `BetPlaced` event, fetches updated pool sizes and odds from contract, broadcasts `BET_PLACED { poolA, poolB, poolDraw, oddsA, oddsB, oddsDraw }` to all clients in match room.
14. All frontends update pool bars and odds display in real time.

### Odds Calculation (live, from contract)

```
Total pool = poolA + poolB + poolDraw
Net pool   = total * 0.97   (after 3% protocol fee)

Odds for Player A = net_pool / pool_a   (as a multiplier)
Odds for Player B = net_pool / pool_b
Odds for Draw     = net_pool / pool_draw

Implied probability of A = pool_a / total * 100%
```

Example: poolA=800, poolB=300, poolDraw=100, total=1200:
- Net pool = 1200 × 0.97 = 1164 USDC
- Odds A = 1164 / 800 = 1.455x
- Odds B = 1164 / 300 = 3.88x
- Odds Draw = 1164 / 100 = 11.64x
- Implied prob A = 66.7%, B = 25%, Draw = 8.3%

### Trader Payout on Win

Trader put 100 USDC on Player B. Player B wins.
- `winning_pool = pool_b = 300`
- `trader_bet = 100`
- `trader_share = 100 / 300 = 33.33%`
- `payout = 33.33% × 1164 = 388 USDC`
- `profit = 388 - 100 = 288 USDC`

This is 3.88x — exactly the odds shown before the game.

### Draw Trader Payout

- `winning_pool = pool_draw = 100`
- Trader who bet 50 USDC on Draw gets: `(50 / 100) × 1164 = 582 USDC`

---

## 10. Fee & Prize Math

### Complete Fee Breakdown (Example)

Match: Player A bets 500 USDC, Player B bets 500 USDC.
Trading: 800 on A, 300 on B, 100 on Draw = 1200 USDC total trading volume.
Result: Player A wins.

```
PLAYER PRIZE POOL
─────────────────
Player deposits:         1000.00 USDC  (500 × 2)
Trading flywheel bonus:    24.00 USDC  (1200 × 2%)
                        ─────────────
Gross player pool:       1024.00 USDC
Protocol fee (3%):        -30.72 USDC
                        ─────────────
Player A receives:        993.28 USDC

TRADING POOL
────────────
Total volume:            1200.00 USDC
Protocol fee (3%):        -36.00 USDC
  └ Treasury (1%):        -12.00 USDC
  └ Player flywheel (2%): -24.00 USDC  ← goes to player prize above
Net pool distributed:    1164.00 USDC

TRADER PAYOUTS (Player A wins)
──────────────────────────────
Pool A traders receive:  1164.00 USDC  (split proportionally)
Pool B traders:             0.00 USDC  (lose)
Pool Draw traders:          0.00 USDC  (lose)

PROTOCOL REVENUE
────────────────
From player pool:          30.72 USDC
From trading (treasury):   12.00 USDC
                        ─────────────
Total protocol:            42.72 USDC
```

### USDC Stroops Reference

Stellar USDC has 7 decimal places. All contract amounts are in stroops:
- 1 USDC = 10,000,000 stroops (1e7)
- 100 USDC = 1,000,000,000 stroops (1e9)

Always convert in the frontend before sending to contracts.

---

## 11. Stockfish Evaluation Lock Mechanism

### Lock Rules (Hard Requirements)

1. Lock is one-way. Once `market.locked = true`, it never becomes `false`.
2. Lock threshold is `|score| >= 250` centipawns (absolute value — direction doesn't matter).
3. The lock fires inside `OracleGateway.post_evaluation()` automatically.
4. The exact evaluation score that triggered the lock is stored on-chain in `market.lock_eval_score`.
5. Every evaluation is stored on-chain as an `EvalRecord` — full auditability.
6. Stockfish runs at depth 18 after every move.
7. The frontend eval bar displays vertical dashed markers at ±2.5 pawns to show traders how close the market is to locking.

### Centipawn to Pawn Display

```typescript
// Convert centipawns to display format
function cpToDisplay(cp: number): string {
  const pawns = cp / 100;
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}
// +267 cp → "+2.67"
// -183 cp → "-1.83"
```

### Stockfish Output Parsing

```
info depth 18 seldepth 28 multipv 1 score cp 267 nodes 4823947 ...
bestmove e2e4 ponder e7e5
```

Parse `score cp {N}` for centipawn score. If `score mate {N}` appears, treat as ±9999 centipawns (force lock regardless of threshold).

---

## 12. Database Schema (PostgreSQL)

```sql
-- relayer/src/db/migrations/001_init.sql

CREATE TABLE games (
  match_id        TEXT PRIMARY KEY,
  player_a        TEXT NOT NULL,
  player_b        TEXT,
  player_a_color  TEXT NOT NULL DEFAULT 'white',
  bet_amount      BIGINT NOT NULL,
  time_control    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | active | locked | completed | cancelled
  winner          TEXT,                           -- PlayerA | PlayerB | Draw | NULL
  pgn             TEXT,
  current_fen     TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE TABLE moves (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES games(match_id),
  move_number     INTEGER NOT NULL,
  move_uci        TEXT NOT NULL,
  fen             TEXT NOT NULL,
  player          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE evaluations (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES games(match_id),
  move_number     INTEGER NOT NULL,
  fen             TEXT NOT NULL,
  depth           INTEGER NOT NULL,
  score           INTEGER NOT NULL,    -- centipawns
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE traders (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES games(match_id),
  trader_address  TEXT NOT NULL,
  outcome         TEXT NOT NULL,       -- PlayerA | PlayerB | Draw
  amount_stroops  BIGINT NOT NULL,
  tx_hash         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settlements (
  match_id        TEXT PRIMARY KEY REFERENCES games(match_id),
  winner          TEXT NOT NULL,
  player_prize    BIGINT,
  trading_net     BIGINT,
  protocol_fee    BIGINT,
  flywheel_bonus  BIGINT,
  tx_hash         TEXT,
  settled_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_moves_match ON moves(match_id, move_number);
CREATE INDEX idx_evals_match ON evaluations(match_id, move_number);
CREATE INDEX idx_traders_match ON traders(match_id);
```

---

## 13. WebSocket Event Specification

All events are JSON with a required `type` field and `matchId` field.

### Server → Client Events

```typescript
// Match state
{ type: 'CONNECTED',      matchId: string }
{ type: 'MATCH_STARTED',  matchId: string, playerA: string, playerB: string }

// Game events
{ type: 'MOVE',           matchId: string, move: string, fen: string, moveNumber: number, turn: 'w'|'b' }
{ type: 'EVAL',           matchId: string, score: number, depth: number, mate: number|null, moveNumber: number }
{ type: 'MARKET_LOCKED',  matchId: string, evalScore: number, message: string }
{ type: 'GAME_OVER',      matchId: string, winner: 'PlayerA'|'PlayerB'|'Draw', reason: string, pgn: string }

// Trading events
{ type: 'BET_PLACED',     matchId: string, poolA: number, poolB: number, poolDraw: number,
                           oddsA: number, oddsB: number, oddsDraw: number,
                           traderAddress: string, outcome: string, amount: number }

// Settlement
{ type: 'SETTLEMENT_DONE', matchId: string, winner: string, playerPrize: number, netPool: number }
```

---

## 14. Environment Variables

### Relayer (.env)

```bash
# Stellar
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
RELAYER_SECRET=S...                          # Relayer keypair secret key

# Contract addresses (populated after deploy)
MATCH_REGISTRY_CONTRACT_ID=C...
ESCROW_VAULT_CONTRACT_ID=C...
PREDICTION_POOL_CONTRACT_ID=C...
ORACLE_GATEWAY_CONTRACT_ID=C...
SETTLEMENT_CONTRACT_ID=C...
USDC_CONTRACT_ID=C...                        # Testnet USDC SAC address
TREASURY_ADDRESS=G...                        # Treasury Stellar address

# Database
DATABASE_URL=postgresql://localhost:5432/chessbet

# Server
PORT=3000
WS_PORT=3001
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=ws://localhost:3001

NEXT_PUBLIC_MATCH_REGISTRY_ID=C...
NEXT_PUBLIC_ESCROW_VAULT_ID=C...
NEXT_PUBLIC_PREDICTION_POOL_ID=C...
NEXT_PUBLIC_ORACLE_GATEWAY_ID=C...
NEXT_PUBLIC_SETTLEMENT_ID=C...
NEXT_PUBLIC_USDC_CONTRACT_ID=C...
```

---

## 15. Deployment Guide (Stellar Testnet)

### Prerequisites

```bash
# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Install Rust WASM target
rustup target add wasm32-unknown-unknown

# Fund deployer account
curl "https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY"
```

### Deploy Order

Contracts must be deployed in this exact order due to dependencies:

```bash
#!/bin/bash
# scripts/deploy-all.sh

set -e

NETWORK="testnet"
SOURCE="deployer"   # stellar CLI account alias

echo "1. Deploying EscrowVault..."
ESCROW_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/escrow_vault.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "EscrowVault: $ESCROW_ID"

echo "2. Deploying PredictionPool..."
POOL_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/prediction_pool.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "PredictionPool: $POOL_ID"

echo "3. Deploying OracleGateway..."
ORACLE_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/oracle_gateway.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "OracleGateway: $ORACLE_ID"

echo "4. Deploying Settlement..."
SETTLEMENT_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/settlement.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "Settlement: $SETTLEMENT_ID"

echo "5. Deploying MatchRegistry..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/match_registry.wasm \
  --source $SOURCE \
  --network $NETWORK)
echo "MatchRegistry: $REGISTRY_ID"

echo "6. Initializing contracts..."

stellar contract invoke --id $ESCROW_ID --source $SOURCE --network $NETWORK \
  -- initialize \
  --usdc_token $USDC_CONTRACT_ID \
  --settlement $SETTLEMENT_ID \
  --registry $REGISTRY_ID

stellar contract invoke --id $POOL_ID --source $SOURCE --network $NETWORK \
  -- initialize \
  --usdc_token $USDC_CONTRACT_ID \
  --oracle $ORACLE_ID \
  --settlement $SETTLEMENT_ID

stellar contract invoke --id $ORACLE_ID --source $SOURCE --network $NETWORK \
  -- initialize \
  --relayer $RELAYER_PUBLIC_KEY \
  --prediction_pool $POOL_ID \
  --settlement $SETTLEMENT_ID

stellar contract invoke --id $SETTLEMENT_ID --source $SOURCE --network $NETWORK \
  -- initialize \
  --usdc_token $USDC_CONTRACT_ID \
  --escrow_vault $ESCROW_ID \
  --prediction_pool $POOL_ID \
  --match_registry $REGISTRY_ID \
  --oracle $ORACLE_ID \
  --treasury $TREASURY_ADDRESS

stellar contract invoke --id $REGISTRY_ID --source $SOURCE --network $NETWORK \
  -- initialize \
  --usdc_token $USDC_CONTRACT_ID \
  --escrow_vault $ESCROW_ID \
  --prediction_pool $POOL_ID

echo "All contracts deployed and initialized."
echo "Save these to docs/contract-addresses.json"
cat << EOF
{
  "match_registry": "$REGISTRY_ID",
  "escrow_vault": "$ESCROW_ID",
  "prediction_pool": "$POOL_ID",
  "oracle_gateway": "$ORACLE_ID",
  "settlement": "$SETTLEMENT_ID"
}
EOF
```

### Get Testnet USDC

```bash
# scripts/get-usdc-testnet.sh
# Testnet USDC is issued by Circle on Stellar Testnet
# Contract ID: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
# (verify this address at https://stellar.expert/explorer/testnet)

USDC_TESTNET=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# Establish trustline
stellar tx new change-trust \
  --source YOUR_ACCOUNT \
  --asset "USDC:$USDC_TESTNET" \
  --network testnet

# Get testnet USDC from faucet or mint for testing
```

---

## 16. Build Order

Follow this exact sequence to build ChessBet from scratch:

### Phase 1 — Contracts (Week 1)

1. Set up Rust workspace with all 5 contract crates
2. Build and test `EscrowVault` — simplest contract, pure vault
3. Build and test `PredictionPool` — parimutuel math
4. Build and test `OracleGateway` — eval threshold logic
5. Build and test `Settlement` — full fee distribution math
6. Build and test `MatchRegistry` — ties everything together
7. Write integration tests: full match lifecycle with simulated oracle
8. Deploy all 5 to testnet

### Phase 2 — Relayer (Week 2)

1. Set up Node.js/TypeScript project
2. PostgreSQL schema + migrations
3. Stockfish engine wrapper and eval pipeline
4. `chess.js` move validator
5. Game state manager (per-match `Chess` instance)
6. Stellar contract call wrappers
7. WebSocket server with room management
8. Express REST API endpoints
9. Stellar event listener (polls for on-chain events, updates DB)
10. End-to-end test: two simulated players play a game, oracle locks and settles

### Phase 3 — Frontend (Week 3)

1. Next.js 14 project setup, Tailwind
2. Freighter wallet integration (`@creit.tech/stellar-wallets-kit`)
3. Lobby page — open + live match cards
4. Create match page — form + contract call
5. Match page — board + eval bar + move submission
6. Trading panel — pool bars + odds + bet form
7. Settlement modal — result display
8. History page
9. WebSocket integration — live updates
10. Full flow test on testnet

### Phase 4 — Polish (Week 4)

1. Clock display (countdown timer per player)
2. Resignation button with confirmation
3. Mobile responsive layout
4. Error handling and loading states
5. Toast notifications for on-chain events
6. Explorer links for all transactions
7. README for public repo

---

*ChessBet — Built on Stellar Soroban Testnet. All USDC. All on-chain.*