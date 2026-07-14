#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Bytes, Env, Error as SdkError,
};

use crate::errors::Error;
use crate::{
    OracleGateway, OracleGatewayClient, DEFAULT_EVAL_THRESHOLD, DEFAULT_LOCK_CONFIRMATIONS,
};
use escrow_vault::{EscrowVault, EscrowVaultClient};
use prediction_pool::{PredictionPool, PredictionPoolClient};

/// 1 USDC in stroops.
const USDC: i128 = 10_000_000;

/// void try_fn → Err(Ok(sdk_error))
fn void_err(e: Error) -> SdkError {
    SdkError::from_contract_error(e as u32)
}

fn dummy_fen(env: &Env) -> Bytes {
    Bytes::from_slice(
        env,
        b"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    )
}

/// Post the same score `n` times, each at its own ledger sequence — mirrors the
/// relayer posting an eval after every move. Used to drive the lock streak.
fn post_n(s: &Setup<'_>, match_id: u64, score: i32, n: u32) {
    let fen = dummy_fen(&s.env);
    for _ in 0..n {
        let seq = s.env.ledger().sequence();
        s.env.ledger().set_sequence_number(seq + 1);
        s.oracle.post_evaluation(&match_id, &fen, &18, &score);
    }
}

struct Setup<'a> {
    env: Env,
    oracle: OracleGatewayClient<'a>,
    pool: PredictionPoolClient<'a>,
    escrow: EscrowVaultClient<'a>,
    usdc_admin: token::StellarAssetClient<'a>,
    usdc: token::Client<'a>,
    relayer: Address,
    settlement: Address,
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

    let oracle_id = env.register(OracleGateway, ());
    let oracle = OracleGatewayClient::new(env, &oracle_id);

    let relayer = Address::generate(env);
    // settlement is a dummy address — we don't call settlement.execute in unit tests
    let settlement = Address::generate(env);
    let registry = Address::generate(env);
    let treasury = Address::generate(env);
    let player_a = Address::generate(env);
    let player_b = Address::generate(env);

    escrow.initialize(&sac.address(), &settlement, &registry, &pool_id, &treasury);
    pool.initialize(
        &sac.address(),
        &oracle_id,
        &settlement,
        &registry,
        &escrow_id,
        &treasury,
    );
    oracle.initialize(&relayer, &pool_id, &settlement);

    // Open a market so oracle can lock it
    pool.open_market(&1, &player_a, &player_b);

    Setup {
        env: env.clone(),
        oracle,
        pool,
        escrow,
        usdc_admin,
        usdc,
        relayer,
        settlement,
        player_a,
        player_b,
    }
}

#[test]
fn initialize_only_once() {
    let env = Env::default();
    let s = setup(&env);
    let dummy = Address::generate(&env);
    let res = s.oracle.try_initialize(&dummy, &dummy, &dummy);
    assert_eq!(res, Err(Ok(void_err(Error::AlreadyInitialized))));
}

#[test]
fn default_threshold_is_250() {
    let env = Env::default();
    let s = setup(&env);
    assert_eq!(s.oracle.get_threshold(), DEFAULT_EVAL_THRESHOLD);
}

#[test]
fn post_evaluation_stores_record_and_does_not_lock_below_threshold() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);
    s.oracle.post_evaluation(&1, &fen, &18, &100); // |100| < 250

    // Market should NOT be locked
    assert!(!s.pool.get_market(&1).locked);

    // Eval record stored at current ledger sequence
    let seq = env.ledger().sequence();
    let record = s.oracle.get_eval(&1, &seq);
    assert!(record.is_some());
    let rec = record.unwrap();
    assert_eq!(rec.score, 100);
    assert_eq!(rec.depth, 18);
}

#[test]
fn default_confirmations_is_3() {
    let env = Env::default();
    let s = setup(&env);
    assert_eq!(s.oracle.get_confirmations(), DEFAULT_LOCK_CONFIRMATIONS);
}

#[test]
fn single_decisive_eval_does_not_lock() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);
    // One move that crosses the threshold (e.g. a capture spike) must NOT lock —
    // a chess game is not decided by a single move.
    s.oracle.post_evaluation(&1, &fen, &18, &300);

    assert!(!s.pool.get_market(&1).locked);
}

#[test]
fn post_evaluation_locks_after_sustained_advantage() {
    let env = Env::default();
    let s = setup(&env);

    // Advantage held for the full confirmation window → locks.
    post_n(&s, 1, 250, DEFAULT_LOCK_CONFIRMATIONS); // exactly at threshold

    assert!(s.pool.get_market(&1).locked);
    assert_eq!(s.pool.get_market(&1).lock_eval_score, Some(250));
}

#[test]
fn post_evaluation_locks_for_sustained_black_advantage() {
    let env = Env::default();
    let s = setup(&env);

    post_n(&s, 1, -350, DEFAULT_LOCK_CONFIRMATIONS); // negative, |score| > 250

    assert!(s.pool.get_market(&1).locked);
    assert_eq!(s.pool.get_market(&1).lock_eval_score, Some(-350));
}

#[test]
fn transient_spike_then_recovery_keeps_market_open() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);
    // Spike from a capture, then the recapture brings the eval back to even —
    // the streak resets and the market stays open.
    post_n(&s, 1, 300, 2); // two decisive evals, still short of 3
    s.oracle.post_evaluation(&1, &fen, &18, &40); // advantage evaporated

    assert!(!s.pool.get_market(&1).locked);

    // A later isolated spike also must not lock on its own.
    s.oracle.post_evaluation(&1, &fen, &18, &320);
    assert!(!s.pool.get_market(&1).locked);
}

#[test]
fn alternating_side_advantages_do_not_lock() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);
    // Sharp position swinging between both sides never sustains one side.
    s.oracle.post_evaluation(&1, &fen, &18, &300);
    s.oracle.post_evaluation(&1, &fen, &18, &-300);
    s.oracle.post_evaluation(&1, &fen, &18, &300);
    s.oracle.post_evaluation(&1, &fen, &18, &-300);

    assert!(!s.pool.get_market(&1).locked);
}

#[test]
fn post_evaluation_mate_score_forces_lock() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);
    // Relayer encodes forced mate as ±9999 (spec §11) — terminal, locks at once.
    s.oracle.post_evaluation(&1, &fen, &18, &9999);

    assert!(s.pool.get_market(&1).locked);
}

#[test]
fn post_evaluation_lock_is_one_way() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);
    post_n(&s, 1, 300, DEFAULT_LOCK_CONFIRMATIONS); // sustained advantage locks at 300
                                                    // A subsequent eval below threshold doesn't unlock
    s.oracle.post_evaluation(&1, &fen, &18, &50);

    let market = s.pool.get_market(&1);
    assert!(market.locked);
    assert_eq!(market.lock_eval_score, Some(300)); // original lock score preserved
}

#[test]
fn set_confirmations_updates_for_relayer() {
    let env = Env::default();
    let s = setup(&env);

    s.oracle.set_confirmations(&s.relayer, &1);
    assert_eq!(s.oracle.get_confirmations(), 1);

    // With confirmations = 1, a single decisive eval locks immediately.
    let fen = dummy_fen(&env);
    s.oracle.post_evaluation(&1, &fen, &18, &300);
    assert!(s.pool.get_market(&1).locked);
}

#[test]
fn set_confirmations_rejected_for_non_relayer() {
    let env = Env::default();
    let s = setup(&env);

    let attacker = Address::generate(&env);
    let res = s.oracle.try_set_confirmations(&attacker, &2);
    assert_eq!(res, Err(Ok(void_err(Error::Unauthorized))));
}

#[test]
fn set_confirmations_rejected_for_zero() {
    let env = Env::default();
    let s = setup(&env);

    let res = s.oracle.try_set_confirmations(&s.relayer, &0);
    assert_eq!(res, Err(Ok(void_err(Error::InvalidThreshold))));
}

#[test]
fn set_threshold_updates_threshold_for_relayer() {
    let env = Env::default();
    let s = setup(&env);

    s.oracle.set_threshold(&s.relayer, &100);
    assert_eq!(s.oracle.get_threshold(), 100);
}

#[test]
fn set_threshold_rejected_for_non_relayer() {
    let env = Env::default();
    let s = setup(&env);

    let attacker = Address::generate(&env);
    let res = s.oracle.try_set_threshold(&attacker, &100);
    assert_eq!(res, Err(Ok(void_err(Error::Unauthorized))));
}

#[test]
fn set_threshold_rejected_for_zero_or_negative() {
    let env = Env::default();
    let s = setup(&env);

    let res = s.oracle.try_set_threshold(&s.relayer, &0);
    assert_eq!(res, Err(Ok(void_err(Error::InvalidThreshold))));

    let res2 = s.oracle.try_set_threshold(&s.relayer, &-1);
    assert_eq!(res2, Err(Ok(void_err(Error::InvalidThreshold))));
}

#[test]
fn multiple_evals_each_stored_at_own_ledger_sequence() {
    let env = Env::default();
    let s = setup(&env);

    let fen = dummy_fen(&env);

    let seq1 = env.ledger().sequence();
    s.oracle.post_evaluation(&1, &fen, &18, &50);

    env.ledger().set_sequence_number(seq1 + 1);
    let seq2 = env.ledger().sequence();
    s.oracle.post_evaluation(&1, &fen, &18, &-100);

    let rec1 = s.oracle.get_eval(&1, &seq1).unwrap();
    let rec2 = s.oracle.get_eval(&1, &seq2).unwrap();
    assert_eq!(rec1.score, 50);
    assert_eq!(rec2.score, -100);
}
