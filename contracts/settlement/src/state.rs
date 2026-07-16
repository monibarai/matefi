//! State types and storage keys for the MateFi Settlement contract.
//!
//! The `MatchState`/`Match`/`Outcome`/`Market`/`Winner` types are replicated
//! from their owning crates (spec §5.2: shared enums must be XDR-identical
//! across contracts) because the cross-contract clients below return them.

use soroban_sdk::{contracttype, Address};

/// Game result (spec §5.2 — replicated identically across crates).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Winner {
    PlayerA,
    PlayerB,
    Draw,
}

/// Tradeable outcomes (replica of `prediction_pool::state::Outcome`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    PlayerA,
    PlayerB,
    Draw,
}

/// Match lifecycle (replica of `match_registry::state::MatchState`). Must
/// stay variant-for-variant identical to the registry's copy.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MatchState {
    Open,
    Active,
    Locked,
    Completed,
    Cancelled,
    PendingFinalization,
    Disputed,
}

/// Arbiter's resolution of a disputed match.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum DisputeOutcome {
    /// The originally submitted result stands.
    Uphold,
    /// The result is overturned in favor of the given winner.
    Reverse(Winner),
    /// The match is voided — settled as a Draw (both players refunded,
    /// bettors paid out via the pool's existing draw path). Reuses the
    /// existing draw-settlement code path rather than adding a bespoke
    /// refund mechanism to EscrowVault/PredictionPool.
    Void,
}

/// A result submitted by the oracle, awaiting the challenge window (or a
/// dispute) before funds move.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingResult {
    pub winner: Winner,
    pub submitted_at: u64,
}

/// A dispute opened against a pending result.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DisputeRecord {
    pub opened_by: Address,
    pub reason: soroban_sdk::Bytes,
    pub opened_at: u64,
}

/// Replica of `match_registry::state::Match` (returned by `get_match`).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Match {
    pub match_id: u64,
    pub player_a: Address,
    pub player_b: Option<Address>,
    pub bet_amount: i128,
    pub time_control_secs: u32,
    pub state: MatchState,
    pub created_at: u64,
    pub started_at: Option<u64>,
}

/// Settlement result enum — mirrors `prediction_pool::state::MarketResult`.
/// Must be XDR-identical (same variant order) for cross-contract reads.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketResult {
    Pending,
    PlayerA,
    PlayerB,
    Draw,
}

/// Replica of `prediction_pool::state::Market` (returned by `get_market`).
/// Uses `MarketResult` instead of `Option<Outcome>` — see PredictionPool state.rs.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Market {
    pub match_id: u64,
    pub player_a: Address,
    pub player_b: Address,
    pub pool_a: i128,
    pub pool_b: i128,
    pub pool_draw: i128,
    pub total_volume: i128,
    pub locked: bool,
    pub lock_eval_score: Option<i32>,
    pub settled: bool,
    pub result: MarketResult,
}

/// Instance storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once by `initialize` — guards re-initialization.
    Initialized,
    /// USDC SAC token address. Stored for interface compatibility with the
    /// spec's `initialize`; this contract never holds or moves USDC itself
    /// (solvency correction — fees are paid by EscrowVault/PredictionPool).
    UsdcToken,
    /// EscrowVault contract address.
    Escrow,
    /// PredictionPool contract address.
    Pool,
    /// MatchRegistry contract address.
    Registry,
    /// OracleGateway contract — the only caller of `submit_result`.
    Oracle,
    /// Treasury account (informational; fee transfers happen in the vaults).
    Treasury,
    /// Address allowed to resolve disputes (`resolve_dispute`) and update
    /// dispute config (`set_arbiter`/`set_challenge_window`).
    Arbiter,
    /// Challenge window length in seconds (default `DEFAULT_CHALLENGE_WINDOW_SECS`).
    ChallengeWindow,
    /// Persistent: pending (unfinalized) result per match id.
    PendingResult(u64),
    /// Persistent: dispute record per match id, once opened.
    Dispute(u64),
}
