use rusqlite::{Connection, params};
use serde_json::Value;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventType {
    TaskCreated,
    TaskStarted,
    TaskSucceeded,
    TaskFailed,
    TaskCancelled,
    EvaluationPassed,
    EvaluationBlocked,
    BusinessFlowCreated,
    BusinessFlowStarted,
    WorkOrderReady,
    WorkOrderStarted,
    WorkOrderWaitingDependency,
    WorkOrderCompleted,
    HandoffCreated,
    HandoffAccepted,
    HandoffRejected,
    BusinessFlowWaitingUser,
    BusinessFlowVerificationRequired,
    BusinessFlowCompleted,
    BusinessFlowFailed,
    BusinessFlowCancelRequested,
}

impl EventType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TaskCreated => "task_created",
            Self::TaskStarted => "task_started",
            Self::TaskSucceeded => "task_succeeded",
            Self::TaskFailed => "task_failed",
            Self::TaskCancelled => "task_cancelled",
            Self::EvaluationPassed => "evaluation_passed",
            Self::EvaluationBlocked => "evaluation_blocked",
            Self::BusinessFlowCreated => "business_flow.created",
            Self::BusinessFlowStarted => "business_flow.started",
            Self::WorkOrderReady => "work_order.ready",
            Self::WorkOrderStarted => "work_order.started",
            Self::WorkOrderWaitingDependency => "work_order.waiting_dependency",
            Self::WorkOrderCompleted => "work_order.completed",
            Self::HandoffCreated => "handoff.created",
            Self::HandoffAccepted => "handoff.accepted",
            Self::HandoffRejected => "handoff.rejected",
            Self::BusinessFlowWaitingUser => "business_flow.waiting_user",
            Self::BusinessFlowVerificationRequired => "business_flow.verification_required",
            Self::BusinessFlowCompleted => "business_flow.completed",
            Self::BusinessFlowFailed => "business_flow.failed",
            Self::BusinessFlowCancelRequested => "business_flow.cancel_requested",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct EventEnvelope {
    pub event_id: String,
    pub sequence: u64,
    pub task_id: String,
    pub event_type: EventType,
    pub occurred_at: String,
    pub payload: Value,
}

#[derive(Default)]
pub struct EventLog {
    events: Vec<EventEnvelope>,
}

impl EventLog {
    pub fn append(
        &mut self,
        task_id: &str,
        event_type: EventType,
        occurred_at: &str,
        payload: Value,
    ) -> EventEnvelope {
        let sequence = self.events.len() as u64 + 1;
        let event = EventEnvelope {
            event_id: format!("{task_id}:event:{sequence}"),
            sequence,
            task_id: task_id.to_owned(),
            event_type,
            occurred_at: occurred_at.to_owned(),
            payload,
        };
        self.events.push(event.clone());
        event
    }

    pub fn append_persisted(
        &mut self,
        connection: &Connection,
        task_id: &str,
        event_type: EventType,
        occurred_at: &str,
        payload: Value,
    ) -> rusqlite::Result<EventEnvelope> {
        let sequence: i64 = connection.query_row(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM runtime_events WHERE task_id=?1",
            [task_id],
            |row| row.get(0),
        )?;
        let event = EventEnvelope {
            event_id: format!("{task_id}:event:{sequence}"),
            sequence: sequence as u64,
            task_id: task_id.to_owned(),
            event_type,
            occurred_at: occurred_at.to_owned(),
            payload,
        };
        connection.execute(
            "INSERT INTO runtime_events(task_id,sequence,event_id,event_type,payload_json,occurred_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![event.task_id, sequence, event.event_id, event.event_type.as_str(), event.payload.to_string(), event.occurred_at],
        )?;
        self.events.push(event.clone());
        Ok(event)
    }

    pub fn after(&self, sequence: u64) -> Vec<EventEnvelope> {
        self.events
            .iter()
            .filter(|event| event.sequence > sequence)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_ordered_and_resume_after_a_cursor() {
        let mut log = EventLog::default();
        log.append(
            "task_1",
            EventType::TaskCreated,
            "2026-08-04T00:00:00Z",
            serde_json::json!({}),
        );
        log.append(
            "task_1",
            EventType::TaskStarted,
            "2026-08-04T00:00:01Z",
            serde_json::json!({}),
        );

        let resumed = log.after(1);
        assert_eq!(resumed.len(), 1);
        assert_eq!(resumed[0].sequence, 2);
        assert_eq!(resumed[0].event_type, EventType::TaskStarted);
    }
}
