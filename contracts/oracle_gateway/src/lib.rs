//! MateFi — OracleGateway contract.
//!
//! Trust boundary between the off-chain relayer and on-chain state. The
//! whitelisted relayer account is the only address allowed to post Stockfish
//! evaluations and game results. Every post is stored/emitted on-chain for
//! auditability.
//!
//! - `post_evaluation` stores an `EvalRecord` keyed by
//!   `(match_id, ledger sequence)` and auto-locks the prediction market
//!   (one-way) once `|score| >= threshold` (default 250 centipawns) holds for
//!   `confirmations` consecutive evals on the same side (default 3). A single
//!   move — e.g. a capture seen before its recapture — produces a transient
//!   eval spike that must NOT close the market, since a chess game is not
//!   decided by one move. Mate scores arrive as ±9999 and lock immediately.
//! - `post_result` triggers `Settlement.execute` — the full settlement
//!   cascade runs atomically inside that call.
//!
//! ## Caller gating
//! The relayer is an *account* address: `relayer.require_auth()` requires its
//! signature on the transaction. Downstream, this contract is the direct
//! invoker of `PredictionPool.lock_market` and `Settlement.execute`, which
//! gate on this contract's address via Soroban's invoker-contract auth rule.

#![no_std]

pub mod errors;
pub mod events;
pub mod state;

use soroban_sdk::{contract, contractclient, contractimpl, panic_with_error, Address, Bytes, Env};

use errors::Error;
use state::{DataKey, EvalRecord, Winner};

// --- Minimal clients for sibling contracts (spec correction #4) ---

/// Subset of the PredictionPool interface that the oracle calls.
#[contractclient(name = "PredictionPoolClient")]
pub trait PredictionPoolIface {
    fn lock_market(env: Env, match_id: u64, eval_score: i32);
}

/// Subset of the Settlement interface that the oracle calls.
#[contractclient(name = "SettlementClient")]
pub trait SettlementIface {
    fn submit_result(env: Env, match_id: u64, winner: Winner);
}

/// Default lock threshold in centipawns (absolute value) — spec §2/§11.
pub const DEFAULT_EVAL_THRESHOLD: i32 = 250;

/// Default number of consecutive same-side decisive evaluations required to
/// lock the market. A chess game is not decided by a single move, so a one-ply
/// eval spike (typically a capture seen before the recapture) must not close
/// the market — the advantage has to be sustained for this many evals.
pub const DEFAULT_LOCK_CONFIRMATIONS: u32 = 3;

/// Forced-mate sentinel score the relayer posts (spec §11). A mate is terminal
/// and locks the market immediately, bypassing the confirmation streak.
pub const MATE_SCORE: i32 = 9999;

#[contract]
pub struct OracleGateway;

// --- internal helpers ---

fn get_addr(env: &Env, key: DataKey) -> Address {
    env.storage()
        .instance()
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

#[contractimpl]
impl OracleGateway {
    /// Called once after deployment.
    pub fn initialize(env: Env, relayer: Address, prediction_pool: Address, settlement: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::Relayer, &relayer);
        env.storage()
            .instance()
            .set(&DataKey::Pool, &prediction_pool);
        env.storage()
            .instance()
            .set(&DataKey::Settlement, &settlement);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &DEFAULT_EVAL_THRESHOLD);
        env.storage()
            .instance()
            .set(&DataKey::Confirmations, &DEFAULT_LOCK_CONFIRMATIONS);
    }

    /// Posted by the relayer after every move. Stores the eval on-chain,
    /// keyed by `(match_id, ledger sequence)`. If `|score| >= threshold`,
    /// locks the prediction market (one-way; `lock_market` is idempotent).
    pub fn post_evaluation(env: Env, match_id: u64, fen: Bytes, depth: u32, score: i32) {
        get_addr(&env, DataKey::Relayer).require_auth();

        let threshold: i32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(DEFAULT_EVAL_THRESHOLD);

        let timestamp = env.ledger().timestamp();
        let record = EvalRecord {
            fen,
            depth,
            score,
            timestamp,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Eval(match_id, env.ledger().sequence()), &record);

        events::eval_posted(&env, match_id, score, depth, timestamp);

        // Sustained-advantage lock: a single move must not close the market.
        // We track a signed streak per match — magnitude = consecutive decisive
        // evals, sign = side ahead. The market locks one-way only once the
        // streak reaches `confirmations` on the same side. A forced mate
        // (±9999) is terminal and bypasses the streak. (Comparison form avoids
        // i32::MIN abs() overflow.)
        let confirmations: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Confirmations)
            .unwrap_or(DEFAULT_LOCK_CONFIRMATIONS);

        let crosses = score >= threshold || score <= -threshold;
        let prev: i32 = env
            .storage()
            .persistent()
            .get(&DataKey::Streak(match_id))
            .unwrap_or(0);
        let streak: i32 = if !crosses {
            0 // advantage evaporated — reset so the market stays open
        } else if score > 0 {
            if prev > 0 {
                prev.saturating_add(1)
            } else {
                1
            }
        } else if prev < 0 {
            prev.saturating_sub(1)
        } else {
            -1
        };
        env.storage()
            .persistent()
            .set(&DataKey::Streak(match_id), &streak);

        let is_mate = score >= MATE_SCORE || score <= -MATE_SCORE;
        if is_mate || streak.unsigned_abs() >= confirmations {
            let pool = get_addr(&env, DataKey::Pool);
            PredictionPoolClient::new(&env, &pool).lock_market(&match_id, &score);

            events::threshold_crossed(&env, match_id, score, threshold);
        }
    }

    /// Posted by the relayer when the game ends. Submits the result to
    /// `Settlement.submit_result`, which starts the dispute challenge window
    /// — funds do not move until the window elapses or a dispute is
    /// resolved (see `contracts/settlement`).
    pub fn post_result(env: Env, match_id: u64, winner: Winner) {
        get_addr(&env, DataKey::Relayer).require_auth();

        events::result_posted(&env, match_id, &winner);

        let settlement = get_addr(&env, DataKey::Settlement);
        SettlementClient::new(&env, &settlement).submit_result(&match_id, &winner);
    }

    /// Admin: update the lock threshold (whitelisted relayer only).
    pub fn set_threshold(env: Env, caller: Address, new_threshold: i32) {
        let relayer = get_addr(&env, DataKey::Relayer);
        if caller != relayer {
            panic_with_error!(&env, Error::Unauthorized);
        }
        caller.require_auth();

        if new_threshold <= 0 {
            panic_with_error!(&env, Error::InvalidThreshold);
        }

        let old: i32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(DEFAULT_EVAL_THRESHOLD);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &new_threshold);

        events::threshold_updated(&env, old, new_threshold);
    }

    pub fn get_threshold(env: Env) -> i32 {
        env.storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(DEFAULT_EVAL_THRESHOLD)
    }

    /// Admin: update how many consecutive same-side decisive evals are required
    /// to lock the market (whitelisted relayer only). Must be ≥ 1.
    pub fn set_confirmations(env: Env, caller: Address, new_confirmations: u32) {
        let relayer = get_addr(&env, DataKey::Relayer);
        if caller != relayer {
            panic_with_error!(&env, Error::Unauthorized);
        }
        caller.require_auth();

        if new_confirmations < 1 {
            panic_with_error!(&env, Error::InvalidThreshold);
        }

        env.storage()
            .instance()
            .set(&DataKey::Confirmations, &new_confirmations);
    }

    pub fn get_confirmations(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Confirmations)
            .unwrap_or(DEFAULT_LOCK_CONFIRMATIONS)
    }

    /// Read a stored eval record (additive helper for relayer/frontend
    /// auditing; key is the ledger sequence at which the eval was posted).
    pub fn get_eval(env: Env, match_id: u64, sequence: u32) -> Option<EvalRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Eval(match_id, sequence))
    }
}

#[cfg(test)]
mod test;
