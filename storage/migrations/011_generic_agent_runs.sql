PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  schema_version TEXT NOT NULL CHECK (schema_version = '1.0.0'),
  phase TEXT NOT NULL CHECK (phase IN (
    'created','preflight','context_build','model_decision','waiting_user',
    'authorize','waiting_approval','tool_execution','observe',
    'validate_output','build_deliverable','evaluate','terminal'
  )),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  model_turns_used INTEGER NOT NULL DEFAULT 0 CHECK (model_turns_used >= 0),
  tool_calls_used INTEGER NOT NULL DEFAULT 0 CHECK (tool_calls_used >= 0),
  max_model_turns INTEGER NOT NULL CHECK (max_model_turns >= 1),
  max_tool_calls INTEGER NOT NULL CHECK (max_tool_calls >= 0),
  deadline TEXT NOT NULL,
  waiting_reason TEXT,
  stop_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('agent','skill','toolset','context','model')),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, snapshot_type)
);

CREATE TABLE IF NOT EXISTS run_observations (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('model_decision','tool_result','user_input','system')),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  result_ref TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS run_checkpoints (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  checkpoint_kind TEXT NOT NULL CHECK (checkpoint_kind IN (
    'before_model','decision_validated','before_tool','tool_result_persisted',
    'observation_persisted','deliverable_verified'
  )),
  state_sha256 TEXT NOT NULL CHECK (length(state_sha256) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, revision, checkpoint_kind)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  uri TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_by_action_id TEXT,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('public','internal','sensitive')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('pending','verified','failed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_action_id) REFERENCES actions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate','verified','rejected')),
  output_json TEXT NOT NULL CHECK (json_valid(output_json)),
  created_at TEXT NOT NULL,
  verified_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deliverable_evidence (
  deliverable_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('artifact','tool_result','verification','evaluation','structured_output')),
  evidence_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (deliverable_id, evidence_type, evidence_ref),
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_task_created ON agent_runs(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_run_observations_run_sequence ON run_observations(run_id, sequence);
CREATE INDEX IF NOT EXISTS idx_run_checkpoints_run_revision ON run_checkpoints(run_id, revision);
CREATE INDEX IF NOT EXISTS idx_artifacts_run_created ON artifacts(run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deliverables_run_status ON deliverables(run_id, status);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
