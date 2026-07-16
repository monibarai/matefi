#![cfg(test)]
#![allow(dead_code)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Bytes, Env, Error as SdkError,
};

use crate::errors::Error;
use crate::state::{DisputeOutcome, Winner};
use crate::{Settlement, SettlementClient, DEFAULT_CHALLENGE_WINDOW_SECS};
use escrow_vault::{EscrowVault, EscrowVaultClient};
use match_registry::state::MatchState;
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
    arbiter: Address,
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
    let arbiter = Address::generate(env);
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
        &arbiter,
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
        arbiter,
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

/// Advance the ledger past the challenge window.
fn advance_past_window(s: &Setup) {
    s.env.ledger().with_mut(|li| {
        li.timestamp += DEFAULT_CHALLENGE_WINDOW_SECS + 1;
    });
}

/// Submit a result and finalize it in one step (the common case in tests
/// that only care about the payout, not the dispute window itself).
fn submit_and_finalize(s: &Setup, match_id: u64, winner: Winner) {
    s.settlement.submit_result(&match_id, &winner);
    advance_past_window(s);
    s.settlement.finalize(&match_id);
}

#[test]
fn initialize_only_once() {
    let env = Env::default();
    let s = setup(&env);
    let dummy = Address::generate(&env);
    let res = s
        .settlement
        .try_initialize(&dummy, &dummy, &dummy, &dummy, &dummy, &dummy, &dummy);
    assert_eq!(res, Err(Ok(void_err(Error::AlreadyInitialized))));
}

#[test]
fn submit_result_parks_match_pending_finalization() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::PendingFinalization);
    // No funds moved yet.
    assert_eq!(s.usdc.balance(&s.player_a), 0);
    assert_eq!(s.usdc.balance(&s.escrow.address), 200 * USDC);

    let pending = s.settlement.get_pending_result(&1).unwrap();
    assert_eq!(pending.winner, Winner::PlayerA);
}

#[test]
fn finalize_before_window_elapses_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    let res = s.settlement.try_finalize(&1);
    assert_eq!(res, Err(Ok(void_err(Error::DisputeWindowNotElapsed))));
}

#[test]
fn finalize_without_pending_result_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    let res = s.settlement.try_finalize(&1);
    assert_eq!(res, Err(Ok(void_err(Error::NoPendingResult))));
}

#[test]
fn finalize_player_a_wins_no_trading() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    submit_and_finalize(&s, 1, Winner::PlayerA);

    // player_prize = (500+500)*0.97 = 970 USDC
    let player_prize = 970 * USDC;
    let protocol_fee = (1000 * USDC) - player_prize; // 30 USDC

    assert_eq!(s.usdc.balance(&s.player_a), player_prize);
    assert_eq!(s.usdc.balance(&s.treasury), protocol_fee);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::Completed);
    assert!(s.settlement.get_pending_result(&1).is_none());
}

#[test]
fn finalize_player_b_wins_no_trading() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    submit_and_finalize(&s, 1, Winner::PlayerB);

    let player_prize = 970 * USDC;
    assert_eq!(s.usdc.balance(&s.player_b), player_prize);
    assert_eq!(s.usdc.balance(&s.player_a), 0);
    assert_eq!(s.usdc.balance(&s.treasury), 30 * USDC);
}

#[test]
fn finalize_draw_refunds_both_players() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    submit_and_finalize(&s, 1, Winner::Draw);

    assert_eq!(s.usdc.balance(&s.player_a), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.player_b), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);
    assert_eq!(s.usdc.balance(&s.treasury), 0);
}

#[test]
fn finalize_with_trading_flywheel_bonus() {
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

    submit_and_finalize(&s, 1, Winner::PlayerA);

    // trading_volume = 1200 USDC
    // fee_treasury (1%) = 12 USDC
    // fee_flywheel (2%) = 24 USDC
    // player_pool = 1000 + 24 = 1024 USDC
    // player_prize = 1024 * 97% = 993.28 USDC = 9_932_800_000
    let player_prize: i128 = 9_932_800_000;
    let player_fee: i128 = 307_200_000; // 30.72 USDC
    let trading_treasury: i128 = 120_000_000; // 12 USDC

    assert_eq!(s.usdc.balance(&s.player_a), player_prize);
    assert_eq!(s.usdc.balance(&s.treasury), trading_treasury + player_fee);
    assert_eq!(s.usdc.balance(&s.escrow.address), 0);

    let net_pool: i128 = 1164 * USDC;
    let payout_a = s
        .pool
        .pay_trader(&1, &trader_a, &prediction_pool::state::Outcome::PlayerA);
    assert_eq!(payout_a, net_pool);
    assert_eq!(s.usdc.balance(&trader_a), net_pool);

    let res_b = s
        .pool
        .try_pay_trader(&1, &trader_b, &prediction_pool::state::Outcome::PlayerB);
    assert!(res_b.is_err());
}

#[test]
fn submit_result_rejected_when_match_not_active() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    submit_and_finalize(&s, 1, Winner::PlayerA);

    // Second submission on now-Completed match must fail.
    let res = s.settlement.try_submit_result(&1, &Winner::PlayerA);
    assert_eq!(res, Err(Ok(void_err(Error::MatchNotActive))));
}

#[test]
fn full_e2e_via_oracle_flow() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 200 * USDC, 1);

    // Relayer posts result through oracle (which calls settlement.submit_result)
    s.oracle
        .post_result(&1, &oracle_gateway::state::Winner::PlayerA);

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::PendingFinalization);

    advance_past_window(&s);
    s.settlement.finalize(&1);

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::Completed);

    let player_prize = 200 * 2 * USDC * 97 / 100; // 388 USDC
    assert_eq!(s.usdc.balance(&s.player_a), player_prize);
}

#[test]
fn draw_with_trading_sends_flywheel_bonus_to_treasury() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    let trader = Address::generate(&s.env);
    s.usdc_admin.mint(&trader, &(100 * USDC));
    s.pool.buy_outcome(
        &1,
        &trader,
        &prediction_pool::state::Outcome::Draw,
        &(100 * USDC),
    );

    submit_and_finalize(&s, 1, Winner::Draw);

    assert_eq!(s.usdc.balance(&s.player_a), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.player_b), 500 * USDC);

    let payout = s
        .pool
        .pay_trader(&1, &trader, &prediction_pool::state::Outcome::Draw);
    assert_eq!(payout, 97 * USDC);

    assert_eq!(s.usdc.balance(&s.treasury), 3 * USDC);
}

// --- Dispute flow ---

#[test]
fn dispute_by_player_moves_match_to_disputed() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement.dispute(
        &1,
        &s.player_b,
        &Bytes::from_slice(&env, b"engine-assist suspected"),
    );

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::Disputed);

    let d = s.settlement.get_dispute(&1).unwrap();
    assert_eq!(d.opened_by, s.player_b);

    // No funds moved.
    assert_eq!(s.usdc.balance(&s.player_a), 0);
}

#[test]
fn dispute_after_window_closed_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    advance_past_window(&s);

    let res = s
        .settlement
        .try_dispute(&1, &s.player_b, &Bytes::from_slice(&env, b"too slow"));
    assert_eq!(res, Err(Ok(void_err(Error::DisputeWindowClosed))));
}

#[test]
fn dispute_by_non_party_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    let stranger = Address::generate(&env);
    let res = s
        .settlement
        .try_dispute(&1, &stranger, &Bytes::from_slice(&env, b"reason"));
    assert_eq!(res, Err(Ok(void_err(Error::NotAParty))));
}

#[test]
fn dispute_twice_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.player_b, &Bytes::from_slice(&env, b"first"));

    let res = s
        .settlement
        .try_dispute(&1, &s.player_a, &Bytes::from_slice(&env, b"second"));
    assert_eq!(res, Err(Ok(void_err(Error::NoPendingResult))));
}

#[test]
fn finalize_disputed_match_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.player_b, &Bytes::from_slice(&env, b"reason"));
    advance_past_window(&s);

    let res = s.settlement.try_finalize(&1);
    assert_eq!(res, Err(Ok(void_err(Error::NoPendingResult))));
}

#[test]
fn resolve_dispute_uphold_pays_original_winner() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.player_b, &Bytes::from_slice(&env, b"reason"));
    s.settlement
        .resolve_dispute(&1, &s.arbiter, &DisputeOutcome::Uphold);

    assert_eq!(s.usdc.balance(&s.player_a), 970 * USDC);
    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::Completed);
}

#[test]
fn resolve_dispute_reverse_pays_new_winner() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.player_b, &Bytes::from_slice(&env, b"reason"));
    s.settlement
        .resolve_dispute(&1, &s.arbiter, &DisputeOutcome::Reverse(Winner::PlayerB));

    assert_eq!(s.usdc.balance(&s.player_a), 0);
    assert_eq!(s.usdc.balance(&s.player_b), 970 * USDC);
}

#[test]
fn resolve_dispute_void_refunds_both_players() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 500 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.player_a, &Bytes::from_slice(&env, b"reason"));
    s.settlement
        .resolve_dispute(&1, &s.arbiter, &DisputeOutcome::Void);

    assert_eq!(s.usdc.balance(&s.player_a), 500 * USDC);
    assert_eq!(s.usdc.balance(&s.player_b), 500 * USDC);
}

#[test]
fn resolve_dispute_by_non_arbiter_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.player_b, &Bytes::from_slice(&env, b"reason"));

    let res = s
        .settlement
        .try_resolve_dispute(&1, &s.player_b, &DisputeOutcome::Uphold);
    assert_eq!(res, Err(Ok(void_err(Error::Unauthorized))));
}

#[test]
fn resolve_dispute_without_dispute_fails() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);

    let res = s
        .settlement
        .try_resolve_dispute(&1, &s.arbiter, &DisputeOutcome::Uphold);
    assert_eq!(res, Err(Ok(void_err(Error::NotDisputed))));
}

#[test]
fn arbiter_may_open_dispute_directly() {
    let env = Env::default();
    let s = setup(&env);
    create_active_match(&s, 100 * USDC, 1);

    s.settlement.submit_result(&1, &Winner::PlayerA);
    s.settlement
        .dispute(&1, &s.arbiter, &Bytes::from_slice(&env, b"anti-cheat flag"));

    let m = s.registry.get_match(&1);
    assert_eq!(m.state, MatchState::Disputed);
}

#[test]
fn set_challenge_window_by_arbiter() {
    let env = Env::default();
    let s = setup(&env);

    s.settlement.set_challenge_window(&s.arbiter, &7200);
    assert_eq!(s.settlement.get_challenge_window(), 7200);
}

#[test]
fn set_challenge_window_by_non_arbiter_fails() {
    let env = Env::default();
    let s = setup(&env);

    let res = s.settlement.try_set_challenge_window(&s.player_a, &7200);
    assert_eq!(res, Err(Ok(void_err(Error::Unauthorized))));
}
