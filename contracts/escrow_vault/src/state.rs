//! State types and storage keys for the MateFi EscrowVault contract.

use soroban_sdk::{contracttype, Address};

/// Per-match record of locked player funds.
///
/// `total_locked = amount_each * (1 or 2 players) + bonus`.
/// `bonus` is the trading-fee flywheel credit (2% of trading volume) pushed in
/// by the PredictionPool at settlement time via `add_bonus`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct DepositRecord {
    pub player_a: Address,
    pub player_b: Option<Address>,
    pub amount_each: i128,
    pub bonus: i128,
    pub total_locked: i128,
    pub released: bool,
}

/// Instance / persistent storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once by `initialize` — guards re-initialization.
    Initialized,
    /// USDC SAC token address.
    UsdcToken,
    /// Settlement contract — the only caller of `release` / `release_draw`.
    Settlement,
    /// MatchRegistry contract — the only caller of `record_deposit` / `refund`.
    Registry,
    /// PredictionPool contract — the only caller of `add_bonus`.
    Pool,
    /// Treasury account — receives the 3% player-pool rake.
    Treasury,
    /// Persistent: deposit record per match id.
    Record(u64),
}
