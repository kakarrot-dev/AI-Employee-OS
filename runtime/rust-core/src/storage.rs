use std::time::Duration;

use rusqlite::{Connection, Result, TransactionBehavior};

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
pub const MIGRATION_008: &str = include_str!("../../../storage/migrations/008_conversations.sql");
pub const MIGRATION_009: &str =
    include_str!("../../../storage/migrations/009_employee_profiles.sql");
pub const MIGRATION_010: &str = include_str!("../../../storage/migrations/010_employee_avatar.sql");
pub const MIGRATION_011: &str =
    include_str!("../../../storage/migrations/011_generic_agent_runs.sql");
pub const MIGRATION_012: &str = include_str!("../../../storage/migrations/012_runtime_flags.sql");
pub const MIGRATION_013: &str =
    include_str!("../../../storage/migrations/013_capability_set_runs.sql");
const LATEST_SCHEMA_VERSION: i64 = 13;

pub fn migrate(connection: &mut Connection) -> Result<()> {
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    if current_schema_version(connection)? >= LATEST_SCHEMA_VERSION {
        return Ok(());
    }
    let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let current = current_schema_version(&transaction)?;
    if current < 1 {
        transaction.execute_batch(MIGRATION_001)?;
    }
    if current < 2 {
        transaction.execute_batch(MIGRATION_002)?;
    }
    if current < 3 {
        transaction.execute_batch(MIGRATION_003)?;
    }
    if current < 4 {
        transaction.execute_batch(MIGRATION_004)?;
    }
    if current < 5 {
        transaction.execute_batch(MIGRATION_005)?;
    }
    if current < 6 {
        transaction.execute_batch(MIGRATION_006)?;
    }
    if current < 7 {
        transaction.execute_batch(MIGRATION_007)?;
    }
    if current < 8 {
        transaction.execute_batch(MIGRATION_008)?;
    }
    if current < 9 {
        transaction.execute_batch(MIGRATION_009)?;
    }
    if current < 10 {
        transaction.execute_batch(MIGRATION_010)?;
    }
    if current < 11 {
        transaction.execute_batch(MIGRATION_011)?;
    }
    if current < 12 {
        transaction.execute_batch(MIGRATION_012)?;
    }
    if current < 13 {
        transaction.execute_batch(MIGRATION_013)?;
    }
    transaction.commit()
}

fn current_schema_version(connection: &Connection) -> Result<i64> {
    let exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations')",
        [],
        |row| row.get(0),
    )?;
    if !exists {
        return Ok(0);
    }
    connection.query_row(
        "SELECT COALESCE(MAX(version),0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

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
        assert_eq!(count, 37); // 36 canonical tables plus schema_migrations.

        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");

        let migration_count: i64 = connection
            .query_row("SELECT count(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(migration_count, 13);
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
        assert_eq!(index_count, 24);
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
    fn current_schema_migration_does_not_compete_for_an_existing_write_lock() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("ai-employee-migration-lock-{nonce}.db"));
        let mut first = Connection::open(&path).unwrap();
        migrate(&mut first).unwrap();
        let write = first
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        write
            .execute("UPDATE agents SET updated_at=updated_at", [])
            .unwrap();

        let mut second = Connection::open(&path).unwrap();
        second.busy_timeout(Duration::from_millis(25)).unwrap();
        migrate(&mut second).unwrap();

        drop(write);
        drop(second);
        drop(first);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn conversation_messages_require_monotonic_unique_sequence() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','assistant','package','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO conversations VALUES ('conversation','alex','Chat','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO messages VALUES ('m1','conversation',1,'user','hello','t')",
                [],
            )
            .unwrap();
        let duplicate = connection.execute(
            "INSERT INTO messages VALUES ('m2','conversation',1,'assistant','hi','t')",
            [],
        );
        assert!(duplicate.is_err());
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
