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
    let interrupted_runs = {
        let mut statement = transaction.prepare(
            "SELECT run.id,run.task_id FROM agent_runs run
             JOIN tasks task ON task.id=run.task_id
             WHERE task.status='running' AND run.phase IN ('preflight','context_build','model_decision','observe','validate_output','evaluate')
               AND NOT EXISTS(SELECT 1 FROM tool_executions execution JOIN actions action ON action.id=execution.action_id WHERE action.task_id=task.id AND execution.status='running')",
        ).map_err(|error| error.to_string())?;
        statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };
    for (run_id, task_id) in interrupted_runs {
        let changed = transaction.execute(
            "UPDATE agent_runs SET phase='terminal',stop_reason='interrupted_before_terminal_commit',revision=revision+1,updated_at=?1 WHERE id=?2 AND phase!='terminal'",
            params![now, run_id],
        ).map_err(|error| error.to_string())?;
        if changed == 1 {
            transaction.execute("UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running'",params![now,task_id]).map_err(|error|error.to_string())?;
            summary.safe_failures += 1;
        }
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
                "INSERT OR IGNORE INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task','alex','input','running','t','t')",
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

    #[test]
    fn restart_converges_an_interrupted_model_phase() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','role','path','active','t','t')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task','alex','{}','running','t','t')", []).unwrap();
        connection.execute("INSERT INTO agent_runs(id,task_id,schema_version,phase,revision,model_turns_used,tool_calls_used,max_model_turns,max_tool_calls,deadline,waiting_reason,stop_reason,created_at,updated_at) VALUES ('run','task','1.0.0','model_decision',1,1,0,2,1,'9999999999',NULL,NULL,'t','t')", []).unwrap();
        let summary = reconcile_interrupted(&mut connection, "t2").unwrap();
        assert_eq!(summary.safe_failures, 1);
        let state: (String, String) = connection.query_row("SELECT task.status,run.phase FROM tasks task JOIN agent_runs run ON run.task_id=task.id WHERE task.id='task'", [], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
        assert_eq!(state, ("failed".into(), "terminal".into()));
    }
}
