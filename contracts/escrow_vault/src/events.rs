//! Event publishing helpers for the MateFi EscrowVault contract.
// NOTE: env.events().publish() is deprecated in soroban-sdk 26 in favor of
// #[contractevent], but we keep it deliberately: the spec (README §13) and the
// relayer/frontend agents code against the README's event encoding
// (topics = (Symbol,), data = value tuple), which is exactly what publish()
// emits. Migrating to #[contractevent] would change the on-chain encoding.
#![allow(deprecated)]

use soroban_sdk::{Address, Env, Symbol};

/// `FundsLocked(match_id, player, amount, total_locked)` — a player deposit was recorded.
pub fn funds_locked(env: &Env, match_id: u64, player: &Address, amount: i128, total_locked: i128) {
    env.events().publish(
        (Symbol::new(env, "FundsLocked"),),
        (match_id, player.clone(), amount, total_locked),
    );
}

/// `BonusAdded(match_id, amount, total_locked)` — flywheel bonus credited by PredictionPool.
pub fn bonus_added(env: &Env, match_id: u64, amount: i128, total_locked: i128) {
    env.events().publish(
        (Symbol::new(env, "BonusAdded"),),
        (match_id, amount, total_locked),
    );
}

/// `FundsReleased(match_id, winner, amount, protocol_fee)` — winner paid, rake sent to treasury.
pub fn funds_released(env: &Env, match_id: u64, winner: &Address, amount: i128, protocol_fee: i128) {
    env.events().publish(
        (Symbol::new(env, "FundsReleased"),),
        (match_id, winner.clone(), amount, protocol_fee),
    );
}

/// `FundsReleasedDraw(match_id, refund_each, bonus_to_treasury)` — draw refunds executed.
pub fn funds_released_draw(env: &Env, match_id: u64, refund_each: i128, bonus_to_treasury: i128) {
    env.events().publish(
        (Symbol::new(env, "FundsReleasedDraw"),),
        (match_id, refund_each, bonus_to_treasury),
    );
}

/// `Refunded(match_id, player, amount)` — cancelled match, Player A refunded.
pub fn refunded(env: &Env, match_id: u64, player: &Address, amount: i128) {
    env.events().publish(
        (Symbol::new(env, "Refunded"),),
        (match_id, player.clone(), amount),
    );
}
