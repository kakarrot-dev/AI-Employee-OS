PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('user', 'company')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (type, id)
);
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
