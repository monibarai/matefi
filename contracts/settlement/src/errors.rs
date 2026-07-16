//! Error codes for the MateFi Settlement contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// Contract used before `initialize`.
    NotInitialized = 2,
    /// Match is not in the `Active` state (already settled, cancelled, or
    /// Player B never joined).
    MatchNotActive = 3,
    /// Winner is PlayerB but the match has no Player B (should be
    /// unreachable for an Active match — defensive check).
    PlayerBMissing = 4,
    /// No pending result exists for this match (never submitted, or already
    /// finalized/resolved).
    NoPendingResult = 5,
    /// `finalize` called before the challenge window has elapsed.
    DisputeWindowNotElapsed = 6,
    /// `dispute` called after the challenge window has already closed.
    DisputeWindowClosed = 7,
    /// Match is not in the `Disputed` state (`resolve_dispute` only).
    NotDisputed = 8,
    /// Caller is neither Player A, Player B, nor the arbiter.
    NotAParty = 9,
    /// Caller is not the configured arbiter.
    Unauthorized = 10,
    /// `set_challenge_window`/threshold-style setters require a positive value.
    InvalidWindow = 11,
}
