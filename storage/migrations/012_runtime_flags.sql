PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runtime_flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (12, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
