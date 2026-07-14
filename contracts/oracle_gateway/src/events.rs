//! Event publishing helpers for the MateFi OracleGateway contract.
// NOTE: env.events().publish() is deprecated in soroban-sdk 26 in favor of
// #[contractevent], but we keep it deliberately: the spec (README §13) and the
// relayer/frontend agents code against the README's event encoding
// (topics = (Symbol,), data = value tuple), which is exactly what publish()
// emits. Migrating to #[contractevent] would change the on-chain encoding.
#![allow(deprecated)]

use soroban_sdk::{Env, Symbol};

use crate::state::Winner;

/// `EvalPosted(match_id, score, depth, timestamp)` — eval stored on-chain.
pub fn eval_posted(env: &Env, match_id: u64, score: i32, depth: u32, timestamp: u64) {
    env.events().publish(
        (Symbol::new(env, "EvalPosted"),),
        (match_id, score, depth, timestamp),
    );
}

/// `ThresholdCrossed(match_id, score, threshold)` — |score| >= threshold,
/// market lock was triggered.
pub fn threshold_crossed(env: &Env, match_id: u64, score: i32, threshold: i32) {
    env.events().publish(
        (Symbol::new(env, "ThresholdCrossed"),),
        (match_id, score, threshold),
    );
}

/// `ResultPosted(match_id, winner)` — relayer posted the final game result.
pub fn result_posted(env: &Env, match_id: u64, winner: &Winner) {
    env.events().publish(
        (Symbol::new(env, "ResultPosted"),),
        (match_id, winner.clone()),
    );
}

/// `ThresholdUpdated(old, new)` — relayer tuned the lock threshold.
pub fn threshold_updated(env: &Env, old: i32, new: i32) {
    env.events()
        .publish((Symbol::new(env, "ThresholdUpdated"),), (old, new));
}
