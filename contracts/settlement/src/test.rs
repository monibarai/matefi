#![cfg(test)]
extern crate std;

use soroban_sdk::{testutils::Address as _, token, Address, Env, Error as SdkError};

use crate::errors::Error;
use crate::state::Winner;
use crate::{Settlement, SettlementClient};
use escrow_vault::{EscrowVault, EscrowVaultClient};
use match_registry::{MatchRegistry, MatchRegistryClient};
use oracle_gateway::{OracleGateway, OracleGatewayClient};
use prediction_pool::{PredictionPool, PredictionPoolClient};

/// 1 USDC = 10_000_000 stroops.
const USDC: i128 = 10_000_000;

/// void try_fn → Err(Ok(sdk_error))
fn void_err(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}

struct Setup<'a> {
    env: Env,
    settlement: SettlementClient<'a>,
    registry: MatchRegistryClient<'a>,
    pool: PredictionPoolClient<'a>,
    escrow: EscrowVaultClient<'a>,
    oracle: OracleGatewayClient<'a>,
    usdc: token::Client<'a>,
    usdc_admin: token::StellarAssetClient<'a>,
    relayer: Address,
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

    let registry_id = env.register(MatchRegistry, ());
    let registry = MatchRegistryClient::new(env, &registry_id);

    let escrow_id = env.register(EscrowVault, ());
    let escrow = EscrowVaultClient::new(env, &escrow_id);

    let pool_id = env.register(PredictionPool, ());
    let pool = PredictionPoolClient::new(env, &pool_id);

    let oracle_id = env.register(OracleGateway, ());
    let oracle = OracleGatewayClient::new(env, &oracle_id);

    let settlement_id = env.register(Settlement, ());
    let settlement = SettlementClient::new(env, &settlement_id);

    let relayer = Address::generate(env);
    let treasury = Address::generate(env);
    let player_a = Address::generate(env);
    let player_b = Address::generate(env);

    // Wire all contracts together
    escrow.initialize(
        &sac.address(),
        &settlement_id,
        &registry_id,
        &pool_id,
        &treasury,
    );
    pool.initialize(
        &sac.address(),
        &oracle_id,
        &settlement_id,
        &registry_id,
        &escrow_id,
        &treasury,
    );
    oracle.initialize(&relayer, &pool_id, &settlement_id);
    registry.initialize(&sac.address(), &escrow_id, &pool_id, &settlement_id);
    settlement.initialize(
        &sac.address(),
        &escrow_id,
        &pool_id,
        &registry_id,
        &oracle_id,
        &treasury,
    );

    Setup {
        env: env.clone(),
        settlement,
        registry,
        pool,
        escrow,
        oracle,
        usdc,
        usdc_admin,
        relayer,
        treasury,
        player_a,
        player_b,
    }
}

/// Create a fully active match with a prediction market open.
fn create_active_match(s: &Setup, bet_each: i128, match_id: u64) {
    s.usdc_admin.mint(&s.player_a, &bet_each);
    s.usdc_admin.mint(&s.player_b, &bet_each);
    s.registry.create_match(&s.player_a, &bet_each, &600);
    s.registry.join_match(&match_id, &s.player_b);
}

#[test]
fn initialize_only_once() {
    let env = Env::default();
    let s = setup(&env);
    let dummy = Address::generate(&env);
    let res = s
        .settlement
        .try_initialize(&dummy, &dummy, &dummy, &dummy, &dummy, &dummy);
    assert_eq!(res, Err(Ok(void_err(Error::AlreadyInitialized))));
}

#[test]
fn execute_player_a_wins_no_trading() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    // No traders — pure player prize pool
    s.settlement.execute(&1, &Winner::PlayerA);

    // player_prize = (500+500)*0.97 = 970 USDC
    let player_prize = 970 * USDC;
    let protocol_fee = (1000 * USDC) - player_prize; // 30 USDC

    assert_eq!(s.usdc.balance(&s.player_a), player_prize);
    assert_eq!(s.usdc.balance(&s.treasury), protocol_fee);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);
}

#[test]
fn execute_player_b_wins_no_trading() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    s.settlement.execute(&1, &Winner::PlayerB);

    let player_prize = 970 * USDC;
    assert_eq!(s.usdc.balance(&s.player_b), player_prize);
    assert_eq!(s.usdc.balance(&s.player_a), 0);
    assert_eq!(s.usdc.balance(&s.treasury), 30 * USDC);
}

#[test]
fn execute_draw_refunds_both_players() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    s.settlement.execute(&1, &Winner::Draw);

    // Both get 500 USDC back, no protocol fee on draw player pool
    assert_eq!(s.usdc.balance(&s.player_a), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.player_b), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);
    // treasury gets 0 on draw (no flywheel bonus since trading volume = 0)
    assert_eq!(s.usdc.balance(&s.treasury), 0);
}

#[test]
fn execute_with_trading_flywheel_bonus() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    // 1200 USDC trading: 800 on A, 300 on B, 100 on Draw
    let trader_a = Address::generate(&s.env);
    let trader_b = Address::generate(&s.env);
    let trader_d = Address::generate(&s.env);
    s.usdc_admin.mint(&trader_a, &(800 * USDC));
    s.usdc_admin.mint(&trader_b, &(300 * USDC));
    s.usdc_admin.mint(&trader_d, &(100 * USDC));

    s.pool.buy_outcome(
        &1,
        &trader_a,
        &prediction_pool::state::Outcome::PlayerA,
        &(800 * USDC),
    );
    s.pool.buy_outcome(
        &1,
        &trader_b,
        &prediction_pool::state::Outcome::PlayerB,
        &(300 * USDC),
    );
    s.pool.buy_outcome(
        &1,
        &trader_d,
        &prediction_pool::state::Outcome::Draw,
        &(100 * USDC),
    );

    s.settlement.execute(&1, &Winner::PlayerA);

    // trading_volume = 1200 USDC
    // fee_treasury (1%) = 12 USDC
    // fee_flywheel (2%) = 24 USDC
    // player_pool = 1000 + 24 = 1024 USDC
    // player_prize = 1024 * 97% = 993.28 USDC = 9_932_800_000
    let player_prize: i128 = 9_932_800_000;
    let player_fee: i128 = 307_200_000; // 30.72 USDC
    let trading_treasury: i128 = 120_000_000; // 12 USDC

    assert_eq!(s.usdc.balance(&s.player_a), player_prize);
    // Treasury receives: trading 1% + player pool 3%
    assert_eq!(s.usdc.balance(&s.treasury), trading_treasury + player_fee);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);

    // net trading pool = 1164 USDC; since PlayerA won, A-traders can claim
    let net_pool: i128 = 1164 * USDC;
    let payout_a = s
        .pool
        .pay_trader(&1, &trader_a, &prediction_pool::state::Outcome::PlayerA);
    // trader_a bet 800, pool_a=800, payout = 800*1164/800 = 1164
    assert_eq!(payout_a, net_pool);
    assert_eq!(s.usdc.balance(&trader_a), net_pool);

    // B and Draw traders get nothing
    let res_b = s
        .pool
        .try_pay_trader(&1, &trader_b, &prediction_pool::state::Outcome::PlayerB);
    assert!(res_b.is_err()); // NotWinningOutcome
}

#[test]
fn execute_marks_match_completed() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.execute(&1, &Winner::PlayerA);

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, match_registry::state::MatchState::Completed);
}

#[test]
fn execute_rejected_when_match_not_active() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    // First settlement OK
    s.settlement.execute(&1, &Winner::PlayerA);

    // Second settlement on same (now Completed) match must fail
    let res = s.settlement.try_execute(&1, &Winner::PlayerA);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotActive))));
}

#[test]
fn full_e2e_via_oracle_flow() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 200 * USDC, 1);

    // Relayer posts result through oracle (which calls settlement.execute)
    s.oracle
        .post_result(&1, &oracle_gateway::state::Winner::PlayerA);

    // Settlement completed via oracle → settlement chain
    let m = s.registry.get_match(&1);
    assert_eq!(m.state, match_registry::state::MatchState::Completed);

    let player_prize = 200 * 2 * USDC * 97 / 100; // 388 USDC
    assert_eq!(s.usdc.balance(&s.player_a), player_prize);
}

#[test]
fn execute_draw_with_trading_sends_flywheel_bonus_to_treasury() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    // Add some trading
    let trader = Address::generate(&s.env);
    s.usdc_admin.mint(&trader, &(100 * USDC));
    s.pool.buy_outcome(
        &1,
        &trader,
        &prediction_pool::state::Outcome::Draw,
        &(100 * USDC),
    );

    s.settlement.execute(&1, &Winner::Draw);

    // Players get deposits back
    assert_eq!(s.usdc.balance(&s.player_a), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.player_b), 500 * USDC);

    // Draw pool trader gets the full net pool (only one on Draw)
    let payout = s
        .pool
        .pay_trader(&1, &trader, &prediction_pool::state::Outcome::Draw);
    // net pool = 100 * 97% = 97 USDC; 1% to treasury
    assert_eq!(payout, 97 * USDC);

    // Treasury got: 1% of 100 USDC trading = 1 USDC + flywheel bonus (2 USDC) sent to treasury by vault
    // flywheel bonus on draw is sent to treasury by vault (documented edge case)
    assert_eq!(s.usdc.balance(&s.treasury), 3 * USDC); // 1% trading + 2% flywheel
}
