//! Event publishing helpers for the MateFi PredictionPool contract.
// NOTE: env.events().publish() is deprecated in soroban-sdk 26 in favor of
// #[contractevent], but we keep it deliberately: the spec (README §13) and the
// relayer/frontend agents code against the README's event encoding
// (topics = (Symbol,), data = value tuple), which is exactly what publish()
// emits. Migrating to #[contractevent] would change the on-chain encoding.
#![allow(deprecated)]

use soroban_sdk::{Address, Env, Symbol};

use crate::state::{Outcome, Winner};

/// `MarketOpened(match_id)` — market created with all three pools at zero.
pub fn market_opened(env: &Env, match_id: u64) {
    env.events()
        .publish((Symbol::new(env, "MarketOpened"),), (match_id,));
}

/// `BetPlaced(match_id, trader, outcome, amount)` — trader bought an outcome.
pub fn bet_placed(env: &Env, match_id: u64, trader: &Address, outcome: &Outcome, amount: i128) {
    env.events().publish(
        (Symbol::new(env, "BetPlaced"),),
        (match_id, trader.clone(), outcome.clone(), amount),
    );
}

/// `MarketLocked(match_id, eval_score)` — eval threshold crossed, one-way lock.
pub fn market_locked(env: &Env, match_id: u64, eval_score: i32) {
    env.events()
        .publish((Symbol::new(env, "MarketLocked"),), (match_id, eval_score));
}

/// `MarketSettled(match_id, winner, net_pool, winning_pool)` — fees skimmed,
/// market frozen for claims.
pub fn market_settled(env: &Env, match_id: u64, winner: &Winner, net_pool: i128, winning_pool: i128) {
    env.events().publish(
        (Symbol::new(env, "MarketSettled"),),
        (match_id, winner.clone(), net_pool, winning_pool),
    );
}

/// `TraderPaid(match_id, trader, outcome, payout)` — winning trader claimed.
pub fn trader_paid(env: &Env, match_id: u64, trader: &Address, outcome: &Outcome, payout: i128) {
    env.events().publish(
        (Symbol::new(env, "TraderPaid"),),
        (match_id, trader.clone(), outcome.clone(), payout),
    );
}
