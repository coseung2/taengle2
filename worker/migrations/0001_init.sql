PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE api_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE watches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  sport_key TEXT NOT NULL,
  league TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  kickoff_utc TEXT NOT NULL,
  betman_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  refresh_from TEXT NOT NULL,
  refresh_until TEXT NOT NULL,
  last_fetched_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, market_id)
);

CREATE INDEX watches_due_idx ON watches(enabled, refresh_from, refresh_until);
CREATE INDEX watches_user_idx ON watches(user_id);

CREATE TABLE watch_snapshots (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  fetched_at TEXT NOT NULL,
  market_json TEXT NOT NULL,
  cut_json TEXT NOT NULL
);

CREATE INDEX watch_snapshots_watch_idx ON watch_snapshots(watch_id, fetched_at DESC);
