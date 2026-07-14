#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, token, Address, Env, Error as SdkError};

use crate::errors::Error;
use crate::{EscrowVault, EscrowVaultClient};

/// 1 USDC = 10_000_000 stroops (Stellar 7 decimals).
const USDC: i128 = 10_000_000;

/// Contract error for *void* try_fn methods: `Err(Ok(sdk_error))`.
/// (In soroban-sdk 26, try_void_fn returns
///  `Result<Result<(), ConversionError>, Result<SdkError, InvokeError>>`.
///  Contract panics land in the outer Err wrapped in an inner Ok.)
fn cerr(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}

struct Setup<'a> {
    env: Env,
    escrow: EscrowVaultClient<'a>,
    usdc: token::Client<'a>,
    usdc_admin: token::StellarAssetClient<'a>,
    settlement: Address,
    registry: Address,
    pool: Address,
    treasury: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let usdc = token::Client::new(env, &sac.address());
    let usdc_admin = token::StellarAssetClient::new(env, &sac.address());

    let escrow_id = env.register(EscrowVault, ());
    let escrow = EscrowVaultClient::new(env, &escrow_id);

    let settlement = Address::generate(env);
    let registry = Address::generate(env);
    let pool = Address::generate(env);
    let treasury = Address::generate(env);

    escrow.initialize(&sac.address(), &settlement, &registry, &pool, &treasury);

    Setup {
        env: env.clone(),
        escrow,
        usdc,
        usdc_admin,
        settlement,
        registry,
        pool,
        treasury,
    }
}

/// Simulate funds already in the vault (registry/pool transferred USDC before calling).
fn fund_vault(s: &Setup, amount: i128) {
    s.usdc_admin.mint(&s.escrow.address, &amount);
}

#[test]
fn initialize_only_once() {
    let env = Env::default();
    let s = setup(&env);
    let res = s.escrow.try_initialize(
        &s.usdc.address,
        &s.settlement,
        &s.registry,
        &s.pool,
        &s.treasury,
    );
    assert_eq!(res, Err(Ok(cerr(Error::AlreadyInitialized))));
}

#[test]
fn record_deposit_both_players() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    fund_vault(&s, 1000 * USDC);
    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.record_deposit(&1, &b, &(500 * USDC));

    let rec = s.escrow.get_record(&1);
    assert_eq!(rec.player_a, a);
    assert_eq!(rec.player_b, Some(b));
    assert_eq!(rec.amount_each, 500 * USDC);
    assert_eq!(rec.bonus, 0);
    assert_eq!(rec.total_locked, 1000 * USDC);
    assert!(!rec.released);
}

#[test]
fn record_deposit_rejects_mismatched_amount() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    let res = s.escrow.try_record_deposit(&1, &b, &(400 * USDC));
    assert_eq!(res, Err(Ok(cerr(Error::DepositMismatch))));
}

#[test]
fn record_deposit_rejects_double_deposit_by_player_a() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);

    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    let res = s.escrow.try_record_deposit(&1, &a, &(500 * USDC));
    assert_eq!(res, Err(Ok(cerr(Error::DepositMismatch))));
}

#[test]
fn record_deposit_rejects_third_player() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let c = Address::generate(&env);

    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.record_deposit(&1, &b, &(500 * USDC));
    let res = s.escrow.try_record_deposit(&1, &c, &(500 * USDC));
    assert_eq!(res, Err(Ok(cerr(Error::DepositMismatch))));
}

#[test]
fn add_bonus_credits_flywheel() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.record_deposit(&1, &b, &(500 * USDC));
    s.escrow.add_bonus(&1, &(24 * USDC));

    let rec = s.escrow.get_record(&1);
    assert_eq!(rec.bonus, 24 * USDC);
    assert_eq!(rec.total_locked, 1024 * USDC);
}

#[test]
fn add_bonus_rejects_nonpositive_and_missing_record() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);

    assert_eq!(
        s.escrow.try_add_bonus(&7, &USDC),
        Err(Ok(cerr(Error::RecordNotFound)))
    );

    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    assert_eq!(
        s.escrow.try_add_bonus(&1, &0),
        Err(Ok(cerr(Error::InvalidAmount)))
    );
}

#[test]
fn release_pays_winner_and_treasury_exactly() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    // Spec §10 numbers: 500 + 500 deposits, 24 USDC flywheel bonus.
    fund_vault(&s, 1024 * USDC);
    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.record_deposit(&1, &b, &(500 * USDC));
    s.escrow.add_bonus(&1, &(24 * USDC));

    // player_prize = 97% of 1024 = 993.28 USDC.
    let prize: i128 = 9_932_800_000;
    s.escrow.release(&1, &a, &prize);

    assert_eq!(s.usdc.balance(&a), prize);
    assert_eq!(s.usdc.balance(&s.treasury), 307_200_000); // 30.72 USDC rake
    assert_eq!(s.usdc.balance(&s.escrow.address), 0); // vault zeroes out
    assert!(s.escrow.get_record(&1).released);
}

#[test]
fn release_rejects_double_release_and_overdraw() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    fund_vault(&s, 1000 * USDC);
    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.record_deposit(&1, &b, &(500 * USDC));

    assert_eq!(
        s.escrow.try_release(&1, &a, &(1001 * USDC)),
        Err(Ok(cerr(Error::AmountExceedsLocked)))
    );

    s.escrow.release(&1, &a, &(970 * USDC));
    assert_eq!(
        s.escrow.try_release(&1, &a, &(1 * USDC)),
        Err(Ok(cerr(Error::AlreadyReleased)))
    );
}

#[test]
fn release_draw_refunds_deposits_and_sends_bonus_to_treasury() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    fund_vault(&s, 1024 * USDC);
    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.record_deposit(&1, &b, &(500 * USDC));
    s.escrow.add_bonus(&1, &(24 * USDC));

    s.escrow.release_draw(&1);

    // Documented edge case: deposits refunded, stranded flywheel bonus goes
    // to treasury (no player-pool fee on draws).
    assert_eq!(s.usdc.balance(&a), 500 * USDC);
    assert_eq!(s.usdc.balance(&b), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.treasury), 24 * USDC);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);

    assert_eq!(
        s.escrow.try_release_draw(&1),
        Err(Ok(cerr(Error::AlreadyReleased)))
    );
}

#[test]
fn refund_returns_deposit_on_cancel() {
    let env = Env::default();
    let s = setup(&env);
    let a = Address::generate(&env);

    fund_vault(&s, 500 * USDC);
    s.escrow.record_deposit(&1, &a, &(500 * USDC));
    s.escrow.refund(&1, &a, &(500 * USDC));

    assert_eq!(s.usdc.balance(&a), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);
    assert!(s.escrow.get_record(&1).released);

    // Released record cannot be refunded again.
    assert_eq!(
        s.escrow.try_refund(&1, &a, &(500 * USDC)),
        Err(Ok(cerr(Error::AlreadyReleased)))
    );
}

/// Without mocked auth, the require_auth() gates must reject direct external calls.
#[test]
fn gated_functions_reject_unauthorized_callers() {
    let env = Env::default();
    // No mock_all_auths — auth checks run for real
    let escrow_id = env.register(EscrowVault, ());
    let escrow = EscrowVaultClient::new(&env, &escrow_id);

    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let settlement = Address::generate(&env);
    let registry = Address::generate(&env);
    let pool = Address::generate(&env);
    let treasury = Address::generate(&env);
    // initialize has no require_auth — works without mocking
    escrow.initialize(&sac.address(), &settlement, &registry, &pool, &treasury);

    let attacker = Address::generate(&env);
    assert!(escrow.try_record_deposit(&1, &attacker, &USDC).is_err());
    assert!(escrow.try_add_bonus(&1, &USDC).is_err());
    assert!(escrow.try_release(&1, &attacker, &USDC).is_err());
    assert!(escrow.try_release_draw(&1).is_err());
    assert!(escrow.try_refund(&1, &attacker, &USDC).is_err());
}
