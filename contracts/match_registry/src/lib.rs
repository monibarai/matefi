//! MateFi — MatchRegistry contract.
//!
//! Entry point for all match creation and joining. Transitions the match
//! state machine `Open → Active → Completed` (or `Open → Cancelled`), moves
//! player USDC into the EscrowVault, and opens the prediction market when a
//! match goes Active.
//!
//! ## Caller gating (cross-contract auth)
//! `complete_match` stores the Settlement contract address at `initialize`
//! and calls `settlement.require_auth()`. Soroban's invoker-contract auth
//! rule makes this pass automatically when (and only when) Settlement is the
//! *direct* invoker — any other caller fails the auth check.
//!
//! ## Cross-contract calls
//! Sibling contracts are invoked through minimal `#[contractclient]` trait
//! clients declared below (no `contractimport` of wasm files — avoids
//! circular build dependencies).
//!
//! ## Interface deviations from spec §5.3 (documented)
//! - `initialize` gains a 4th parameter `settlement: Address` so that
//!   `complete_match` can be gated to the Settlement contract (spec note in
//!   §5.3 said "in production: verify caller is Settlement" — this is that).
//! - Minimum-bet check uses 10_000_000 stroops (= 1 USDC at Stellar's 7
//!   decimals, per spec §10), not the 1_000_000 in the §5.3 snippet.
//! - All `assert!`/`expect` panics replaced with typed `contracterror` codes.

#![no_std]

pub mod errors;
pub mod events;
pub mod state;

use soroban_sdk::{contract, contractclient, contractimpl, panic_with_error, token, Address, Env};

use errors::Error;
use state::{DataKey, Match, MatchState};

// --- Minimal clients for sibling contracts (spec correction #4) ---

/// Subset of the EscrowVault interface that the registry calls.
#[contractclient(name = "EscrowVaultClient")]
pub trait EscrowVaultIface {
    fn record_deposit(env: Env, match_id: u64, player: Address, amount: i128);
    fn refund(env: Env, match_id: u64, player: Address, amount: i128);
}

/// Subset of the PredictionPool interface that the registry calls.
#[contractclient(name = "PredictionPoolClient")]
pub trait PredictionPoolIface {
    fn open_market(env: Env, match_id: u64, player_a: Address, player_b: Address);
}

/// 1 USDC in stroops (Stellar assets have 7 decimal places — spec §10).
pub const MIN_BET_STROOPS: i128 = 10_000_000;
/// Minimum time control per player, in seconds.
pub const MIN_TIME_CONTROL_SECS: u32 = 60;

#[contract]
pub struct MatchRegistry;

// --- internal helpers ---

fn get_addr(env: &Env, key: DataKey) -> Address {
    env.storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

fn get_match(env: &Env, match_id: u64) -> Match {
    env.storage()
        .persistent()
        .get(&DataKey::Match(match_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::MatchNotFound))
}

fn put_match(env: &Env, match_id: u64, m: &Match) {
    env.storage().persistent().set(&DataKey::Match(match_id), m);
}

#[contractimpl]
impl MatchRegistry {
    /// Called once after deployment. Sets USDC token address and sibling
    /// contract addresses.
    ///
    /// Interface note (deviation from spec §5.3): `settlement` was added so
    /// `complete_match` can be gated to the Settlement contract.
    pub fn initialize(
        env: Env,
        usdc_token: Address,
        escrow_vault: Address,
        prediction_pool: Address,
        settlement: Address,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);
        env.storage()
            .instance()
            .set(&DataKey::Escrow, &escrow_vault);
        env.storage()
            .instance()
            .set(&DataKey::Pool, &prediction_pool);
        env.storage()
            .instance()
            .set(&DataKey::Settlement, &settlement);
        env.storage().instance().set(&DataKey::MatchCounter, &0u64);
    }

    /// Player A creates a match and deposits USDC into escrow.
    ///
    /// * `bet_amount` — USDC in stroops (e.g. 100 USDC = 1_000_000_000).
    /// * `time_control_secs` — seconds per player (e.g. 600 = 10 min rapid).
    ///
    /// Returns the new `match_id`.
    pub fn create_match(
        env: Env,
        player_a: Address,
        bet_amount: i128,
        time_control_secs: u32,
    ) -> u64 {
        player_a.require_auth();

        if bet_amount < MIN_BET_STROOPS {
            panic_with_error!(&env, Error::BetTooSmall);
        }
        if time_control_secs < MIN_TIME_CONTROL_SECS {
            panic_with_error!(&env, Error::TimeControlTooShort);
        }

        // Transfer USDC from Player A to the escrow vault.
        let escrow = get_addr(&env, DataKey::Escrow);
        let usdc = token::Client::new(&env, &get_addr(&env, DataKey::UsdcToken));
        usdc.transfer(&player_a, &escrow, &bet_amount);

        // Increment match counter.
        let counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::MatchCounter)
            .unwrap_or(0)
            + 1;
        env.storage()
            .instance()
            .set(&DataKey::MatchCounter, &counter);

        // Store match.
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
        put_match(&env, counter, &m);

        // Notify escrow to record Player A's deposit.
        EscrowVaultClient::new(&env, &escrow).record_deposit(&counter, &player_a, &bet_amount);

        events::match_created(&env, counter, &player_a, bet_amount, time_control_secs);

        counter
    }

    /// Player B joins an open match and deposits the same bet amount.
    /// Transitions the match to `Active` and opens the prediction market.
    pub fn join_match(env: Env, match_id: u64, player_b: Address) {
        player_b.require_auth();

        let mut m = get_match(&env, match_id);

        if m.state != MatchState::Open || m.player_b.is_some() {
            panic_with_error!(&env, Error::MatchNotOpen);
        }
        if m.player_a == player_b {
            panic_with_error!(&env, Error::SelfPlay);
        }

        // Transfer USDC from Player B to escrow.
        let escrow = get_addr(&env, DataKey::Escrow);
        let usdc = token::Client::new(&env, &get_addr(&env, DataKey::UsdcToken));
        usdc.transfer(&player_b, &escrow, &m.bet_amount);

        // Update match state.
        m.player_b = Some(player_b.clone());
        m.state = MatchState::Active;
        m.started_at = Some(env.ledger().timestamp());
        put_match(&env, match_id, &m);

        // Notify escrow of Player B's deposit.
        EscrowVaultClient::new(&env, &escrow).record_deposit(&match_id, &player_b, &m.bet_amount);

        // Open the prediction market.
        let pool = get_addr(&env, DataKey::Pool);
        PredictionPoolClient::new(&env, &pool).open_market(&match_id, &m.player_a, &player_b);

        events::match_active(&env, match_id, &m.player_a, &player_b, m.bet_amount);
    }

    /// Cancel an Open match (only Player A, only before Player B joins).
    /// Player A is refunded from escrow.
    pub fn cancel_match(env: Env, match_id: u64, player_a: Address) {
        player_a.require_auth();

        let mut m = get_match(&env, match_id);

        if m.state != MatchState::Open {
            panic_with_error!(&env, Error::MatchNotOpen);
        }
        if m.player_a != player_a {
            panic_with_error!(&env, Error::NotPlayerA);
        }

        m.state = MatchState::Cancelled;
        put_match(&env, match_id, &m);

        // Refund Player A from escrow.
        let escrow = get_addr(&env, DataKey::Escrow);
        EscrowVaultClient::new(&env, &escrow).refund(&match_id, &player_a, &m.bet_amount);

        events::match_cancelled(&env, match_id, &player_a);
    }

    /// Read match state — called by frontend and relayer.
    pub fn get_match(env: Env, match_id: u64) -> Match {
        get_match(&env, match_id)
    }

    /// Mark match completed. Only the Settlement contract may call
    /// (invoker-contract auth on the stored settlement address).
    pub fn complete_match(env: Env, match_id: u64) {
        get_addr(&env, DataKey::Settlement).require_auth();

        let mut m = get_match(&env, match_id);
        if m.state != MatchState::Active {
            panic_with_error!(&env, Error::MatchNotActive);
        }
        m.state = MatchState::Completed;
        put_match(&env, match_id, &m);

        events::match_completed(&env, match_id);
    }
}

#[cfg(test)]
mod test;
