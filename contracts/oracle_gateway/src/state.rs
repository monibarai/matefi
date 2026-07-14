//! State types and storage keys for the MateFi OracleGateway contract.

use soroban_sdk::{contracttype, Bytes};

/// Game result (spec §5.2 — replicated identically across crates).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Winner {
    PlayerA,
    PlayerB,
    Draw,
}

/// A single Stockfish evaluation, stored on-chain for auditability.
///
/// Mate scores arrive from the relayer as ±9999 centipawns (spec §11), which
/// always exceeds any sane threshold and force-locks the market.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct EvalRecord {
    pub fen: Bytes,
    pub depth: u32,
    pub score: i32, // centipawns, positive = white better
    pub timestamp: u64,
}

/// Instance / persistent storage keys.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once by `initialize` — guards re-initialization.
    Initialized,
    /// Whitelisted relayer account — the only authorized poster.
    Relayer,
    /// PredictionPool contract address (lock target).
    Pool,
    /// Settlement contract address (result target).
    Settlement,
    /// Centipawn lock threshold (absolute value), default 250.
    Threshold,
    /// Number of consecutive same-side decisive evaluations required before the
    /// market locks, default 3. Prevents a single move (a capture before its
    /// recapture) from closing the market on a transient eval spike.
    Confirmations,
    /// Persistent: signed lock streak for a match. The magnitude is the count of
    /// consecutive decisive evaluations; the sign is the side (+ white, - black,
    /// 0 = no current decisive streak).
    Streak(u64),
    /// Persistent: eval record keyed by (match_id, ledger sequence).
    Eval(u64, u32),
}
