//! State types and storage keys for the MateFi PredictionPool contract.

use soroban_sdk::{contracttype, Address};

/// Tradeable outcomes (spec §5.2 — replicated identically across crates).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    PlayerA,
    PlayerB,
    Draw,
}

/// Game result (spec §5.2 — replicated identically across crates).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Winner {
    PlayerA,
    PlayerB,
    Draw,
}

/// Settlement result for a market: pending (not yet settled) or the winning outcome.
///
/// This replaces `Option<Outcome>` which does not compile in soroban-sdk 26 because
/// the XDR codec for `#[contracttype]` structs requires `ScVal: From<Outcome>` (not
/// just `TryFrom<&Outcome>`), and `#[contracttype]` on enums only generates the
/// `TryFrom<&T>` impl.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum MarketResult {
    Pending,  // not yet settled
    PlayerA,
    PlayerB,
    Draw,
}

impl From<&Outcome> for MarketResult {
    fn from(o: &Outcome) -> Self {
        match o {
            Outcome::PlayerA => MarketResult::PlayerA,
            Outcome::PlayerB => MarketResult::PlayerB,
            Outcome::Draw => MarketResult::Draw,
        }
    }
}

impl From<&Winner> for MarketResult {
    fn from(w: &Winner) -> Self {
        match w {
            Winner::PlayerA => MarketResult::PlayerA,
            Winner::PlayerB => MarketResult::PlayerB,
            Winner::Draw => MarketResult::Draw,
        }
    }
}

/// Per-match parimutuel market.
///
/// Deviation from spec §5.5 (documented): the `result` field was added.
/// Because `pay_trader` is a *permissionless claim* (spec correction #3), the
/// winning outcome must be recorded on-chain at settle time so claims for
/// losing outcomes can be rejected. Uses `MarketResult` instead of
/// `Option<Outcome>` for soroban-sdk 26 XDR codec compatibility.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Market {
    pub match_id: u64,
    pub player_a: Address,
    pub player_b: Address,
    pub pool_a: i128,    // USDC in "Player A wins" bucket (stroops)
    pub pool_b: i128,    // USDC in "Player B wins" bucket
    pub pool_draw: i128, // USDC in "Draw" bucket
    pub total_volume: i128,
    pub locked: bool,
    pub lock_eval_score: Option<i32>, // centipawn score that triggered the lock
    pub settled: bool,
    pub result: MarketResult, // winning outcome (Pending until settled)
}

/// Key for a trader position: (match_id, trader_address, outcome).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PositionKey {
    pub match_id: u64,
    pub trader: Address,
    pub outcome: Outcome,
}

/// Instance / persistent storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once by `initialize` — guards re-initialization.
    Initialized,
    /// USDC SAC token address.
    UsdcToken,
    /// OracleGateway contract — the only caller of `lock_market`.
    Oracle,
    /// Settlement contract — the only caller of `settle`.
    Settlement,
    /// MatchRegistry contract — the only caller of `open_market`.
    Registry,
    /// EscrowVault contract — receives the 2% flywheel bonus at settlement.
    Escrow,
    /// Treasury account — receives the 1% trading rake at settlement.
    Treasury,
    /// Persistent: market per match id.
    Market(u64),
    /// Persistent: trader position amount per (match, trader, outcome).
    Position(PositionKey),
}
