use rusqlite::{Connection, Result};

pub const MIGRATION_001: &str = include_str!("../../../storage/migrations/001_initial.sql");

pub fn migrate(connection: &mut Connection) -> Result<()> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(MIGRATION_001)?;
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
        assert_eq!(count, 17); // 16 canonical tables plus schema_migrations.

        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
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
}
