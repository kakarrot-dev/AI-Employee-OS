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
pub const MIGRATION_014: &str =
    include_str!("../../../storage/migrations/014_multi_employee_business_flows.sql");
pub const MIGRATION_015: &str =
    include_str!("../../../storage/migrations/015_business_flow_outputs.sql");
pub const MIGRATION_016: &str =
    include_str!("../../../storage/migrations/016_task_threads_and_proposals.sql");
pub const MIGRATION_017: &str =
    include_str!("../../../storage/migrations/017_task_thread_retention.sql");
pub const MIGRATION_018: &str =
    include_str!("../../../storage/migrations/018_employee_work_snapshots.sql");
pub const MIGRATION_019: &str =
    include_str!("../../../storage/migrations/019_business_flow_task_threads.sql");
pub const MIGRATION_020: &str =
    include_str!("../../../storage/migrations/020_execution_policy_locks.sql");
const LATEST_SCHEMA_VERSION: i64 = 20;

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
    if current < 14 {
        transaction.execute_batch(MIGRATION_014)?;
    }
    if current < 15 {
        transaction.execute_batch(MIGRATION_015)?;
    }
    if current < 16 {
        transaction.execute_batch(MIGRATION_016)?;
    }
    if current < 17 {
        transaction.execute_batch(MIGRATION_017)?;
    }
    if current < 18 {
        transaction.execute_batch(MIGRATION_018)?;
    }
    if current < 19 {
        transaction.execute_batch(MIGRATION_019)?;
    }
    if current < 20 {
        repair_draft_018_scenario_history(&transaction)?;
        transaction.execute_batch(MIGRATION_020)?;
    }
    transaction.commit()
}

fn repair_draft_018_scenario_history(connection: &Connection) -> Result<()> {
    let has_historical_agent_id: bool = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM pragma_table_info('scenario_nodes')
           WHERE name='historical_agent_id'
         )",
        [],
        |row| row.get(0),
    )?;
    if !has_historical_agent_id {
        connection.execute_batch(
            "ALTER TABLE scenario_nodes ADD COLUMN historical_agent_id TEXT;
             UPDATE scenario_nodes SET historical_agent_id=assignee_agent_id;",
        )?;
    }
    connection.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS capture_scenario_node_historical_agent
         AFTER INSERT ON scenario_nodes
         WHEN NEW.historical_agent_id IS NULL
         BEGIN
           UPDATE scenario_nodes
           SET historical_agent_id=NEW.assignee_agent_id
           WHERE id=NEW.id;
         END;",
    )
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
        assert_eq!(count, 54); // 53 canonical tables plus schema_migrations.

        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");

        let migration_count: i64 = connection
            .query_row("SELECT count(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(migration_count, 20);
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
                    "测试员工",
                    "测试角色",
                    "/agents/test-employee",
                    "2026-08-04T00:00:00Z",
                ),
            )
            .unwrap();

        let result = connection.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task_1', 'agent_1', 'test', 'blocked', ?1, ?1)",
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
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task_orphan', 'missing_agent', 'test', 'pending', ?1, ?1)",
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
                    "Test Employee",
                    "Test Role",
                    "/agents/test_employee",
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
        assert_eq!(index_count, 42);
    }

    #[test]
    fn migration_enforces_scenario_versions_and_edges() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('agent_1','Test Employee','Coordinator','package','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO scenario_definitions VALUES ('scenario_1','Launch','','active',1,'t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO scenario_versions VALUES ('version_1','scenario_1',1,'manual','{}',?1,NULL,'t','t')",
                ["a".repeat(64)],
            )
            .unwrap();
        let duplicate_version = connection.execute(
            "INSERT INTO scenario_versions VALUES ('version_2','scenario_1',1,'manual','{}',?1,NULL,'t','t')",
            ["b".repeat(64)],
        );
        assert!(duplicate_version.is_err());

        for (id, key, position) in [("node_1", "a", 0), ("node_2", "b", 1)] {
            connection
                .execute(
                    "INSERT INTO scenario_nodes(
                       id,scenario_version_id,node_key,role,goal,assignee_agent_id,
                       required_capabilities_json,input_refs_json,acceptance_json,budget_json,
                       failure_policy,position
                     ) VALUES (?1,'version_1',?2,'executor','goal','agent_1','[]','[]','[]','{}','stop',?3)",
                    rusqlite::params![id, key, position],
                )
                .unwrap();
        }
        let self_edge = connection.execute(
            "INSERT INTO scenario_edges VALUES ('version_1','node_1','node_1',1,'t')",
            [],
        );
        assert!(self_edge.is_err());
        connection
            .execute(
                "INSERT INTO scenario_edges VALUES ('version_1','node_1','node_2',1,'t')",
                [],
            )
            .unwrap();
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
                    "Test Employee",
                    "Test Role",
                    "/agents/test_employee",
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
        assert_eq!(name, "Test Employee");
    }

    #[test]
    fn migration_018_does_not_collide_with_a_legacy_user_employee_id() {
        let mut connection = Connection::open_in_memory().unwrap();
        for migration in [
            MIGRATION_001,
            MIGRATION_002,
            MIGRATION_003,
            MIGRATION_004,
            MIGRATION_005,
            MIGRATION_006,
            MIGRATION_007,
            MIGRATION_008,
            MIGRATION_009,
            MIGRATION_010,
            MIGRATION_011,
            MIGRATION_012,
            MIGRATION_013,
            MIGRATION_014,
            MIGRATION_015,
            MIGRATION_016,
            MIGRATION_017,
        ] {
            connection.execute_batch(migration).unwrap();
        }
        connection
            .execute(
                "INSERT INTO agents VALUES (
                   'system-historical-employee','Legacy User','Operator','user-managed','active','t','t'
                 )",
                [],
            )
            .unwrap();

        migrate(&mut connection).unwrap();

        let legacy: (String, String) = connection
            .query_row(
                "SELECT name,status FROM agents WHERE id='system-historical-employee'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(legacy, ("Legacy User".to_owned(), "active".to_owned()));
        let sentinel: (String, String) = connection
            .query_row(
                "SELECT package_path,status FROM agents WHERE id='system:historical-employee'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            sentinel,
            ("system-history".to_owned(), "disabled".to_owned())
        );
        let foreign_key_violations: i64 = connection
            .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(foreign_key_violations, 0);
    }

    #[test]
    fn migration_020_repairs_draft_018_schema_without_historical_agent_column() {
        let mut connection = Connection::open_in_memory().unwrap();
        for migration in [
            MIGRATION_001,
            MIGRATION_002,
            MIGRATION_003,
            MIGRATION_004,
            MIGRATION_005,
            MIGRATION_006,
            MIGRATION_007,
            MIGRATION_008,
            MIGRATION_009,
            MIGRATION_010,
            MIGRATION_011,
            MIGRATION_012,
            MIGRATION_013,
            MIGRATION_014,
            MIGRATION_015,
            MIGRATION_016,
            MIGRATION_017,
        ] {
            connection.execute_batch(migration).unwrap();
        }
        connection
            .execute_batch(
                "CREATE TABLE task_participant_snapshots (
                   task_id TEXT PRIMARY KEY,
                   historical_agent_id TEXT NOT NULL,
                   display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
                   role TEXT NOT NULL CHECK (length(trim(role)) > 0),
                   captured_at TEXT NOT NULL,
                   FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                 );
                 CREATE TRIGGER capture_task_participant_snapshot
                 AFTER INSERT ON tasks
                 BEGIN
                   INSERT INTO task_participant_snapshots(task_id,historical_agent_id,display_name,role,captured_at)
                   SELECT NEW.id,agent.id,agent.name,agent.role,NEW.created_at
                   FROM agents agent WHERE agent.id=NEW.agent_id;
                 END;
                 INSERT INTO agents(id,name,role,package_path,status,created_at,updated_at)
                 VALUES ('system:historical-employee','已删除员工','历史参与者','system-history','disabled','t','t');
                 INSERT INTO schema_migrations(version,applied_at) VALUES (18,'t');",
            )
            .unwrap();
        connection.execute_batch(MIGRATION_019).unwrap();
        connection
            .execute_batch(
                "INSERT INTO agents VALUES ('ai-product-manager','Legacy Generalist','Role','legacy','active','t','t');
                 INSERT INTO scenario_definitions VALUES ('scenario','Scenario','','active',1,'t','t');
                 INSERT INTO scenario_versions VALUES (
                   'scenario-v1','scenario',1,'manual','{}',
                   'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',NULL,'t','t'
                 );
                 INSERT INTO scenario_nodes VALUES (
                   'node','scenario-v1','research','executor','Research','ai-product-manager',
                   '[]','[]','[]','{}','stop',0
                 );",
            )
            .unwrap();

        migrate(&mut connection).unwrap();

        let node: (String, String) = connection
            .query_row(
                "SELECT assignee_agent_id,historical_agent_id FROM scenario_nodes WHERE id='node'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            node,
            (
                "system:historical-employee".to_owned(),
                "ai-product-manager".to_owned()
            )
        );
        assert_eq!(
            connection
                .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
    }

    #[test]
    fn migration_020_retires_the_removed_legacy_generalist() {
        let mut connection = Connection::open_in_memory().unwrap();
        for migration in [
            MIGRATION_001,
            MIGRATION_002,
            MIGRATION_003,
            MIGRATION_004,
            MIGRATION_005,
            MIGRATION_006,
            MIGRATION_007,
            MIGRATION_008,
            MIGRATION_009,
            MIGRATION_010,
            MIGRATION_011,
            MIGRATION_012,
            MIGRATION_013,
            MIGRATION_014,
            MIGRATION_015,
            MIGRATION_016,
            MIGRATION_017,
            MIGRATION_018,
            MIGRATION_019,
        ] {
            connection.execute_batch(migration).unwrap();
        }
        connection.execute_batch(
            "INSERT INTO agents VALUES ('ai-product-manager','Legacy Generalist','Role','legacy','active','t','t');
             INSERT INTO employee_profiles(agent_id,department,mission,responsibilities_json,boundaries_json,soul_json,base_prompt,config_version,created_at,updated_at)
             VALUES ('ai-product-manager','Legacy','Mission','[]','[]','[]','Prompt',1,'t','t');
             INSERT INTO conversations VALUES ('conversation','ai-product-manager','Legacy','active','t','t');
             INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task','ai-product-manager','{}','running','t','t');
             INSERT INTO actions VALUES ('action','task',NULL,'{}',NULL,'running','t','t');
             INSERT INTO tool_executions VALUES ('call','action','key',1,'running','unknown',NULL,'t',NULL,'trace');
             INSERT INTO agent_runs VALUES ('run','task','1.0.0','tool_execution',1,1,0,2,1,'9999999999',NULL,NULL,'t','t');
             INSERT INTO approvals VALUES ('approval','task','ai-product-manager','write',2,'pending','t',NULL);",
        ).unwrap();

        migrate(&mut connection).unwrap();

        let legacy_exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM agents WHERE id='ai-product-manager')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!legacy_exists);
        let task: (String, String) = connection
            .query_row(
                "SELECT agent_id,status FROM tasks WHERE id='task'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            task,
            ("system:historical-employee".to_owned(), "failed".to_owned())
        );
        let execution: (String, String) = connection
            .query_row(
                "SELECT action.status,execution.status FROM actions action
                 JOIN tool_executions execution ON execution.action_id=action.id
                 WHERE action.id='action'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            execution,
            ("result_unknown".to_owned(), "result_unknown".to_owned())
        );
        let approval: (String, String) = connection
            .query_row(
                "SELECT agent_id,status FROM approvals WHERE id='approval'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            approval,
            (
                "system:historical-employee".to_owned(),
                "expired".to_owned()
            )
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT historical_agent_id FROM task_participant_snapshots WHERE task_id='task'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "ai-product-manager"
        );
        assert_eq!(
            connection
                .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );
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
                "INSERT INTO agents VALUES ('test_employee','Test Employee','assistant','package','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO conversations VALUES ('conversation','test_employee','Chat','active','t','t')",
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
                    "Test Employee",
                    "Test Role",
                    "/agents/test_employee",
                    "2026-08-04T00:00:00Z",
                ),
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task_1', 'agent_1', 'test', 'running', ?1, ?1)",
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
