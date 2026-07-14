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
}
