PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tool_executions (
  call_id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  status TEXT NOT NULL CHECK (
    status IN ('running', 'succeeded', 'failed', 'blocked', 'result_unknown', 'cancelled')
  ),
  side_effect_state TEXT NOT NULL CHECK (
    side_effect_state IN ('none', 'not_started', 'confirmed', 'unknown')
  ),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trace_id TEXT NOT NULL,
  FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
  UNIQUE (action_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_action_started
  ON tool_executions(action_id, started_at);
CREATE INDEX IF NOT EXISTS idx_tool_executions_trace
  ON tool_executions(trace_id);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
