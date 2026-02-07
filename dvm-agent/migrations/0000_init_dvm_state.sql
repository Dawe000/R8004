CREATE TABLE IF NOT EXISTS processed_assertions (
  assertion_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dvm_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
