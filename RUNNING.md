# MateFi — Local Development Quickstart

MateFi is the on-chain chess betting + live prediction market specified in
[readme.md](./readme.md). This file covers running it locally.

## Stack layout

| Directory    | What                                            | Runs on              |
|--------------|--------------------------------------------------|----------------------|
| `contracts/` | 5 Soroban contracts (Rust → WASM)               | Stellar Testnet      |
| `relayer/`   | Node.js relayer: REST + WebSocket + Stockfish   | :3000 (API) / :3001 (WS) |
| `frontend/`  | Next.js 14 App Router UI                        | :3002 (or next dev default) |
| `scripts/`   | Testnet deploy + init scripts                   | —                    |

## 1. Database (local PostgreSQL via Docker)

```bash
docker compose up -d postgres
# connection string: postgresql://matefi:matefi@localhost:5432/matefi
```

## 2. Relayer

```bash
cd relayer
npm install
npm run migrate     # applies src/db/migrations against local postgres
npm run dev         # API on :3000, WebSocket on :3001
```

Set `DEV_MODE=true` in `relayer/.env` to run the full game flow off-chain
before contracts are deployed.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

## 4. Contracts (build, test, deploy to Stellar Testnet)

```bash
cd contracts
cargo test
cargo build --target wasm32-unknown-unknown --release

# deploy + initialize all 5 contracts in dependency order:
../scripts/fund-testnet.sh        # fund deployer via friendbot
../scripts/deploy-all.sh          # deploys + initializes, prints contract IDs
```

Copy the printed contract IDs into `relayer/.env` and `frontend/.env.local`
(see readme.md §14 for the full variable list) and into
`docs/contract-addresses.json`.

## Conventions

- **USDC**: 1 USDC = 10,000,000 stroops (7 decimals — Stellar standard).
- **Market lock**: Stockfish depth 18, one-way lock at |eval| ≥ 250 cp.
- **Fees**: 3% of player pool (→ treasury); 3% of trading volume
  (1% treasury, 2% flywheel into the player prize pool).
