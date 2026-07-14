//! Event publishing helpers for the MateFi Settlement contract.
// NOTE: env.events().publish() is deprecated in soroban-sdk 26 in favor of
// #[contractevent], but we keep it deliberately: the spec (README §13) and the
// relayer/frontend agents code against the README's event encoding
// (topics = (Symbol,), data = value tuple), which is exactly what publish()
// emits. Migrating to #[contractevent] would change the on-chain encoding.
#![allow(deprecated)]

use soroban_sdk::{Env, Symbol};

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
