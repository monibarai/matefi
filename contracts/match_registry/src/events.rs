//! Event publishing helpers for the MateFi MatchRegistry contract.
// NOTE: env.events().publish() is deprecated in soroban-sdk 26 in favor of
// #[contractevent], but we keep it deliberately: the spec (README §13) and the
// relayer/frontend agents code against the README's event encoding
// (topics = (Symbol,), data = value tuple), which is exactly what publish()
// emits. Migrating to #[contractevent] would change the on-chain encoding.
#![allow(deprecated)]

use soroban_sdk::{Address, Env, Symbol};

/// `MatchCreated(match_id, player_a, bet_amount, time_control_secs)`
pub fn match_created(
    env: &Env,
    match_id: u64,
    player_a: &Address,
    bet_amount: i128,
    time_control_secs: u32,
) {
    env.events().publish(
        (Symbol::new(env, "MatchCreated"),),
        (match_id, player_a.clone(), bet_amount, time_control_secs),
    );
}

/// `MatchActive(match_id, player_a, player_b, bet_amount)` — Player B joined,
/// game is live and the prediction market is open.
pub fn match_active(
    env: &Env,
    match_id: u64,
    player_a: &Address,
    player_b: &Address,
    bet_amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "MatchActive"),),
        (match_id, player_a.clone(), player_b.clone(), bet_amount),
    );
}

/// `MatchCancelled(match_id, player_a)` — open match cancelled, Player A refunded.
pub fn match_cancelled(env: &Env, match_id: u64, player_a: &Address) {
    env.events()
        .publish((Symbol::new(env, "MatchCancelled"),), (match_id, player_a.clone()));
}

/// `MatchCompleted(match_id)` — Settlement marked the match completed.
pub fn match_completed(env: &Env, match_id: u64) {
    env.events()
        .publish((Symbol::new(env, "MatchCompleted"),), (match_id,));
}
