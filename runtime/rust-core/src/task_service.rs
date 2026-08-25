use rusqlite::{Connection, OptionalExtension, params};

use crate::{
    evaluation::{EvaluationOutcome, persist_evaluation_in},
    event::{EventLog, EventType},
    task::{InvalidTransition, TaskEvent, TaskStatus},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TaskRecord {
    pub id: String,
    pub agent_id: String,
    pub input: String,
    pub status: TaskStatus,
    pub created_at: String,
    pub updated_at: String,
}

pub struct ExecutionSnapshot<'a> {
    pub skill: &'a str,
    pub toolset: &'a str,
    pub persona: &'a str,
    pub context_policy: &'a str,
    pub permissions: &'a str,
    pub provider_config: &'a str,
}

#[derive(Debug)]
pub enum TaskServiceError {
    Database(rusqlite::Error),
    AgentUnavailable(String),
    TaskNotFound(String),
    UnknownPersistedStatus(String),
    InvalidTransition(InvalidTransition),
    SnapshotRequired,
    EvaluationRequired,
    ActionsIncomplete,
    EvaluationBlocked { score: f64 },
    Evaluation(String),
}

impl From<rusqlite::Error> for TaskServiceError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value)
    }
}

impl From<InvalidTransition> for TaskServiceError {
    fn from(value: InvalidTransition) -> Self {
        Self::InvalidTransition(value)
    }
}

pub struct TaskService<'a> {
    connection: &'a mut Connection,
    events: &'a mut EventLog,
}

impl<'a> TaskService<'a> {
    pub fn new(connection: &'a mut Connection, events: &'a mut EventLog) -> Self {
        Self { connection, events }
    }

    pub fn start_with_snapshot(
        &mut self,
        id: &str,
        s: ExecutionSnapshot<'_>,
        now: &str,
    ) -> Result<TaskRecord, TaskServiceError> {
        let next = self.get(id)?.status.transition(TaskEvent::Start)?;
        let tx = self.connection.transaction()?;
        tx.execute(
            "INSERT INTO task_execution_snapshots VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                id,
                s.skill,
                s.toolset,
                s.persona,
                s.context_policy,
                s.permissions,
                s.provider_config,
                now
            ],
        )?;
        tx.execute(
            "UPDATE tasks SET status=?1,updated_at=?2 WHERE id=?3 AND status='pending'",
            params![next.as_str(), now, id],
        )?;
        tx.commit()?;
        self.events.append(
            id,
            EventType::TaskStarted,
            now,
            serde_json::json!({"status":"running"}),
        );
        self.get(id)
    }

    pub fn create(
        &mut self,
        id: &str,
        agent_id: &str,
        input: &str,
        now: &str,
    ) -> Result<TaskRecord, TaskServiceError> {
        let agent_status: Option<String> = self
            .connection
            .query_row(
                "SELECT status FROM agents WHERE id = ?1",
                [agent_id],
                |row| row.get(0),
            )
            .optional()?;
        if agent_status.as_deref() != Some("active") {
            return Err(TaskServiceError::AgentUnavailable(agent_id.to_owned()));
        }

        self.connection.execute(
            "INSERT INTO tasks (id, agent_id, input, status, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'pending', ?4, ?4)",
            params![id, agent_id, input, now],
        )?;
        self.events.append(
            id,
            EventType::TaskCreated,
            now,
            serde_json::json!({"agent_id": agent_id}),
        );
        self.get(id)
    }

    pub fn transition(
        &mut self,
        id: &str,
        event: TaskEvent,
        now: &str,
    ) -> Result<TaskRecord, TaskServiceError> {
        if event == TaskEvent::Start {
            return Err(TaskServiceError::SnapshotRequired);
        }
        if event == TaskEvent::Complete {
            return Err(TaskServiceError::EvaluationRequired);
        }
        let current = self.get(id)?;
        let next = current.status.transition(event)?;
        let updated = self.connection.execute(
            "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status = ?4",
            params![next.as_str(), now, id, current.status.as_str()],
        )?;
        if updated != 1 {
            return Err(TaskServiceError::TaskNotFound(id.to_owned()));
        }
        self.events.append(
            id,
            event_type_for(next),
            now,
            serde_json::json!({"status": next.as_str()}),
        );
        self.get(id)
    }

    pub fn complete_with_evaluation(
        &mut self,
        id: &str,
        evaluation_id: &str,
        outcome: &EvaluationOutcome,
        now: &str,
    ) -> Result<TaskRecord, TaskServiceError> {
        let current = self.get(id)?;
        let next = current.status.transition(TaskEvent::Complete)?;
        let transaction = self.connection.transaction()?;
        let actions_incomplete: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM actions WHERE task_id=?1 AND status!='succeeded')",
            params![id],
            |row| row.get(0),
        )?;
        if actions_incomplete {
            return Err(TaskServiceError::ActionsIncomplete);
        }
        persist_evaluation_in(
            &transaction,
            evaluation_id,
            id,
            &current.agent_id,
            outcome,
            now,
        )
        .map_err(TaskServiceError::Evaluation)?;
        self.events.append_persisted(
            &transaction,
            id,
            if outcome.delivery_allowed {
                EventType::EvaluationPassed
            } else {
                EventType::EvaluationBlocked
            },
            now,
            serde_json::json!({"score": outcome.score, "failed_items": outcome.failed_items}),
        )?;
        if outcome.delivery_allowed {
            let updated = transaction.execute(
                "UPDATE tasks SET status=?1,updated_at=?2
                 WHERE id=?3 AND status='running'
                   AND NOT EXISTS(
                     SELECT 1 FROM actions
                     WHERE task_id=?3 AND status!='succeeded'
                   )",
                params![next.as_str(), now, id],
            )?;
            if updated != 1 {
                return Err(TaskServiceError::TaskNotFound(id.to_owned()));
            }
        }
        transaction.commit()?;
        if !outcome.delivery_allowed {
            return Err(TaskServiceError::EvaluationBlocked {
                score: outcome.score,
            });
        }
        self.events.append(
            id,
            EventType::TaskSucceeded,
            now,
            serde_json::json!({"status": "succeeded"}),
        );
        self.get(id)
    }

    pub fn get(&self, id: &str) -> Result<TaskRecord, TaskServiceError> {
        let row: Option<(String, String, String, String, String, String)> = self
            .connection
            .query_row(
                "SELECT id, agent_id, input, status, created_at, updated_at FROM tasks WHERE id = ?1",
                [id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()?;
        let (id, agent_id, input, status, created_at, updated_at) =
            row.ok_or_else(|| TaskServiceError::TaskNotFound(id.to_owned()))?;
        let status = TaskStatus::parse(&status)
            .ok_or_else(|| TaskServiceError::UnknownPersistedStatus(status.clone()))?;
        Ok(TaskRecord {
            id,
            agent_id,
            input,
            status,
            created_at,
            updated_at,
        })
    }
}

fn event_type_for(status: TaskStatus) -> EventType {
    match status {
        TaskStatus::Pending => EventType::TaskCreated,
        TaskStatus::Running => EventType::TaskStarted,
        TaskStatus::Succeeded => EventType::TaskSucceeded,
        TaskStatus::Failed => EventType::TaskFailed,
        TaskStatus::Cancelled => EventType::TaskCancelled,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::{
        agent::install_agent_package,
        evaluation::{PrdRubric, evaluate_prd},
        storage::migrate,
    };

    fn passing_evaluation() -> EvaluationOutcome {
        evaluate_prd(&PrdRubric {
            evidence_traceable: true,
            user_value_clear: true,
            measurable_goal: true,
            scope_clear: true,
            recovery_flow: true,
            permission_boundary: true,
            testable_acceptance: true,
            unknowns_not_fabricated: true,
        })
    }

    fn setup() -> (Connection, EventLog) {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let package_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/agents/document-writer");
        install_agent_package(&mut connection, &package_path, "2026-08-04T00:00:00Z").unwrap();
        (connection, EventLog::default())
    }

    #[test]
    fn creates_and_completes_a_task_for_an_employee() {
        let (mut connection, mut events) = setup();
        let mut service = TaskService::new(&mut connection, &mut events);
        let created = service
            .create(
                "task_1",
                "document-writer",
                "为企业 AI 知识库设计一个 PRD",
                "2026-08-04T00:00:01Z",
            )
            .unwrap();
        assert_eq!(created.status, TaskStatus::Pending);

        let running = service
            .start_with_snapshot(
                "task_1",
                ExecutionSnapshot {
                    skill: "{}",
                    toolset: "[]",
                    persona: "{}",
                    context_policy: "{}",
                    permissions: "[]",
                    provider_config: "{}",
                },
                "2026-08-04T00:00:02Z",
            )
            .unwrap();
        assert_eq!(running.status, TaskStatus::Running);
        assert!(matches!(
            service.transition("task_1", TaskEvent::Complete, "2026-08-04T00:00:03Z"),
            Err(TaskServiceError::EvaluationRequired)
        ));
        let succeeded = service
            .complete_with_evaluation(
                "task_1",
                "evaluation_1",
                &passing_evaluation(),
                "2026-08-04T00:00:03Z",
            )
            .unwrap();
        assert_eq!(succeeded.status, TaskStatus::Succeeded);
        drop(service);
        assert_eq!(events.after(0).len(), 4);
    }

    #[test]
    fn rejects_disabled_or_missing_agents_and_terminal_restart() {
        let (mut connection, mut events) = setup();
        connection
            .execute(
                "UPDATE agents SET status = 'disabled' WHERE id = 'document-writer'",
                [],
            )
            .unwrap();
        let mut service = TaskService::new(&mut connection, &mut events);
        assert!(matches!(
            service.create("task_1", "document-writer", "test", "2026-08-04T00:00:01Z"),
            Err(TaskServiceError::AgentUnavailable(_))
        ));
        drop(service);

        connection
            .execute(
                "UPDATE agents SET status = 'active' WHERE id = 'document-writer'",
                [],
            )
            .unwrap();
        let mut service = TaskService::new(&mut connection, &mut events);
        service
            .create("task_2", "document-writer", "test", "2026-08-04T00:00:02Z")
            .unwrap();
        service
            .transition("task_2", TaskEvent::Cancel, "2026-08-04T00:00:03Z")
            .unwrap();
        assert!(matches!(
            service.transition("task_2", TaskEvent::Start, "2026-08-04T00:00:04Z"),
            Err(TaskServiceError::SnapshotRequired)
        ));
    }

    #[test]
    fn failed_evaluation_is_recorded_and_keeps_task_running() {
        let (mut connection, mut events) = setup();
        let mut service = TaskService::new(&mut connection, &mut events);
        service
            .create("task_3", "document-writer", "test", "t1")
            .unwrap();
        service
            .start_with_snapshot(
                "task_3",
                ExecutionSnapshot {
                    skill: "{}",
                    toolset: "[]",
                    persona: "{}",
                    context_policy: "{}",
                    permissions: "[]",
                    provider_config: "{}",
                },
                "t2",
            )
            .unwrap();
        let mut outcome = passing_evaluation();
        outcome.delivery_allowed = false;
        outcome.score = 0.75;
        assert!(matches!(
            service.complete_with_evaluation("task_3", "evaluation_3", &outcome, "t3"),
            Err(TaskServiceError::EvaluationBlocked { score: 0.75 })
        ));
        assert_eq!(service.get("task_3").unwrap().status, TaskStatus::Running);
        drop(service);
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM evaluations WHERE task_id='task_3'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }
}
