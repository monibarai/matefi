//! Error codes for the MateFi PredictionPool contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// Contract used before `initialize`.
    NotInitialized = 2,
    /// No market exists for this match id.
    MarketNotFound = 3,
    /// A market already exists for this match id.
    MarketExists = 4,
    /// Market is locked — no new bets.
    MarketIsLocked = 5,
    /// Market was already settled.
    AlreadySettled = 6,
    /// Market has not been settled yet.
    NotSettled = 7,
    /// Minimum bet is 1 USDC (10_000_000 stroops).
    BetTooSmall = 8,
    /// Claimed outcome is not the winning outcome of this market.
    NotWinningOutcome = 9,
}
