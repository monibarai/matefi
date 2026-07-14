//! MateFi — Settlement contract.
//!
//! Orchestrates the full settlement cascade, triggered by
//! `OracleGateway.post_result`. This contract **never holds funds** — that
//! is a deliberate correction to the spec's §5.7 pseudocode, which had
//! Settlement transferring treasury fees from its own (empty) balance:
//!
//! 1. `PredictionPool.settle(match_id, winner)` — the pool skims its own
//!    balance: 1% of volume → treasury, 2% of volume → EscrowVault
//!    (`add_bonus` flywheel credit); returns `(net_pool, winning_pool)`.
//! 2. Player payout from EscrowVault, which now holds
//!    `2 × bet + flywheel bonus`:
//!    - Win:  `EscrowVault.release(match_id, winner_addr, player_prize)`
//!      where `player_prize = 97%` of the pool; the vault forwards the 3%
//!      remainder to treasury itself.
//!    - Draw: `EscrowVault.release_draw(match_id)` — deposits refunded, any
//!      flywheel bonus goes to treasury (documented in EscrowVault).
//! 3. `MatchRegistry.complete_match(match_id)`.
//! 4. Emits `MatchSettled` with the full breakdown.
//!
//! The economics match spec §10 exactly: 500+500 USDC deposits, 1200 USDC
//! trading volume, A wins → winner receives 993.28 USDC, treasury receives
//! 42.72 USDC total, net trader pool is 1164 USDC.
//!
//! Winning traders are NOT paid here — the chain cannot enumerate traders.
//! `PredictionPool.pay_trader` is a permissionless per-trader claim that the
//! relayer triggers after settlement (spec correction #3).
//!
//! ## Caller gating
//! `execute` is gated to the OracleGateway contract via Soroban's
//! invoker-contract auth rule (`oracle.require_auth()` passes automatically
//! when, and only when, the oracle is the direct invoker). Downstream, this
//! contract is the direct invoker of `pool.settle`, `escrow.release*` and
//! `registry.complete_match`, which gate on this contract's address the same
//! way.

#![no_std]

pub mod errors;
pub mod events;
pub mod state;

use soroban_sdk::{contract, contractclient, contractimpl, panic_with_error, Address, Env};

use errors::Error;
use state::{DataKey, Market, Match, MatchState, Winner};

// --- Minimal clients for sibling contracts (spec correction #4) ---

/// Subset of the MatchRegistry interface that Settlement calls.
#[contractclient(name = "MatchRegistryClient")]
pub trait MatchRegistryIface {
    fn get_match(env: Env, match_id: u64) -> Match;
    fn complete_match(env: Env, match_id: u64);
}

/// Subset of the PredictionPool interface that Settlement calls.
#[contractclient(name = "PredictionPoolClient")]
pub trait PredictionPoolIface {
    fn get_market(env: Env, match_id: u64) -> Market;
    fn settle(env: Env, match_id: u64, winner: Winner) -> (i128, i128);
}

/// Subset of the EscrowVault interface that Settlement calls.
#[contractclient(name = "EscrowVaultClient")]
pub trait EscrowVaultIface {
    fn release(env: Env, match_id: u64, winner: Address, amount: i128);
    fn release_draw(env: Env, match_id: u64);
}

#[contract]
pub struct Settlement;

// --- internal helpers ---

fn get_addr(env: &Env, key: DataKey) -> Address {
    env.storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

#[contractimpl]
impl Settlement {
    /// Called once after deployment. Signature matches spec §5.7.
    ///
    /// Note: `usdc_token` and `treasury` are stored for interface
    /// compatibility and observability, but this contract never moves USDC —
    /// fee transfers are executed by EscrowVault and PredictionPool (solvency
    /// correction).
    pub fn initialize(
        env: Env,
        usdc_token: Address,
        escrow_vault: Address,
        prediction_pool: Address,
        match_registry: Address,
        oracle: Address,
        treasury: Address,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::Escrow, &escrow_vault);
        env.storage().instance().set(&DataKey::Pool, &prediction_pool);
        env.storage().instance().set(&DataKey::Registry, &match_registry);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
    }

    /// Main entry point — called by `OracleGateway.post_result()` (invoker
    /// auth). Executes the full settlement atomically.
    pub fn execute(env: Env, match_id: u64, winner: Winner) {
        get_addr(&env, DataKey::Oracle).require_auth();

        let escrow = get_addr(&env, DataKey::Escrow);
        let pool_addr = get_addr(&env, DataKey::Pool);
        let registry = get_addr(&env, DataKey::Registry);

        // Match must be Active (not Open / already Completed / Cancelled).
        let registry_client = MatchRegistryClient::new(&env, &registry);
        let m = registry_client.get_match(&match_id);
        if m.state != MatchState::Active {
            panic_with_error!(&env, Error::MatchNotActive);
        }

        // Trading fee breakdown (same floor math as PredictionPool.settle).
        let pool_client = PredictionPoolClient::new(&env, &pool_addr);
        let market = pool_client.get_market(&match_id);
        let trading_volume = market.total_volume;
        let trading_fee_treasury = trading_volume / 100; // 1% → treasury
        let trading_fee_to_prize = trading_volume * 2 / 100; // 2% → flywheel

        // Settle the trading pool. The pool transfers the 1% to treasury and
        // pushes the 2% flywheel bonus into the EscrowVault itself.
        let (net_pool, winning_pool) = pool_client.settle(&match_id, &winner);

        // Player prize pool = both deposits + flywheel bonus (now all held
        // by the EscrowVault).
        let player_pool = m.bet_amount * 2 + trading_fee_to_prize;
        let player_protocol_fee = player_pool * 3 / 100;
        let player_prize = player_pool - player_protocol_fee;

        let escrow_client = EscrowVaultClient::new(&env, &escrow);

        // For the event: amount actually paid out to the player side.
        let player_payout: i128;

        match winner {
            Winner::PlayerA => {
                // Vault pays 97% to the winner and the 3% rake to treasury.
                escrow_client.release(&match_id, &m.player_a, &player_prize);
                player_payout = player_prize;
            }
            Winner::PlayerB => {
                let player_b = match m.player_b.clone() {
                    Some(pb) => pb,
                    None => panic_with_error!(&env, Error::PlayerBMissing),
                };
                escrow_client.release(&match_id, &player_b, &player_prize);
                player_payout = player_prize;
            }
            Winner::Draw => {
                // Deposits refunded (no rake on the player pool for draws);
                // the vault forwards the flywheel bonus to treasury so no
                // funds are stranded.
                escrow_client.release_draw(&match_id);
                player_payout = m.bet_amount * 2;
            }
        }

        // Mark match completed.
        registry_client.complete_match(&match_id);

        events::match_settled(
            &env,
            match_id,
            &winner,
            player_payout,
            net_pool,
            winning_pool,
            trading_fee_treasury,
            trading_fee_to_prize,
        );
    }
}

#[cfg(test)]
mod test;
