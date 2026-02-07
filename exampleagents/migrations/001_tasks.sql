CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  request_payload_json TEXT NOT NULL,
  input_text TEXT NOT NULL,
  skill_id TEXT,
  model_requested TEXT,
  model_used TEXT,
  result_json TEXT,
  error_message TEXT,
  response_meta_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_updated_at
  ON tasks (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_tasks_agent_created_at
  ON tasks (agent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_expires_at
  ON tasks (expires_at);
