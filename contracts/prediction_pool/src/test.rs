#![cfg(test)]
#![allow(dead_code)]
extern crate std;

use soroban_sdk::{testutils::Address as _, token, Address, Env, Error as SdkError};

use crate::errors::Error;
use crate::state::{MarketResult, Outcome, Winner};
use crate::{PredictionPool, PredictionPoolClient};
use escrow_vault::{EscrowVault, EscrowVaultClient};

/// 1 USDC = 10_000_000 stroops.
const USDC: i128 = 10_000_000;

/// SDK 26 error for *void* try_fn: `Err(Ok(sdk_error))`.
fn void_err(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}
/// SDK 26 error for *value-returning* try_fn: `Ok(Err(sdk_error))`.
fn val_err(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}

struct Setup<'a> {
    env: Env,
    pool: PredictionPoolClient<'a>,
    escrow: EscrowVaultClient<'a>,
    usdc: token::Client<'a>,
    usdc_admin: token::StellarAssetClient<'a>,
    oracle: Address,
    settlement: Address,
    treasury: Address,
    player_a: Address,
    player_b: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let usdc = token::Client::new(env, &sac.address());
    let usdc_admin = token::StellarAssetClient::new(env, &sac.address());

    let escrow_id = env.register(EscrowVault, ());
    let escrow = EscrowVaultClient::new(env, &escrow_id);

    let pool_id = env.register(PredictionPool, ());
    let pool = PredictionPoolClient::new(env, &pool_id);

    let oracle = Address::generate(env);
    let settlement = Address::generate(env);
    let registry = Address::generate(env);
    let treasury = Address::generate(env);
    let player_a = Address::generate(env);
    let player_b = Address::generate(env);

    escrow.initialize(&sac.address(), &settlement, &registry, &pool_id, &treasury);
    pool.initialize(
        &sac.address(),
        &oracle,
        &settlement,
        &registry,
        &escrow_id,
        &treasury,
    );

    Setup {
        env: env.clone(),
        pool,
        escrow,
        usdc,
        usdc_admin,
        oracle,
        settlement,
        treasury,
        player_a,
        player_b,
    }
}

fn open_market(s: &Setup) {
    s.pool.open_market(&1, &s.player_a, &s.player_b);
}

// ------------------------------------------------------------------
// Initialization
// ------------------------------------------------------------------

#[test]
fn initialize_only_once() {
    let env = Env::default();
    let s = setup(&env);
    let dummy = Address::generate(&env);
    let res = s.pool.try_initialize(
        &s.usdc.address,
        &s.oracle,
        &s.settlement,
        &dummy,
        &s.escrow.address,
        &s.treasury,
    );
    // void fn → Err(Ok(sdk_error))
    assert_eq!(res, Err(Ok(void_err(Error::AlreadyInitialized))));
}

// ------------------------------------------------------------------
// Market lifecycle
// ------------------------------------------------------------------

#[test]
fn open_market_creates_empty_market() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let market = s.pool.get_market(&1);
    assert_eq!(market.match_id, 1);
    assert_eq!(market.pool_a, 0);
    assert_eq!(market.pool_b, 0);
    assert_eq!(market.pool_draw, 0);
    assert_eq!(market.total_volume, 0);
    assert!(!market.locked);
    assert!(!market.settled);
    assert_eq!(market.result, MarketResult::Pending);
}

#[test]
fn open_market_double_open_rejected() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);
    let res = s.pool.try_open_market(&1, &s.player_a, &s.player_b);
    assert_eq!(res, Err(Ok(void_err(Error::MarketExists))));
}

// ------------------------------------------------------------------
// buy_outcome
// ------------------------------------------------------------------

#[test]
fn buy_outcome_updates_pools_and_records_position() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let trader_a = Address::generate(&env);
    let trader_b = Address::generate(&env);
    s.usdc_admin.mint(&trader_a, &(100 * USDC));
    s.usdc_admin.mint(&trader_b, &(300 * USDC));

    s.pool
        .buy_outcome(&1, &trader_a, &Outcome::PlayerA, &(100 * USDC));
    s.pool
        .buy_outcome(&1, &trader_b, &Outcome::PlayerB, &(300 * USDC));

    let market = s.pool.get_market(&1);
    assert_eq!(market.pool_a, 100 * USDC);
    assert_eq!(market.pool_b, 300 * USDC);
    assert_eq!(market.pool_draw, 0);
    assert_eq!(market.total_volume, 400 * USDC);

    assert_eq!(
        s.pool.get_position(&1, &trader_a, &Outcome::PlayerA),
        100 * USDC
    );
    assert_eq!(
        s.pool.get_position(&1, &trader_b, &Outcome::PlayerB),
        300 * USDC
    );

    assert_eq!(s.usdc.balance(&s.pool.address), 400 * USDC);
    assert_eq!(s.usdc.balance(&trader_a), 0);
    assert_eq!(s.usdc.balance(&trader_b), 0);
}

#[test]
fn buy_outcome_accumulates_positions() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &(200 * USDC));

    s.pool
        .buy_outcome(&1, &trader, &Outcome::PlayerA, &(100 * USDC));
    s.pool
        .buy_outcome(&1, &trader, &Outcome::PlayerA, &(100 * USDC));

    assert_eq!(
        s.pool.get_position(&1, &trader, &Outcome::PlayerA),
        200 * USDC
    );
    assert_eq!(s.pool.get_market(&1).pool_a, 200 * USDC);
}

#[test]
fn buy_outcome_rejected_when_locked() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);
    s.pool.lock_market(&1, &300);

    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &USDC);
    let res = s
        .pool
        .try_buy_outcome(&1, &trader, &Outcome::PlayerA, &USDC);
    assert_eq!(res, Err(Ok(void_err(Error::MarketIsLocked))));
}

#[test]
fn buy_outcome_rejected_when_settled() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    // settle with zero volume
    s.usdc_admin.mint(&s.escrow.address, &(1000 * USDC));
    s.escrow.record_deposit(&1, &s.player_a, &(500 * USDC));
    s.escrow.record_deposit(&1, &s.player_b, &(500 * USDC));
    s.pool.settle(&1, &Winner::PlayerA);

    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &USDC);
    let res = s
        .pool
        .try_buy_outcome(&1, &trader, &Outcome::PlayerA, &USDC);
    assert_eq!(res, Err(Ok(void_err(Error::AlreadySettled))));
}

#[test]
fn buy_outcome_rejected_below_minimum() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &(9_999_999i128));
    let res = s
        .pool
        .try_buy_outcome(&1, &trader, &Outcome::PlayerA, &(9_999_999i128));
    assert_eq!(res, Err(Ok(void_err(Error::BetTooSmall))));
}

// ------------------------------------------------------------------
// lock_market
// ------------------------------------------------------------------

#[test]
fn lock_market_is_one_way() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    s.pool.lock_market(&1, &300);
    assert!(s.pool.get_market(&1).locked);

    // Second lock call is silently ignored (idempotent)
    s.pool.lock_market(&1, &999);
    assert_eq!(s.pool.get_market(&1).lock_eval_score, Some(300));
}

// ------------------------------------------------------------------
// get_odds
// ------------------------------------------------------------------

#[test]
fn get_odds_returns_zero_when_no_bets() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);
    let (a, b, d) = s.pool.get_odds(&1);
    assert_eq!((a, b, d), (0, 0, 0));
}

#[test]
fn get_odds_matches_spec_example() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    // Spec §9 example: poolA=800, poolB=300, poolDraw=100
    let ta = Address::generate(&env);
    let tb = Address::generate(&env);
    let td = Address::generate(&env);
    s.usdc_admin.mint(&ta, &(800 * USDC));
    s.usdc_admin.mint(&tb, &(300 * USDC));
    s.usdc_admin.mint(&td, &(100 * USDC));

    s.pool
        .buy_outcome(&1, &ta, &Outcome::PlayerA, &(800 * USDC));
    s.pool
        .buy_outcome(&1, &tb, &Outcome::PlayerB, &(300 * USDC));
    s.pool.buy_outcome(&1, &td, &Outcome::Draw, &(100 * USDC));

    let (odds_a, odds_b, odds_d) = s.pool.get_odds(&1);
    // total=1200, net=1164; oddsA=1164*100/800=145, oddsB=388, oddsD=1164
    assert_eq!(odds_a, 145);
    assert_eq!(odds_b, 388);
    assert_eq!(odds_d, 1164);
}

// ------------------------------------------------------------------
// settle
// ------------------------------------------------------------------

#[test]
fn settle_distributes_fees_and_records_result() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let ta = Address::generate(&env);
    let tb = Address::generate(&env);
    let td = Address::generate(&env);
    s.usdc_admin.mint(&ta, &(800 * USDC));
    s.usdc_admin.mint(&tb, &(300 * USDC));
    s.usdc_admin.mint(&td, &(100 * USDC));
    s.pool
        .buy_outcome(&1, &ta, &Outcome::PlayerA, &(800 * USDC));
    s.pool
        .buy_outcome(&1, &tb, &Outcome::PlayerB, &(300 * USDC));
    s.pool.buy_outcome(&1, &td, &Outcome::Draw, &(100 * USDC));

    s.usdc_admin.mint(&s.escrow.address, &(1000 * USDC));
    s.escrow.record_deposit(&1, &s.player_a, &(500 * USDC));
    s.escrow.record_deposit(&1, &s.player_b, &(500 * USDC));

    let (net_pool, winning_pool) = s.pool.settle(&1, &Winner::PlayerA);

    // total=1200, 1%=12, 2%=24, net=1164
    assert_eq!(net_pool, 1164 * USDC);
    assert_eq!(winning_pool, 800 * USDC);

    let market = s.pool.get_market(&1);
    assert!(market.settled);
    assert_eq!(market.result, MarketResult::PlayerA);

    assert_eq!(s.usdc.balance(&s.treasury), 12 * USDC);
    assert_eq!(s.escrow.get_record(&1).bonus, 24 * USDC);
}

#[test]
fn settle_rejects_double_settle() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    s.usdc_admin.mint(&s.escrow.address, &(1000 * USDC));
    s.escrow.record_deposit(&1, &s.player_a, &(500 * USDC));
    s.escrow.record_deposit(&1, &s.player_b, &(500 * USDC));
    s.pool.settle(&1, &Winner::PlayerA);

    let res = s.pool.try_settle(&1, &Winner::PlayerA);
    assert_eq!(res, Err(Ok(void_err(Error::AlreadySettled))));
}

// ------------------------------------------------------------------
// pay_trader
// ------------------------------------------------------------------

#[test]
fn pay_trader_pays_proportional_share() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &(100 * USDC));
    s.pool
        .buy_outcome(&1, &trader, &Outcome::PlayerA, &(100 * USDC));

    s.usdc_admin.mint(&s.escrow.address, &(1000 * USDC));
    s.escrow.record_deposit(&1, &s.player_a, &(500 * USDC));
    s.escrow.record_deposit(&1, &s.player_b, &(500 * USDC));
    s.pool.settle(&1, &Winner::PlayerA);

    // pool_a=100, net=97, payout = 100*97/100 = 97
    let payout = s.pool.pay_trader(&1, &trader, &Outcome::PlayerA);
    assert_eq!(payout, 97 * USDC);
    assert_eq!(s.usdc.balance(&trader), 97 * USDC);

    // Position cleared — second claim returns 0
    assert_eq!(s.pool.pay_trader(&1, &trader, &Outcome::PlayerA), 0);
}

#[test]
fn pay_trader_rejected_for_losing_outcome() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &(100 * USDC));
    s.pool
        .buy_outcome(&1, &trader, &Outcome::PlayerB, &(100 * USDC));

    s.usdc_admin.mint(&s.escrow.address, &(1000 * USDC));
    s.escrow.record_deposit(&1, &s.player_a, &(500 * USDC));
    s.escrow.record_deposit(&1, &s.player_b, &(500 * USDC));
    s.pool.settle(&1, &Winner::PlayerA);

    let res = s.pool.try_pay_trader(&1, &trader, &Outcome::PlayerB);
    assert_eq!(res, Err(Ok(void_err(Error::NotWinningOutcome))));
}

#[test]
fn pay_trader_rejected_before_settle() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    let trader = Address::generate(&env);
    let res = s.pool.try_pay_trader(&1, &trader, &Outcome::PlayerA);
    assert_eq!(res, Err(Ok(void_err(Error::NotSettled))));
}

#[test]
fn no_bets_on_winning_outcome_sweeps_net_to_treasury() {
    let env = Env::default();
    let s = setup(&env);
    open_market(&s);

    // Only bets on PlayerB — nobody bet on PlayerA
    let trader = Address::generate(&env);
    s.usdc_admin.mint(&trader, &(100 * USDC));
    s.pool
        .buy_outcome(&1, &trader, &Outcome::PlayerB, &(100 * USDC));

    s.usdc_admin.mint(&s.escrow.address, &(1000 * USDC));
    s.escrow.record_deposit(&1, &s.player_a, &(500 * USDC));
    s.escrow.record_deposit(&1, &s.player_b, &(500 * USDC));

    let (net_pool, winning_pool) = s.pool.settle(&1, &Winner::PlayerA);
    assert_eq!(winning_pool, 0);

    // net_pool swept to treasury + 1% fee
    // treasury gets 1% of 100 (=1 USDC) + net_pool (97 USDC)
    assert_eq!(s.usdc.balance(&s.treasury), USDC + net_pool);
}
