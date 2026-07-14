//! MateFi — EscrowVault contract.
//!
//! Holds all *player* USDC (completely separate from trader USDC, which lives
//! in the PredictionPool). There is no public withdrawal function; funds only
//! move when the authorized sibling contracts call in:
//!
//! - `record_deposit` / `refund`  — MatchRegistry only
//! - `add_bonus`                  — PredictionPool only (2% flywheel credit)
//! - `release` / `release_draw`   — Settlement only
//!
//! ## Caller gating (cross-contract auth)
//! We store the authorized sibling contract addresses at `initialize` and call
//! `addr.require_auth()` on them. Soroban's invoker-contract auth rule makes
//! this pass automatically when (and only when) that contract is the *direct*
//! invoker of the function — no signatures or auth entries needed, and any
//! other caller (account or contract) fails the auth check.
//!
//! ## Money flow on settlement (spec §10, corrected for solvency)
//! The vault holds `2 × bet_amount + flywheel_bonus` per match. On a win,
//! Settlement passes `amount = player_prize = 97% of that pool`; the vault
//! sends `amount` to the winner and the remainder (the 3% rake) to treasury,
//! so the vault zeroes out exactly. On a draw, each player gets their deposit
//! back and the flywheel bonus is sent to treasury (documented edge case: the
//! bonus would otherwise be stranded, since the spec charges no player-pool
//! fee on draws).

#![no_std]

pub mod errors;
pub mod events;
pub mod state;

use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env};

use errors::Error;
use state::{DataKey, DepositRecord};

#[contract]
pub struct EscrowVault;

// --- internal helpers ---

fn get_addr(env: &Env, key: DataKey) -> Address {
    env.storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

fn get_record(env: &Env, match_id: u64) -> DepositRecord {
    env.storage()
        .persistent()
        .get(&DataKey::Record(match_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::RecordNotFound))
}

fn put_record(env: &Env, match_id: u64, record: &DepositRecord) {
    env.storage()
        .persistent()
        .set(&DataKey::Record(match_id), record);
}

fn usdc(env: &Env) -> token::Client<'_> {
    token::Client::new(env, &get_addr(env, DataKey::UsdcToken))
}

#[contractimpl]
impl EscrowVault {
    /// Called once after deployment.
    ///
    /// Interface note (deviation from spec §5.4): two parameters were added —
    /// `prediction_pool` (authorizes `add_bonus`) and `treasury` (receives the
    /// 3% player-pool rake directly from the vault, since the Settlement
    /// contract never holds funds).
    pub fn initialize(
        env: Env,
        usdc_token: Address,
        settlement: Address,
        registry: Address,
        prediction_pool: Address,
        treasury: Address,
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
            .set(&DataKey::Settlement, &settlement);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage()
            .instance()
            .set(&DataKey::Pool, &prediction_pool);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
    }

    /// Record a player deposit. Only MatchRegistry may call (invoker auth).
    /// The USDC itself is transferred to this contract by MatchRegistry
    /// before this call.
    pub fn record_deposit(env: Env, match_id: u64, player: Address, amount: i128) {
        get_addr(&env, DataKey::Registry).require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut record: DepositRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Record(match_id))
            .unwrap_or(DepositRecord {
                player_a: player.clone(),
                player_b: None,
                amount_each: amount,
                bonus: 0,
                total_locked: 0,
                released: false,
            });

        if record.player_a != player {
            // Second (Player B) deposit — must match Player A's amount and slot must be free.
            if record.player_b.is_some() || record.amount_each != amount {
                panic_with_error!(&env, Error::DepositMismatch);
            }
            record.player_b = Some(player.clone());
        } else if record.total_locked > 0 {
            // Player A depositing twice for the same match.
            panic_with_error!(&env, Error::DepositMismatch);
        }

        record.total_locked += amount;
        put_record(&env, match_id, &record);

        events::funds_locked(&env, match_id, &player, amount, record.total_locked);
    }

    /// Credit the trading-fee flywheel bonus (2% of trading volume) to the
    /// match's player prize pool. Only PredictionPool may call (invoker auth).
    /// The USDC itself is transferred to this contract by PredictionPool
    /// before this call.
    pub fn add_bonus(env: Env, match_id: u64, amount: i128) {
        get_addr(&env, DataKey::Pool).require_auth();

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut record = get_record(&env, match_id);
        if record.released {
            panic_with_error!(&env, Error::AlreadyReleased);
        }
        record.bonus += amount;
        record.total_locked += amount;
        put_record(&env, match_id, &record);

        events::bonus_added(&env, match_id, amount, record.total_locked);
    }

    /// Release `amount` (the player prize = 97% of the player pool) to the
    /// winner; the remainder of `total_locked` (the 3% rake) goes to treasury.
    /// Only Settlement may call (invoker auth).
    pub fn release(env: Env, match_id: u64, winner: Address, amount: i128) {
        get_addr(&env, DataKey::Settlement).require_auth();

        let mut record = get_record(&env, match_id);
        if record.released {
            panic_with_error!(&env, Error::AlreadyReleased);
        }
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if amount > record.total_locked {
            panic_with_error!(&env, Error::AmountExceedsLocked);
        }

        record.released = true;
        put_record(&env, match_id, &record);

        let protocol_fee = record.total_locked - amount;
        let usdc = usdc(&env);
        let this = env.current_contract_address();
        usdc.transfer(&this, &winner, &amount);
        if protocol_fee > 0 {
            usdc.transfer(&this, &get_addr(&env, DataKey::Treasury), &protocol_fee);
        }

        events::funds_released(&env, match_id, &winner, amount, protocol_fee);
    }

    /// Draw: refund each player their deposit; send the flywheel bonus (if
    /// any) to treasury so no funds are stranded (no player-pool fee on draw).
    /// Only Settlement may call (invoker auth).
    pub fn release_draw(env: Env, match_id: u64) {
        get_addr(&env, DataKey::Settlement).require_auth();

        let mut record = get_record(&env, match_id);
        if record.released {
            panic_with_error!(&env, Error::AlreadyReleased);
        }
        record.released = true;
        put_record(&env, match_id, &record);

        let usdc = usdc(&env);
        let this = env.current_contract_address();
        usdc.transfer(&this, &record.player_a, &record.amount_each);
        if let Some(pb) = record.player_b.clone() {
            usdc.transfer(&this, &pb, &record.amount_each);
        }
        if record.bonus > 0 {
            usdc.transfer(&this, &get_addr(&env, DataKey::Treasury), &record.bonus);
        }

        events::funds_released_draw(&env, match_id, record.amount_each, record.bonus);
    }

    /// Refund Player A when an Open match is cancelled before Player B joins.
    /// Only MatchRegistry may call (invoker auth).
    pub fn refund(env: Env, match_id: u64, player: Address, amount: i128) {
        get_addr(&env, DataKey::Registry).require_auth();

        let mut record = get_record(&env, match_id);
        if record.released {
            panic_with_error!(&env, Error::AlreadyReleased);
        }
        if amount > record.total_locked {
            panic_with_error!(&env, Error::AmountExceedsLocked);
        }
        record.released = true;
        record.total_locked -= amount;
        put_record(&env, match_id, &record);

        usdc(&env).transfer(&env.current_contract_address(), &player, &amount);

        events::refunded(&env, match_id, &player, amount);
    }

    pub fn get_record(env: Env, match_id: u64) -> DepositRecord {
        get_record(&env, match_id)
    }
}

#[cfg(test)]
mod test;
