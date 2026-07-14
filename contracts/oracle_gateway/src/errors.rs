//! Error codes for the MateFi OracleGateway contract.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// Contract used before `initialize`.
    NotInitialized = 2,
    /// Caller is not the whitelisted relayer.
    Unauthorized = 3,
    /// Threshold must be strictly positive.
    InvalidThreshold = 4,
}
