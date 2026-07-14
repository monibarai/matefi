-- relayer/src/db/migrations/001_init.sql
-- MateFi off-chain cache schema (README section 12).

CREATE TABLE games (
  match_id        TEXT PRIMARY KEY,
  player_a        TEXT NOT NULL,
  player_b        TEXT,
  player_a_color  TEXT NOT NULL DEFAULT 'white',
  bet_amount      BIGINT NOT NULL,
  time_control    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- open | active | locked | completed | cancelled
  winner          TEXT,                           -- PlayerA | PlayerB | Draw | NULL
  pgn             TEXT,
  current_fen     TEXT DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE TABLE moves (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES games(match_id),
  move_number     INTEGER NOT NULL,
  move_uci        TEXT NOT NULL,
  fen             TEXT NOT NULL,
  player          TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE evaluations (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES games(match_id),
  move_number     INTEGER NOT NULL,
  fen             TEXT NOT NULL,
  depth           INTEGER NOT NULL,
  score           INTEGER NOT NULL,    -- centipawns
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE traders (
  id              SERIAL PRIMARY KEY,
  match_id        TEXT NOT NULL REFERENCES games(match_id),
  trader_address  TEXT NOT NULL,
  outcome         TEXT NOT NULL,       -- PlayerA | PlayerB | Draw
  amount_stroops  BIGINT NOT NULL,
  tx_hash         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settlements (
  match_id        TEXT PRIMARY KEY REFERENCES games(match_id),
  winner          TEXT NOT NULL,
  player_prize    BIGINT,
  trading_net     BIGINT,
  protocol_fee    BIGINT,
  flywheel_bonus  BIGINT,
  tx_hash         TEXT,
  settled_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_moves_match ON moves(match_id, move_number);
CREATE INDEX idx_evals_match ON evaluations(match_id, move_number);
CREATE INDEX idx_traders_match ON traders(match_id);
