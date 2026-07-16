//! Error codes for the MateFi MatchRegistry contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// Contract used before `initialize`.
    NotInitialized = 2,
    /// No match exists for this match id.
    MatchNotFound = 3,
    /// Match is not in the `Open` state (join / cancel only work on open matches).
    MatchNotOpen = 4,
    /// A player cannot play against themselves.
    SelfPlay = 5,
    /// Minimum bet is 1 USDC (10_000_000 stroops).
    BetTooSmall = 6,
    /// Minimum time control is 60 seconds per player.
    TimeControlTooShort = 7,
    /// Only Player A may cancel their own open match.
    NotPlayerA = 8,
    /// Match is not in the `Active` state (completion only works on active matches).
    MatchNotActive = 9,
    /// Match is not in the `PendingFinalization` state.
    MatchNotPendingFinalization = 10,
    /// Match is not in the `Disputed` state.
    MatchNotDisputed = 11,
}
