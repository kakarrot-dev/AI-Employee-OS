ALTER TABLE employee_profiles ADD COLUMN avatar_path TEXT;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
