CREATE TABLE run_snapshots_v2 (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN (
    'agent','skill','capability_set','toolset','context','model'
  )),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  UNIQUE (run_id, snapshot_type)
);

INSERT INTO run_snapshots_v2
SELECT id,run_id,snapshot_type,snapshot_json,sha256,created_at
FROM run_snapshots;

DROP TABLE run_snapshots;
ALTER TABLE run_snapshots_v2 RENAME TO run_snapshots;
CREATE INDEX idx_run_snapshots_run_type ON run_snapshots(run_id, snapshot_type);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (13, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
