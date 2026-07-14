//! Error codes for the MateFi EscrowVault contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// Contract used before `initialize`.
    NotInitialized = 2,
    /// No deposit record exists for this match id.
    RecordNotFound = 3,
    /// Funds for this match were already released.
    AlreadyReleased = 4,
    /// Requested release amount exceeds the locked total.
    AmountExceedsLocked = 5,
    /// Amount must be strictly positive.
    InvalidAmount = 6,
    /// A second deposit for this match did not match the first one.
    DepositMismatch = 7,
}
