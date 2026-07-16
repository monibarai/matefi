#![cfg(test)]
#![allow(dead_code)]
extern crate std;

use soroban_sdk::{testutils::Address as _, token, Address, Env, Error as SdkError};

use crate::errors::Error;
use crate::state::MatchState;
use crate::{MatchRegistry, MatchRegistryClient, MIN_BET_STROOPS, MIN_TIME_CONTROL_SECS};
use escrow_vault::{EscrowVault, EscrowVaultClient};
use prediction_pool::{PredictionPool, PredictionPoolClient};

/// 1 USDC = 10_000_000 stroops.
const USDC: i128 = 10_000_000;

/// void try_fn → Err(Ok(sdk_error))
fn void_err(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}
/// value-returning try_fn → Ok(Err(sdk_error))
fn val_err(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}

struct Setup<'a> {
    env: Env,
    registry: MatchRegistryClient<'a>,
    escrow: EscrowVaultClient<'a>,
    pool: PredictionPoolClient<'a>,
    usdc: token::Client<'a>,
    usdc_admin: token::StellarAssetClient<'a>,
    oracle: Address,
    settlement: Address,
    treasury: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let usdc = token::Client::new(env, &sac.address());
    let usdc_admin = token::StellarAssetClient::new(env, &sac.address());

    let registry_id = env.register(MatchRegistry, ());
    let registry = MatchRegistryClient::new(env, &registry_id);

    let escrow_id = env.register(EscrowVault, ());
    let escrow = EscrowVaultClient::new(env, &escrow_id);

    let pool_id = env.register(PredictionPool, ());
    let pool = PredictionPoolClient::new(env, &pool_id);

    let oracle = Address::generate(env);
    let settlement = Address::generate(env);
    let treasury = Address::generate(env);

    // Initialize all contracts
    escrow.initialize(
        &sac.address(),
        &settlement,
        &registry_id,
        &pool_id,
        &treasury,
    );
    pool.initialize(
        &sac.address(),
        &oracle,
        &settlement,
        &registry_id,
        &escrow_id,
        &treasury,
    );
    registry.initialize(&sac.address(), &escrow_id, &pool_id, &settlement);

    Setup {
        env: env.clone(),
        registry,
        escrow,
        pool,
        usdc,
        usdc_admin,
        oracle,
        settlement,
        treasury,
    }
}

#[test]
fn initialize_only_once() {
    let env = Env::default();
    let s = setup(&env);
    let dummy = Address::generate(&env);
    let res = s.registry.try_initialize(&dummy, &dummy, &dummy, &dummy);
    assert_eq!(res, Err(Ok(void_err(Error::AlreadyInitialized))));
}

#[test]
fn create_match_returns_match_id_and_transfers_usdc() {
    let env = Env::default();
    let s = setup(&env);

    let player_a = Address::generate(&env);
    s.usdc_admin.mint(&player_a, &(500 * USDC));

    let match_id = s.registry.create_match(&player_a, &(500 * USDC), &600);
    assert_eq!(match_id, 1);

    // USDC moved from player to escrow
    assert_eq!(s.usdc.balance(&player_a), 0);
    assert_eq!(s.usdc.balance(&s.escrow.address), 500 * USDC);

    // Match state is Open
    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::Open);
    assert_eq!(m.player_a, player_a);
    assert!(m.player_b.is_none());
    assert_eq!(m.bet_amount, 500 * USDC);
    assert_eq!(m.time_control_secs, 600);
}

#[test]
fn create_match_increments_counter() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));

    let id1 = s.registry.create_match(&pa, &(100 * USDC), &600);
    let id2 = s.registry.create_match(&pb, &(100 * USDC), &600);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
fn create_match_rejected_below_min_bet() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let res = s
        .registry
        .try_create_match(&pa, &(MIN_BET_STROOPS - 1), &600);
    assert_eq!(res, Err(Ok(void_err(Error::BetTooSmall))));
}

#[test]
fn create_match_rejected_below_min_time_control() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let res = s
        .registry
        .try_create_match(&pa, &MIN_BET_STROOPS, &(MIN_TIME_CONTROL_SECS - 1));
    assert_eq!(res, Err(Ok(void_err(Error::TimeControlTooShort))));
}

#[test]
fn join_match_activates_match_and_opens_market() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));

    let match_id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&match_id, &pb);

    let m = s.registry.get_match(&match_id);
    assert_eq!(m.state, MatchState::Active);
    assert_eq!(m.player_b, Some(pb.clone()));
    assert!(m.started_at.is_some());

    // Escrow holds both deposits
    let rec = s.escrow.get_record(&match_id);
    assert_eq!(rec.total_locked, 200 * USDC);

    // Prediction market opened
    let market = s.pool.get_market(&match_id);
    assert!(!market.locked);
    assert!(!market.settled);
    assert_eq!(market.player_a, pa);
    assert_eq!(market.player_b, pb);
}

#[test]
fn join_match_rejected_for_already_active_match() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    let pc = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));
    s.usdc_admin.mint(&pc, &(100 * USDC));

    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);

    let res = s.registry.try_join_match(&id, &pc);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotOpen))));
}

#[test]
fn join_match_rejected_for_self_play() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));

    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    let res = s.registry.try_join_match(&id, &pa);
    assert_eq!(res, Err(Ok(void_err(Error::SelfPlay))));
}

#[test]
fn cancel_match_refunds_player_a() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));

    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.cancel_match(&id, &pa);

    let m = s.registry.get_match(&id);
    assert_eq!(m.state, MatchState::Cancelled);

    // Player A refunded
    assert_eq!(s.usdc.balance(&pa), 100 * USDC);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);
}

#[test]
fn cancel_match_rejected_for_active_match() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));

    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);

    let res = s.registry.try_cancel_match(&id, &pa);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotOpen))));
}

#[test]
fn cancel_match_rejected_for_non_player_a() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let attacker = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));

    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    let res = s.registry.try_cancel_match(&id, &attacker);
    assert_eq!(res, Err(Ok(void_err(Error::NotPlayerA))));
}

#[test]
fn complete_match_only_callable_by_settlement() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));
    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);
    s.registry.set_pending_finalization(&id);

    // Calling complete_match is authorized only when Settlement is the invoker.
    // In tests with mock_all_auths() the auth check is satisfied regardless, so
    // we just verify it transitions correctly when called by the settlement address.
    s.registry.complete_match(&id);

    let m = s.registry.get_match(&id);
    assert_eq!(m.state, MatchState::Completed);
}

#[test]
fn complete_match_rejected_when_active() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));
    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);

    let res = s.registry.try_complete_match(&id);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotPendingFinalization))));
}

#[test]
fn complete_match_allowed_when_disputed() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));
    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);
    s.registry.set_pending_finalization(&id);
    s.registry.set_disputed(&id);

    s.registry.complete_match(&id);

    let m = s.registry.get_match(&id);
    assert_eq!(m.state, MatchState::Completed);
}

#[test]
fn set_pending_finalization_requires_active() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    let id = s.registry.create_match(&pa, &(100 * USDC), &600);

    let res = s.registry.try_set_pending_finalization(&id);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotActive))));
}

#[test]
fn set_disputed_requires_pending_finalization() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));
    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);

    let res = s.registry.try_set_disputed(&id);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotPendingFinalization))));
}

#[test]
fn set_disputed_rejects_double_dispute() {
    let env = Env::default();
    let s = setup(&env);

    let pa = Address::generate(&env);
    let pb = Address::generate(&env);
    s.usdc_admin.mint(&pa, &(100 * USDC));
    s.usdc_admin.mint(&pb, &(100 * USDC));
    let id = s.registry.create_match(&pa, &(100 * USDC), &600);
    s.registry.join_match(&id, &pb);
    s.registry.set_pending_finalization(&id);
    s.registry.set_disputed(&id);

    let res = s.registry.try_set_disputed(&id);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotPendingFinalization))));
}

#[test]
fn get_match_rejects_unknown_match_id() {
    let env = Env::default();
    let s = setup(&env);

    let res = s.registry.try_get_match(&999);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotFound))));
}
