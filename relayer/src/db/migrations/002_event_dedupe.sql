-- 002_event_dedupe.sql — make on-chain event ingestion idempotent.
--
-- The event listener polls Soroban RPC and, on startup, re-scans a lookback
-- window so settlements/bets emitted while the relayer was down are not missed.
-- That means any handler may see the same event more than once, so ingestion
-- must be replay-safe. `games`/`settlements` writes already are (ON CONFLICT);
-- `traders` was a plain INSERT and accumulated duplicates. This migration
-- cleans those up and adds a natural-key uniqueness guard.

-- 1. Collapse duplicate trade rows accumulated before dedupe existed.
--    (a) Drop tx-less rows that have since been re-ingested WITH a tx hash
--        (the on-chain version is authoritative).
DELETE FROM traders t
WHERE t.tx_hash IS NULL
  AND EXISTS (
    SELECT 1 FROM traders t2
    WHERE t2.match_id       = t.match_id
      AND t2.trader_address = t.trader_address
      AND t2.outcome        = t.outcome
      AND t2.amount_stroops = t.amount_stroops
      AND t2.tx_hash IS NOT NULL
  );

--    (b) Collapse remaining exact duplicates (same bet, same tx), keeping the
--        earliest row.
DELETE FROM traders t
USING traders d
WHERE t.match_id              = d.match_id
  AND t.trader_address        = d.trader_address
  AND t.outcome               = d.outcome
  AND t.amount_stroops        = d.amount_stroops
  AND COALESCE(t.tx_hash, '') = COALESCE(d.tx_hash, '')
  AND t.id > d.id;

-- 2. Enforce idempotency going forward: at most one row per on-chain bet,
--    keyed by its transaction hash. Partial index so legacy/dev rows with a
--    NULL tx_hash are unconstrained (and never collide).
CREATE UNIQUE INDEX IF NOT EXISTS idx_traders_onchain
  ON traders (match_id, trader_address, outcome, amount_stroops, tx_hash)
  WHERE tx_hash IS NOT NULL;

-- 3. Repair games wrongly flipped back to 'active' by a replayed MatchActive
--    event: a row with a recorded winner has already finished.
UPDATE games SET status = 'completed'
WHERE status = 'active' AND winner IS NOT NULL;
