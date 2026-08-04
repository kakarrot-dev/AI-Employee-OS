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
            event_id: format!("event_{sequence}"),
            sequence,
            task_id: task_id.to_owned(),
            event_type,
            occurred_at: occurred_at.to_owned(),
            payload,
        };
        self.events.push(event.clone());
        event
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
