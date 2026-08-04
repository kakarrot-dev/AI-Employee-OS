use rusqlite::{Connection, Result};

pub const MIGRATION_001: &str = include_str!("../../../storage/migrations/001_initial.sql");
pub const MIGRATION_002: &str = include_str!("../../../storage/migrations/002_tool_executions.sql");
pub const MIGRATION_003: &str =
    include_str!("../../../storage/migrations/003_task_execution_snapshots.sql");
pub const MIGRATION_004: &str = include_str!("../../../storage/migrations/004_subjects.sql");
pub const MIGRATION_005: &str =
    include_str!("../../../storage/migrations/005_scoped_permission_grants.sql");
pub const MIGRATION_006: &str =
    include_str!("../../../storage/migrations/006_memory_provenance.sql");
pub const MIGRATION_007: &str =
    include_str!("../../../storage/migrations/007_runtime_events_and_cancellation.sql");

pub fn migrate(connection: &mut Connection) -> Result<()> {
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(MIGRATION_001)?;
    transaction.execute_batch(MIGRATION_002)?;
    transaction.execute_batch(MIGRATION_003)?;
    transaction.execute_batch(MIGRATION_004)?;
    transaction.execute_batch(MIGRATION_005)?;
    transaction.execute_batch(MIGRATION_006)?;
    transaction.execute_batch(MIGRATION_007)?;
    transaction.commit()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_all_canonical_tables_and_is_replayable() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();

        let count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 24); // 23 canonical tables plus schema_migrations.

        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");

        let migration_count: i64 = connection
            .query_row("SELECT count(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(migration_count, 7);
    }

    #[test]
    fn migration_enforces_task_status() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)",
                (
                    "agent_1",
                    "Alex",
                    "AI Product Manager",
                    "/agents/alex",
                    "2026-08-04T00:00:00Z",
                ),
            )
            .unwrap();

        let result = connection.execute(
            "INSERT INTO tasks VALUES ('task_1', 'agent_1', 'test', 'blocked', ?1, ?1)",
            ["2026-08-04T00:00:00Z"],
        );
        assert!(result.is_err());
    }

    #[test]
    fn migration_enables_and_enforces_foreign_keys() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();

        let enabled: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(enabled, 1);

        let result = connection.execute(
            "INSERT INTO tasks VALUES ('task_orphan', 'missing_agent', 'test', 'pending', ?1, ?1)",
            ["2026-08-04T00:00:00Z"],
        );
        assert!(result.is_err());
    }

    #[test]
    fn migration_enforces_json_and_canonical_indexes() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)",
                (
                    "agent_1",
                    "Alex",
                    "AI Product Manager",
                    "/agents/alex",
                    "2026-08-04T00:00:00Z",
                ),
            )
            .unwrap();

        let invalid_json = connection.execute(
            "INSERT INTO personas VALUES ('agent_1', 'not-json', '{}', '{}', '{}', ?1, ?1)",
            ["2026-08-04T00:00:00Z"],
        );
        assert!(invalid_json.is_err());

        let index_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index_count, 15);
    }

    #[test]
    fn migration_replay_preserves_existing_data() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)",
                (
                    "agent_1",
                    "Alex",
                    "AI Product Manager",
                    "/agents/alex",
                    "2026-08-04T00:00:00Z",
                ),
            )
            .unwrap();

        migrate(&mut connection).unwrap();
        let name: String = connection
            .query_row("SELECT name FROM agents WHERE id = 'agent_1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "Alex");
    }

    #[test]
    fn tool_execution_enforces_idempotency_and_attempt_uniqueness() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES (?1, ?2, ?3, ?4, 'active', ?5, ?5)",
                (
                    "agent_1",
                    "Alex",
                    "AI Product Manager",
                    "/agents/alex",
                    "2026-08-04T00:00:00Z",
                ),
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO tasks VALUES ('task_1', 'agent_1', 'test', 'running', ?1, ?1)",
                ["2026-08-04T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO actions VALUES ('action_1', 'task_1', NULL, '{}', NULL, 'running', ?1, ?1)",
                ["2026-08-04T00:00:00Z"],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO tool_executions VALUES (
                  'call_1', 'action_1', 'task_1:action_1:1', 1, 'running',
                  'not_started', NULL, ?1, NULL, 'trace_1'
                )",
                ["2026-08-04T00:00:00Z"],
            )
            .unwrap();

        let duplicate_key = connection.execute(
            "INSERT INTO tool_executions VALUES (
              'call_2', 'action_1', 'task_1:action_1:1', 2, 'running',
              'not_started', NULL, ?1, NULL, 'trace_1'
            )",
            ["2026-08-04T00:00:01Z"],
        );
        assert!(duplicate_key.is_err());

        let duplicate_attempt = connection.execute(
            "INSERT INTO tool_executions VALUES (
              'call_3', 'action_1', 'task_1:action_1:2', 1, 'running',
              'not_started', NULL, ?1, NULL, 'trace_1'
            )",
            ["2026-08-04T00:00:01Z"],
        );
        assert!(duplicate_attempt.is_err());
    }
}
