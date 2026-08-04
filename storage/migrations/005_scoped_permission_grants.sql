PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS scoped_permission_grants (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE RESTRICT,
  FOREIGN KEY (subject_id) REFERENCES agents(id) ON DELETE RESTRICT,
  UNIQUE (task_id, action_id, action)
);
CREATE INDEX IF NOT EXISTS idx_scoped_permission_grants_lookup
  ON scoped_permission_grants(subject_id, action, expires_at, consumed_at);
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
