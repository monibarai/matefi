//! Event publishing helpers for the MateFi Settlement contract.
// NOTE: env.events().publish() is deprecated in soroban-sdk 26 in favor of
// #[contractevent], but we keep it deliberately: the spec (README §13) and the
// relayer/frontend agents code against the README's event encoding
// (topics = (Symbol,), data = value tuple), which is exactly what publish()
// emits. Migrating to #[contractevent] would change the on-chain encoding.
#![allow(deprecated)]

use soroban_sdk::{Address, Bytes, Env, Symbol};

use crate::state::Winner;

/// `MatchSettled(match_id, winner, player_prize, net_pool, winning_pool,
/// trading_fee_treasury, trading_fee_to_prize)` — full settlement breakdown.
///
/// For a Draw, `player_prize` is the total refunded to the players
/// (`2 × bet_amount`; the flywheel bonus goes to treasury — see EscrowVault).
#[allow(clippy::too_many_arguments)]
pub fn match_settled(
    env: &Env,
    match_id: u64,
    winner: &Winner,
    player_prize: i128,
    net_pool: i128,
    winning_pool: i128,
    trading_fee_treasury: i128,
    trading_fee_to_prize: i128,
) {
    env.events().publish(
        (Symbol::new(env, "MatchSettled"),),
        (
            match_id,
            winner.clone(),
            player_prize,
            net_pool,
            winning_pool,
            trading_fee_treasury,
            trading_fee_to_prize,
        ),
    );
}

/// `ResultSubmitted(match_id, winner, submitted_at)` — oracle posted a
/// result; the challenge window starts now.
pub fn result_submitted(env: &Env, match_id: u64, winner: &Winner, submitted_at: u64) {
    env.events().publish(
        (Symbol::new(env, "ResultSubmitted"),),
        (match_id, winner.clone(), submitted_at),
    );
}

/// `DisputeOpened(match_id, opened_by, opened_at)`.
pub fn dispute_opened(env: &Env, match_id: u64, opened_by: &Address, opened_at: u64) {
    env.events().publish(
        (Symbol::new(env, "DisputeOpened"),),
        (match_id, opened_by.clone(), opened_at),
    );
}

/// `DisputeResolved(match_id, arbiter, final_winner)`.
pub fn dispute_resolved(env: &Env, match_id: u64, arbiter: &Address, final_winner: &Winner) {
    env.events().publish(
        (Symbol::new(env, "DisputeResolved"),),
        (match_id, arbiter.clone(), final_winner.clone()),
    );
}

/// `DisputeReasonNoted(match_id, reason)` — split off from `DisputeOpened`
/// since `Bytes` reasons can be long; keeps the primary event small.
pub fn dispute_reason_noted(env: &Env, match_id: u64, reason: &Bytes) {
    env.events().publish(
        (Symbol::new(env, "DisputeReasonNoted"),),
        (match_id, reason.clone()),
    );
}
