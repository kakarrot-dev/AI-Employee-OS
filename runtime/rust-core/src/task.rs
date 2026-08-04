#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TaskStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "running" => Some(Self::Running),
            "succeeded" => Some(Self::Succeeded),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TaskEvent {
    Start,
    Complete,
    Fail,
    Cancel,
}

#[derive(Debug, Eq, PartialEq)]
pub struct InvalidTransition {
    pub from: TaskStatus,
    pub event: TaskEvent,
}

impl TaskStatus {
    pub fn transition(self, event: TaskEvent) -> Result<Self, InvalidTransition> {
        match (self, event) {
            (Self::Pending, TaskEvent::Start) => Ok(Self::Running),
            (Self::Pending | Self::Running, TaskEvent::Cancel) => Ok(Self::Cancelled),
            (Self::Running, TaskEvent::Complete) => Ok(Self::Succeeded),
            (Self::Running, TaskEvent::Fail) => Ok(Self::Failed),
            _ => Err(InvalidTransition { from: self, event }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path_reaches_succeeded() {
        let running = TaskStatus::Pending.transition(TaskEvent::Start).unwrap();
        assert_eq!(
            running.transition(TaskEvent::Complete),
            Ok(TaskStatus::Succeeded)
        );
    }

    #[test]
    fn terminal_state_cannot_restart() {
        assert_eq!(
            TaskStatus::Succeeded.transition(TaskEvent::Start),
            Err(InvalidTransition {
                from: TaskStatus::Succeeded,
                event: TaskEvent::Start
            })
        );
    }
}
