//! State types and storage keys for the MateFi MatchRegistry contract.

use soroban_sdk::{contracttype, Address};

/// Match lifecycle state machine (spec §5.2 — replicated identically in every
/// crate that references it).
///
/// Note: `Locked` is a *market-level* condition tracked by the PredictionPool
/// (`Market.locked`); the registry itself only ever transitions
/// `Open → Active → Completed` or `Open → Cancelled`. The variant exists here
/// so the enum is XDR-identical across contracts per the spec.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MatchState {
    Open,      // created, waiting for Player B
    Active,    // both players joined, game in progress
    Locked,    // market locked (eval threshold crossed), game still live
    Completed, // game over, settlement triggered
    Cancelled, // Player B never joined, Player A refunded
}

/// Per-match record.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Match {
    pub match_id: u64,
    pub player_a: Address,
    pub player_b: Option<Address>,
    pub bet_amount: i128, // in USDC stroops (7 decimal places, 1 USDC = 10_000_000)
    pub time_control_secs: u32, // total seconds per player
    pub state: MatchState,
    pub created_at: u64, // ledger timestamp
    pub started_at: Option<u64>,
}

/// Instance / persistent storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once by `initialize` — guards re-initialization.
    Initialized,
    /// USDC SAC token address.
    UsdcToken,
    /// EscrowVault contract address.
    Escrow,
    /// PredictionPool contract address.
    Pool,
    /// Settlement contract — the only caller of `complete_match`.
    Settlement,
    /// Monotonic match id counter (instance storage).
    MatchCounter,
    /// Persistent: match record per match id.
    Match(u64),
}
