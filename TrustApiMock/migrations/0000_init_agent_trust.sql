-- Trust API Mock: agent trust scores for example agents (ids 1-10)
CREATE TABLE IF NOT EXISTS agent_trust (
  agent_id TEXT PRIMARY KEY,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  signals TEXT,
  updated_at INTEGER NOT NULL
);

-- Seed default scores for example agents 1-10 (score 75)
INSERT OR IGNORE INTO agent_trust (agent_id, score, signals, updated_at)
VALUES
  ('1', 75, NULL, unixepoch()),
  ('2', 75, NULL, unixepoch()),
  ('3', 75, NULL, unixepoch()),
  ('4', 75, NULL, unixepoch()),
  ('5', 75, NULL, unixepoch()),
  ('6', 75, NULL, unixepoch()),
  ('7', 75, NULL, unixepoch()),
  ('8', 75, NULL, unixepoch()),
  ('9', 75, NULL, unixepoch()),
  ('10', 75, NULL, unixepoch());
