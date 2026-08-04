PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS task_execution_snapshots (
  task_id TEXT PRIMARY KEY,
  skill_snapshot_json TEXT NOT NULL CHECK (json_valid(skill_snapshot_json)),
  toolset_snapshot_json TEXT NOT NULL CHECK (json_valid(toolset_snapshot_json)),
  persona_snapshot_json TEXT NOT NULL CHECK (json_valid(persona_snapshot_json)),
  context_policy_snapshot_json TEXT NOT NULL CHECK (json_valid(context_policy_snapshot_json)),
  permission_snapshot_json TEXT NOT NULL CHECK (json_valid(permission_snapshot_json)),
  provider_config_snapshot_json TEXT NOT NULL CHECK (json_valid(provider_config_snapshot_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
