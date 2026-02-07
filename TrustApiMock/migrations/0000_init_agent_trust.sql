-- Trust API Mock: agent trust scores for example agents (ids 1-35)
CREATE TABLE IF NOT EXISTS agent_trust (
  agent_id TEXT PRIMARY KEY,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  signals TEXT,
  updated_at INTEGER NOT NULL
);

-- Seed randomized scores for example agents 1-35
INSERT OR IGNORE INTO agent_trust (agent_id, score, signals, updated_at)
VALUES
  ('1', 92, '{"tasksCompleted": 45, "disputes": 0}', unixepoch()),
  ('2', 88, '{"tasksCompleted": 38, "disputes": 1}', unixepoch()),
  ('3', 65, '{"tasksCompleted": 12, "disputes": 3}', unixepoch()),
  ('4', 78, '{"tasksCompleted": 22, "disputes": 2}', unixepoch()),
  ('5', 95, '{"tasksCompleted": 67, "disputes": 0}', unixepoch()),
  ('6', 70, '{"tasksCompleted": 15, "disputes": 2}', unixepoch()),
  ('7', 82, '{"tasksCompleted": 31, "disputes": 1}', unixepoch()),
  ('8', 58, '{"tasksCompleted": 8, "disputes": 5}', unixepoch()),
  ('9', 91, '{"tasksCompleted": 52, "disputes": 0}', unixepoch()),
  ('10', 76, '{"tasksCompleted": 19, "disputes": 1}', unixepoch()),
  ('11', 84, '{"tasksCompleted": 28, "disputes": 1}', unixepoch()),
  ('12', 73, '{"tasksCompleted": 17, "disputes": 2}', unixepoch()),
  ('13', 89, '{"tasksCompleted": 41, "disputes": 0}', unixepoch()),
  ('14', 67, '{"tasksCompleted": 14, "disputes": 3}', unixepoch()),
  ('15', 93, '{"tasksCompleted": 56, "disputes": 0}', unixepoch()),
  ('16', 79, '{"tasksCompleted": 24, "disputes": 1}', unixepoch()),
  ('17', 71, '{"tasksCompleted": 16, "disputes": 2}', unixepoch()),
  ('18', 86, '{"tasksCompleted": 33, "disputes": 1}', unixepoch()),
  ('19', 62, '{"tasksCompleted": 10, "disputes": 4}', unixepoch()),
  ('20', 90, '{"tasksCompleted": 48, "disputes": 0}', unixepoch()),
  ('21', 75, '{"tasksCompleted": 20, "disputes": 2}', unixepoch()),
  ('22', 81, '{"tasksCompleted": 27, "disputes": 1}', unixepoch()),
  ('23', 68, '{"tasksCompleted": 13, "disputes": 3}', unixepoch()),
  ('24', 94, '{"tasksCompleted": 61, "disputes": 0}', unixepoch()),
  ('25', 77, '{"tasksCompleted": 21, "disputes": 2}', unixepoch()),
  ('26', 83, '{"tasksCompleted": 29, "disputes": 1}', unixepoch()),
  ('27', 72, '{"tasksCompleted": 18, "disputes": 2}', unixepoch()),
  ('28', 87, '{"tasksCompleted": 36, "disputes": 1}', unixepoch()),
  ('29', 64, '{"tasksCompleted": 11, "disputes": 4}', unixepoch()),
  ('30', 85, '{"tasksCompleted": 32, "disputes": 1}', unixepoch()),
  ('31', 88, '{"tasksCompleted": 39, "disputes": 1}', unixepoch()),
  ('32', 83, '{"tasksCompleted": 30, "disputes": 2}', unixepoch()),
  ('33', 79, '{"tasksCompleted": 26, "disputes": 2}', unixepoch()),
  ('34', 86, '{"tasksCompleted": 34, "disputes": 1}', unixepoch()),
  ('35', 81, '{"tasksCompleted": 28, "disputes": 2}', unixepoch());
