//! MateFi — PredictionPool contract.
//!
//! Manages the three-bucket parimutuel market per match. Holds all *trader*
//! USDC (completely separate from player USDC, which lives in EscrowVault).
//!
//! ## Caller gating (cross-contract auth)
//! Authorized sibling contract addresses are stored at `initialize` and
//! checked with `addr.require_auth()`. Soroban's invoker-contract auth rule
//! makes this pass automatically when (and only when) that contract is the
//! *direct* invoker:
//! - `open_market` — MatchRegistry only
//! - `lock_market` — OracleGateway only
//! - `settle`      — Settlement only
//! - `pay_trader`  — permissionless claim (anyone may trigger; funds always
//!                   go to the recorded trader)
//!
//! ## Money flow at settlement (spec §10, corrected for solvency)
//! The Settlement contract never holds funds, so this contract pays the
//! trading fees out of its own balance inside `settle`:
//! - 1% of `total_volume` → treasury
//! - 2% of `total_volume` → EscrowVault (+ `EscrowVault.add_bonus` credit),
//!   the player-prize flywheel
//! - remaining `net_pool = total - 3%` stays here for trader claims.
//!
//! Floor-division note: each fee is floored independently;
//! `floor(3v/100) >= floor(v/100) + floor(2v/100)` always holds, so the pool
//! can never pay out more than it holds (at most a few stroops of rounding
//! dust remain in the contract).
//!
//! Edge case: if nobody bet on the winning outcome (`winning_pool == 0`),
//! the net pool would be stranded — it is swept to treasury at settle time.

#![no_std]

pub mod errors;
pub mod events;
pub mod state;

use soroban_sdk::{contract, contractclient, contractimpl, panic_with_error, token, Address, Env};

use errors::Error;
use state::{DataKey, Market, MarketResult, Outcome, PositionKey, Winner};

// --- Minimal client for the EscrowVault (spec correction #4) ---

/// Subset of the EscrowVault interface that the pool calls.
#[contractclient(name = "EscrowVaultClient")]
pub trait EscrowVaultIface {
    fn add_bonus(env: Env, match_id: u64, amount: i128);
}

/// 1 USDC in stroops (Stellar assets have 7 decimal places — spec §10).
pub const MIN_BET_STROOPS: i128 = 10_000_000;

#[contract]
pub struct PredictionPool;

// --- internal helpers ---

fn get_addr(env: &Env, key: DataKey) -> Address {
    env.storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

fn get_market(env: &Env, match_id: u64) -> Market {
    env.storage()
        .persistent()
        .get(&DataKey::Market(match_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::MarketNotFound))
}

fn put_market(env: &Env, match_id: u64, market: &Market) {
    env.storage()
        .persistent()
        .set(&DataKey::Market(match_id), market);
}

fn usdc(env: &Env) -> token::Client<'_> {
    token::Client::new(env, &get_addr(env, DataKey::UsdcToken))
}

fn winner_to_outcome(winner: &Winner) -> Outcome {
    match winner {
        Winner::PlayerA => Outcome::PlayerA,
        Winner::PlayerB => Outcome::PlayerB,
        Winner::Draw => Outcome::Draw,
    }
}

fn bucket(market: &Market, outcome: &Outcome) -> i128 {
    match outcome {
        Outcome::PlayerA => market.pool_a,
        Outcome::PlayerB => market.pool_b,
        Outcome::Draw => market.pool_draw,
    }
}

#[contractimpl]
impl PredictionPool {
    /// Called once after deployment.
    ///
    /// Interface note (deviation from spec §5.5): three parameters were
    /// added — `registry` (gates `open_market`), `escrow_vault` and
    /// `treasury` (receive the 2% flywheel / 1% treasury cut directly from
    /// this contract at `settle`, since Settlement never holds funds).
    pub fn initialize(
        env: Env,
        usdc_token: Address,
        oracle: Address,
        settlement: Address,
        registry: Address,
        escrow_vault: Address,
        treasury: Address,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::Settlement, &settlement);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::Escrow, &escrow_vault);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
    }

    /// Open the market for a match. Only MatchRegistry may call (invoker
    /// auth) — an open, ungated version would let anyone reset live pools.
    pub fn open_market(env: Env, match_id: u64, player_a: Address, player_b: Address) {
        get_addr(&env, DataKey::Registry).require_auth();

        if env.storage().persistent().has(&DataKey::Market(match_id)) {
            panic_with_error!(&env, Error::MarketExists);
        }

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
            result: MarketResult::Pending,
        };
        put_market(&env, match_id, &market);

        events::market_opened(&env, match_id);
    }

    /// Trader places a bet on an outcome. Transfers USDC into this contract.
    pub fn buy_outcome(env: Env, match_id: u64, trader: Address, outcome: Outcome, amount: i128) {
        trader.require_auth();

        let mut market = get_market(&env, match_id);

        if market.settled {
            panic_with_error!(&env, Error::AlreadySettled);
        }
        if market.locked {
            panic_with_error!(&env, Error::MarketIsLocked);
        }
        if amount < MIN_BET_STROOPS {
            panic_with_error!(&env, Error::BetTooSmall);
        }

        // Transfer USDC from trader to this contract.
        usdc(&env).transfer(&trader, &env.current_contract_address(), &amount);

        // Update pool buckets.
        match outcome {
            Outcome::PlayerA => market.pool_a += amount,
            Outcome::PlayerB => market.pool_b += amount,
            Outcome::Draw => market.pool_draw += amount,
        }
        market.total_volume += amount;
        put_market(&env, match_id, &market);

        // Record trader position.
        let key = DataKey::Position(PositionKey {
            match_id,
            trader: trader.clone(),
            outcome: outcome.clone(),
        });
        let existing: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(existing + amount));

        events::bet_placed(&env, match_id, &trader, &outcome, amount);
    }

    /// Lock the market (one-way, idempotent). Only OracleGateway may call
    /// (invoker auth).
    pub fn lock_market(env: Env, match_id: u64, eval_score: i32) {
        get_addr(&env, DataKey::Oracle).require_auth();

        let mut market = get_market(&env, match_id);

        if market.locked {
            return; // idempotent — a lock is never undone or overwritten
        }

        market.locked = true;
        market.lock_eval_score = Some(eval_score);
        put_market(&env, match_id, &market);

        events::market_locked(&env, match_id, eval_score);
    }

    /// Settle the market. Only Settlement may call (invoker auth).
    ///
    /// Skims the 3% trading fee out of this contract's balance:
    /// 1% of volume → treasury, 2% of volume → EscrowVault (flywheel bonus,
    /// credited via `EscrowVault.add_bonus`). Records the winning outcome so
    /// `pay_trader` claims can be validated.
    ///
    /// Returns `(net_pool, winning_pool)` for Settlement's bookkeeping/event.
    pub fn settle(env: Env, match_id: u64, winner: Winner) -> (i128, i128) {
        get_addr(&env, DataKey::Settlement).require_auth();

        let mut market = get_market(&env, match_id);

        if market.settled {
            panic_with_error!(&env, Error::AlreadySettled);
        }

        let total = market.total_volume;
        let fee_treasury = total / 100; // 1% → treasury
        let fee_flywheel = total * 2 / 100; // 2% → player prize flywheel
        let net_pool = total - total * 3 / 100;

        let winning_outcome = winner_to_outcome(&winner);
        let winning_pool = bucket(&market, &winning_outcome);

        market.settled = true;
        market.result = MarketResult::from(&winner);
        put_market(&env, match_id, &market);

        let this = env.current_contract_address();
        let usdc = usdc(&env);

        if fee_treasury > 0 {
            usdc.transfer(&this, &get_addr(&env, DataKey::Treasury), &fee_treasury);
        }
        if fee_flywheel > 0 {
            let escrow = get_addr(&env, DataKey::Escrow);
            usdc.transfer(&this, &escrow, &fee_flywheel);
            EscrowVaultClient::new(&env, &escrow).add_bonus(&match_id, &fee_flywheel);
        }
        // Nobody bet on the winning outcome: sweep the net pool to treasury
        // instead of stranding it in the contract forever.
        if winning_pool == 0 && net_pool > 0 {
            usdc.transfer(&this, &get_addr(&env, DataKey::Treasury), &net_pool);
        }

        events::market_settled(&env, match_id, &winner, net_pool, winning_pool);

        (net_pool, winning_pool)
    }

    /// Pay a winning trader their proportional share of the net pool.
    ///
    /// Deviation from spec §5.6 (spec correction #3): this is a
    /// *permissionless claim* — callable by anyone after settlement (the
    /// relayer triggers it per winning trader). It pays only the trader's own
    /// recorded position; the position is deleted after payout, so repeat
    /// calls return 0. Claims for a non-winning outcome fail with
    /// `NotWinningOutcome`.
    pub fn pay_trader(env: Env, match_id: u64, trader: Address, outcome: Outcome) -> i128 {
        let market = get_market(&env, match_id);

        if !market.settled {
            panic_with_error!(&env, Error::NotSettled);
        }
        if market.result != MarketResult::from(&outcome) {
            panic_with_error!(&env, Error::NotWinningOutcome);
        }

        let key = DataKey::Position(PositionKey {
            match_id,
            trader: trader.clone(),
            outcome: outcome.clone(),
        });
        let trader_bet: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if trader_bet == 0 {
            return 0;
        }

        let total = market.total_volume;
        let net_pool = total - total * 3 / 100;
        let winning_pool = bucket(&market, &outcome);
        if winning_pool == 0 {
            return 0;
        }

        let payout = trader_bet * net_pool / winning_pool;

        // Clear position before transferring (defense in depth).
        env.storage().persistent().remove(&key);

        if payout > 0 {
            usdc(&env).transfer(&env.current_contract_address(), &trader, &payout);
        }

        events::trader_paid(&env, match_id, &trader, &outcome, payout);

        payout
    }

    pub fn get_market(env: Env, match_id: u64) -> Market {
        get_market(&env, match_id)
    }

    pub fn get_position(env: Env, match_id: u64, trader: Address, outcome: Outcome) -> i128 {
        let key = DataKey::Position(PositionKey {
            match_id,
            trader,
            outcome,
        });
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Returns implied odds for each outcome (scaled by 100 to avoid floats),
    /// e.g. 185 means a 1.85x return. 0 means "no bets on this outcome yet".
    pub fn get_odds(env: Env, match_id: u64) -> (u32, u32, u32) {
        let market = get_market(&env, match_id);
        let total = market.total_volume;
        if total == 0 {
            return (0, 0, 0);
        }
        let net = total * 97 / 100;
        let odds = |pool: i128| -> u32 {
            if pool > 0 {
                (net * 100 / pool) as u32
            } else {
                0
            }
        };
        (odds(market.pool_a), odds(market.pool_b), odds(market.pool_draw))
    }
}

#[cfg(test)]
mod test;
