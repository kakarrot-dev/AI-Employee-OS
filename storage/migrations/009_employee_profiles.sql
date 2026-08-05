CREATE TABLE IF NOT EXISTS employee_profiles (
  agent_id TEXT PRIMARY KEY,
  department TEXT NOT NULL,
  mission TEXT NOT NULL,
  responsibilities_json TEXT NOT NULL CHECK (json_valid(responsibilities_json)),
  boundaries_json TEXT NOT NULL CHECK (json_valid(boundaries_json)),
  soul_json TEXT NOT NULL CHECK (json_valid(soul_json)),
  base_prompt TEXT NOT NULL,
  config_version INTEGER NOT NULL DEFAULT 1 CHECK (config_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agents_status_name ON agents(status, name);

CREATE TABLE IF NOT EXISTS model_call_configs (
  model_call_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  config_version INTEGER NOT NULL CHECK (config_version >= 1),
  prompt_sha256 TEXT NOT NULL CHECK (length(prompt_sha256) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (model_call_id) REFERENCES model_calls(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES agents(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
