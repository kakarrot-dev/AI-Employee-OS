PRAGMA foreign_keys = ON;

ALTER TABLE task_threads ADD COLUMN archived_at TEXT;
ALTER TABLE task_threads ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_task_threads_retention_updated
ON task_threads(deleted_at, archived_at, updated_at);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (17, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
