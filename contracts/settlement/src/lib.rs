//! MateFi — Settlement contract.
//!
//! Orchestrates the full settlement cascade. A result no longer pays out the
//! instant the oracle posts it — `submit_result` only *records* the result
//! and starts a challenge window (`DataKey::ChallengeWindow`, default
//! [`DEFAULT_CHALLENGE_WINDOW_SECS`]). One of two things then happens:
//!
//! - Nobody disputes → anyone can call `finalize` once the window elapses,
//!   which runs the cascade below with the submitted winner.
//! - A party (either player, or the arbiter) calls `dispute` inside the
//!   window → the match moves to `Disputed` and funds stay frozen until the
//!   arbiter calls `resolve_dispute` (uphold the original result, reverse the
//!   winner, or void the match — settled as a Draw).
//!
//! The cascade itself is unchanged from the original one-shot design (this
//! contract **never holds funds** — a deliberate correction to the spec's
//! §5.7 pseudocode, which had Settlement transferring treasury fees from its
//! own (empty) balance):
//!
//! 1. `PredictionPool.settle(match_id, winner)` — the pool skims its own
//!    balance: 1% of volume → treasury, 2% of volume → EscrowVault
//!    (`add_bonus` flywheel credit); returns `(net_pool, winning_pool)`.
//! 2. Player payout from EscrowVault, which now holds
//!    `2 × bet + flywheel bonus`:
//!    - Win:  `EscrowVault.release(match_id, winner_addr, player_prize)`
//!      where `player_prize = 97%` of the pool; the vault forwards the 3%
//!      remainder to treasury itself.
//!    - Draw/Void: `EscrowVault.release_draw(match_id)` — deposits refunded,
//!      any flywheel bonus goes to treasury (documented in EscrowVault).
//! 3. `MatchRegistry.complete_match(match_id)`.
//! 4. Emits `MatchSettled` with the full breakdown.
//!
//! Winning traders are NOT paid here — the chain cannot enumerate traders.
//! `PredictionPool.pay_trader` is a permissionless per-trader claim that the
//! relayer triggers after settlement (spec correction #3).
//!
//! ## Caller gating
//! `submit_result` is gated to the OracleGateway contract via Soroban's
//! invoker-contract auth rule (`oracle.require_auth()` passes automatically
//! when, and only when, the oracle is the direct invoker). `finalize` is
//! permissionless by design (any keeper/observer can unstick a match once
//! the window elapses — no single relayer process needs to stay online).
//! `dispute` requires the caller's own signature and must be one of the two
//! match players or the arbiter. `resolve_dispute` requires the arbiter's
//! signature. Downstream, this contract is the direct invoker of
//! `pool.settle`, `escrow.release*`, `registry.complete_match`, and
//! `registry.set_pending_finalization`/`set_disputed`, which gate on this
//! contract's address the same way.

#![no_std]

pub mod errors;
pub mod events;
pub mod state;

use soroban_sdk::{contract, contractclient, contractimpl, panic_with_error, Address, Bytes, Env};

use errors::Error;
use state::{
    DataKey, DisputeOutcome, DisputeRecord, Market, Match, MatchState, PendingResult, Winner,
};

// --- Minimal clients for sibling contracts (spec correction #4) ---

/// Subset of the MatchRegistry interface that Settlement calls.
#[contractclient(name = "MatchRegistryClient")]
pub trait MatchRegistryIface {
    fn get_match(env: Env, match_id: u64) -> Match;
    fn complete_match(env: Env, match_id: u64);
    fn set_pending_finalization(env: Env, match_id: u64);
    fn set_disputed(env: Env, match_id: u64);
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

/// Default challenge window: 1 hour. Configurable per-deployment via
/// `set_challenge_window` (arbiter-only).
pub const DEFAULT_CHALLENGE_WINDOW_SECS: u64 = 3600;

#[contract]
pub struct Settlement;

// --- internal helpers ---

fn get_addr(env: &Env, key: DataKey) -> Address {
    env.storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

fn get_pending(env: &Env, match_id: u64) -> PendingResult {
    env.storage()
        .persistent()
        .get(&DataKey::PendingResult(match_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::NoPendingResult))
}

/// Runs the funds-moving cascade — shared by `finalize` and
/// `resolve_dispute`. Assumes the match is already parked in
/// `PendingFinalization`/`Disputed` (i.e. `submit_result` already ran).
fn run_cascade(env: &Env, match_id: u64, m: &Match, winner: Winner) {
    let escrow = get_addr(env, DataKey::Escrow);
    let pool_addr = get_addr(env, DataKey::Pool);
    let registry = get_addr(env, DataKey::Registry);

    let pool_client = PredictionPoolClient::new(env, &pool_addr);
    let market = pool_client.get_market(&match_id);
    let trading_volume = market.total_volume;
    let trading_fee_treasury = trading_volume / 100; // 1% → treasury
    let trading_fee_to_prize = trading_volume * 2 / 100; // 2% → flywheel

    let (net_pool, winning_pool) = pool_client.settle(&match_id, &winner);

    let player_pool = m.bet_amount * 2 + trading_fee_to_prize;
    let player_protocol_fee = player_pool * 3 / 100;
    let player_prize = player_pool - player_protocol_fee;

    let escrow_client = EscrowVaultClient::new(env, &escrow);

    let player_payout: i128 = match &winner {
        Winner::PlayerA => {
            escrow_client.release(&match_id, &m.player_a, &player_prize);
            player_prize
        }
        Winner::PlayerB => {
            let player_b = match m.player_b.clone() {
                Some(pb) => pb,
                None => panic_with_error!(env, Error::PlayerBMissing),
            };
            escrow_client.release(&match_id, &player_b, &player_prize);
            player_prize
        }
        Winner::Draw => {
            escrow_client.release_draw(&match_id);
            m.bet_amount * 2
        }
    };

    let registry_client = MatchRegistryClient::new(env, &registry);
    registry_client.complete_match(&match_id);

    env.storage()
        .persistent()
        .remove(&DataKey::PendingResult(match_id));
    env.storage()
        .persistent()
        .remove(&DataKey::Dispute(match_id));

    events::match_settled(
        env,
        match_id,
        &winner,
        player_payout,
        net_pool,
        winning_pool,
        trading_fee_treasury,
        trading_fee_to_prize,
    );
}

#[contractimpl]
impl Settlement {
    /// Called once after deployment. Signature matches spec §5.7 plus an
    /// `arbiter` address for dispute resolution.
    ///
    /// Note: `usdc_token` and `treasury` are stored for interface
    /// compatibility and observability, but this contract never moves USDC —
    /// fee transfers are executed by EscrowVault and PredictionPool (solvency
    /// correction).
    #[allow(clippy::too_many_arguments)]
    pub fn initialize(
        env: Env,
        usdc_token: Address,
        escrow_vault: Address,
        prediction_pool: Address,
        match_registry: Address,
        oracle: Address,
        treasury: Address,
        arbiter: Address,
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
            .set(&DataKey::Registry, &match_registry);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::Arbiter, &arbiter);
        env.storage()
            .instance()
            .set(&DataKey::ChallengeWindow, &DEFAULT_CHALLENGE_WINDOW_SECS);
    }

    /// Called by `OracleGateway.post_result()` (invoker auth). Records the
    /// result and starts the challenge window — no funds move yet.
    pub fn submit_result(env: Env, match_id: u64, winner: Winner) {
        get_addr(&env, DataKey::Oracle).require_auth();

        let registry = get_addr(&env, DataKey::Registry);
        let registry_client = MatchRegistryClient::new(&env, &registry);
        let m = registry_client.get_match(&match_id);
        if m.state != MatchState::Active {
            panic_with_error!(&env, Error::MatchNotActive);
        }

        registry_client.set_pending_finalization(&match_id);

        let submitted_at = env.ledger().timestamp();
        env.storage().persistent().set(
            &DataKey::PendingResult(match_id),
            &PendingResult {
                winner: winner.clone(),
                submitted_at,
            },
        );

        events::result_submitted(&env, match_id, &winner, submitted_at);
    }

    /// Permissionless — anyone may call once the challenge window has
    /// elapsed with no dispute opened. Runs the full settlement cascade.
    pub fn finalize(env: Env, match_id: u64) {
        let pending = get_pending(&env, match_id);

        let registry = get_addr(&env, DataKey::Registry);
        let registry_client = MatchRegistryClient::new(&env, &registry);
        let m = registry_client.get_match(&match_id);
        if m.state != MatchState::PendingFinalization {
            panic_with_error!(&env, Error::NoPendingResult);
        }

        let window: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ChallengeWindow)
            .unwrap_or(DEFAULT_CHALLENGE_WINDOW_SECS);
        if env.ledger().timestamp() < pending.submitted_at + window {
            panic_with_error!(&env, Error::DisputeWindowNotElapsed);
        }

        run_cascade(&env, match_id, &m, pending.winner);
    }

    /// Open a dispute against a pending result, inside the challenge window.
    /// Callable by either match player or the arbiter.
    pub fn dispute(env: Env, match_id: u64, disputer: Address, reason: Bytes) {
        disputer.require_auth();

        let pending = get_pending(&env, match_id);

        let registry = get_addr(&env, DataKey::Registry);
        let registry_client = MatchRegistryClient::new(&env, &registry);
        let m = registry_client.get_match(&match_id);
        if m.state != MatchState::PendingFinalization {
            panic_with_error!(&env, Error::NoPendingResult);
        }

        let arbiter = get_addr(&env, DataKey::Arbiter);
        let is_party =
            disputer == m.player_a || m.player_b.as_ref() == Some(&disputer) || disputer == arbiter;
        if !is_party {
            panic_with_error!(&env, Error::NotAParty);
        }

        let window: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ChallengeWindow)
            .unwrap_or(DEFAULT_CHALLENGE_WINDOW_SECS);
        if env.ledger().timestamp() >= pending.submitted_at + window {
            panic_with_error!(&env, Error::DisputeWindowClosed);
        }

        registry_client.set_disputed(&match_id);

        let opened_at = env.ledger().timestamp();
        env.storage().persistent().set(
            &DataKey::Dispute(match_id),
            &DisputeRecord {
                opened_by: disputer.clone(),
                reason: reason.clone(),
                opened_at,
            },
        );

        events::dispute_opened(&env, match_id, &disputer, opened_at);
        events::dispute_reason_noted(&env, match_id, &reason);
    }

    /// Arbiter-only. Resolves a disputed match: uphold the original result,
    /// reverse to a different winner, or void (settled as a Draw).
    pub fn resolve_dispute(env: Env, match_id: u64, caller: Address, outcome: DisputeOutcome) {
        caller.require_auth();

        let arbiter = get_addr(&env, DataKey::Arbiter);
        if caller != arbiter {
            panic_with_error!(&env, Error::Unauthorized);
        }

        let registry = get_addr(&env, DataKey::Registry);
        let registry_client = MatchRegistryClient::new(&env, &registry);
        let m = registry_client.get_match(&match_id);
        if m.state != MatchState::Disputed {
            panic_with_error!(&env, Error::NotDisputed);
        }

        let pending = get_pending(&env, match_id);
        let final_winner = match outcome {
            DisputeOutcome::Uphold => pending.winner,
            DisputeOutcome::Reverse(w) => w,
            DisputeOutcome::Void => Winner::Draw,
        };

        run_cascade(&env, match_id, &m, final_winner.clone());

        events::dispute_resolved(&env, match_id, &caller, &final_winner);
    }

    /// Arbiter-only: update the challenge window length.
    pub fn set_challenge_window(env: Env, caller: Address, new_window_secs: u64) {
        let arbiter = get_addr(&env, DataKey::Arbiter);
        if caller != arbiter {
            panic_with_error!(&env, Error::Unauthorized);
        }
        caller.require_auth();

        if new_window_secs == 0 {
            panic_with_error!(&env, Error::InvalidWindow);
        }
        env.storage()
            .instance()
            .set(&DataKey::ChallengeWindow, &new_window_secs);
    }

    /// Arbiter-only: transfer the arbiter role.
    pub fn set_arbiter(env: Env, caller: Address, new_arbiter: Address) {
        let arbiter = get_addr(&env, DataKey::Arbiter);
        if caller != arbiter {
            panic_with_error!(&env, Error::Unauthorized);
        }
        caller.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Arbiter, &new_arbiter);
    }

    pub fn get_challenge_window(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ChallengeWindow)
            .unwrap_or(DEFAULT_CHALLENGE_WINDOW_SECS)
    }

    pub fn get_arbiter(env: Env) -> Address {
        get_addr(&env, DataKey::Arbiter)
    }

    /// Read a pending (unfinalized) result, if any.
    pub fn get_pending_result(env: Env, match_id: u64) -> Option<PendingResult> {
        env.storage()
            .persistent()
            .get(&DataKey::PendingResult(match_id))
    }

    /// Read a dispute record, if one has been opened.
    pub fn get_dispute(env: Env, match_id: u64) -> Option<DisputeRecord> {
        env.storage().persistent().get(&DataKey::Dispute(match_id))
    }
}

#[cfg(test)]
mod test;
