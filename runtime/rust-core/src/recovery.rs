use rusqlite::{Connection, params};

#[derive(Debug, Eq, PartialEq)]
pub struct RecoverySummary {
    pub safe_failures: usize,
    pub result_unknown: usize,
}

/// Reconciles executions left `running` after a Runtime restart.
///
/// `not_started` is deliberately not treated as proof that a side effect did not
/// happen: the process can crash after the effect and before persisting its result.
pub fn reconcile_interrupted(
    connection: &mut Connection,
    now: &str,
) -> Result<RecoverySummary, String> {
    let interrupted = {
        let mut statement = connection
            .prepare(
                "SELECT e.call_id, e.action_id, e.side_effect_state, a.task_id
                 FROM tool_executions e
                 JOIN actions a ON a.id = e.action_id
                 WHERE e.status = 'running'
                 ORDER BY e.started_at, e.call_id",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let mut summary = RecoverySummary {
        safe_failures: 0,
        result_unknown: 0,
    };
    for (call_id, action_id, side_effect_state, task_id) in interrupted {
        let (execution_status, action_status, result) = if side_effect_state == "none" {
            summary.safe_failures += 1;
            ("failed", "failed", "interrupted_without_side_effect")
        } else {
            summary.result_unknown += 1;
            ("result_unknown", "result_unknown", "result_unknown")
        };
        transaction
            .execute(
                "UPDATE tool_executions
                 SET status=?1, side_effect_state=CASE WHEN ?1='result_unknown' THEN 'unknown' ELSE side_effect_state END,
                     finished_at=?2
                 WHERE call_id=?3 AND status='running'",
                params![execution_status, now, call_id],
            )
            .map_err(|error| error.to_string())?;
        if execution_status == "result_unknown" {
            transaction.execute(
                "UPDATE agent_runs SET phase='terminal',stop_reason='result_unknown',waiting_reason=NULL,revision=revision+1,updated_at=?1
                 WHERE task_id=?2 AND phase!='terminal'",
                params![now, task_id],
            ).map_err(|error| error.to_string())?;
        } else {
            transaction.execute(
                "UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running'",
                params![now, task_id],
            ).map_err(|error| error.to_string())?;
            transaction.execute(
                "UPDATE agent_runs SET phase='terminal',stop_reason='worker_interrupted',waiting_reason=NULL,revision=revision+1,updated_at=?1
                 WHERE task_id=?2 AND phase!='terminal'",
                params![now, task_id],
            ).map_err(|error| error.to_string())?;
        }
        transaction
            .execute(
                "UPDATE actions SET status=?1, updated_at=?2
                 WHERE id=?3 AND status='running'",
                params![action_status, now, action_id],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO audit_logs
                 (id, agent_id, task_id, approval_id, action, resource, result, created_at)
                 SELECT ?1, t.agent_id, ?2, NULL, 'runtime.recovery', 'redacted', ?3, ?4
                 FROM tasks t WHERE t.id=?2",
                params![format!("audit_recovery_{call_id}"), task_id, result, now],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;

    fn seed(connection: &Connection, id: &str, side_effect_state: &str) {
        connection.execute("INSERT OR IGNORE INTO agents VALUES ('alex','Alex','ai_product_manager','packages/agents/ai-product-manager','active','t','t')", []).unwrap();
        connection.execute("INSERT OR IGNORE INTO tools VALUES ('tool','tool','native','1.0.0','{}','active','t','t')", []).unwrap();
        connection
            .execute(
                "INSERT OR IGNORE INTO tasks VALUES ('task','alex','input','running','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO actions VALUES (?1,'task','tool','{}',NULL,'running','t','t')",
                [format!("action_{id}")],
            )
            .unwrap();
        connection.execute("INSERT INTO tool_executions VALUES (?1,?2,?3,1,'running',?4,NULL,'t',NULL,'trace')", params![format!("call_{id}"),format!("action_{id}"),format!("key_{id}"),side_effect_state]).unwrap();
    }

    #[test]
    fn restart_fails_pure_calls_but_never_replays_possible_side_effects() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        seed(&connection, "pure", "none");
        seed(&connection, "write", "not_started");

        assert_eq!(
            reconcile_interrupted(&mut connection, "restarted").unwrap(),
            RecoverySummary {
                safe_failures: 1,
                result_unknown: 1
            }
        );
        let pure: String = connection
            .query_row(
                "SELECT status FROM tool_executions WHERE call_id='call_pure'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let write: String = connection
            .query_row(
                "SELECT status FROM tool_executions WHERE call_id='call_write'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pure, "failed");
        assert_eq!(write, "result_unknown");
        let task_status: String = connection
            .query_row("SELECT status FROM tasks WHERE id='task'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(task_status, "failed");
        assert_eq!(
            reconcile_interrupted(&mut connection, "again").unwrap(),
            RecoverySummary {
                safe_failures: 0,
                result_unknown: 0
            }
        );
    }
}
