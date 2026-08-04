PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS memory_provenance (
  memory_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  trust TEXT NOT NULL CHECK (trust IN ('untrusted_data')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_memory_provenance_task ON memory_provenance(task_id, created_at);
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
