#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActionStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Blocked,
    ResultUnknown,
    Cancelled,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActionEvent {
    Start,
    Succeed,
    Fail,
    Block,
    MarkResultUnknown,
    Resume,
    ResolveSucceeded,
    ResolveFailed,
    Cancel,
}

#[derive(Debug, Eq, PartialEq)]
pub struct InvalidTransition {
    pub from: ActionStatus,
    pub event: ActionEvent,
}

impl ActionStatus {
    pub fn transition(self, event: ActionEvent) -> Result<Self, InvalidTransition> {
        match (self, event) {
            (Self::Pending, ActionEvent::Start) => Ok(Self::Running),
            (Self::Pending | Self::Running, ActionEvent::Block) => Ok(Self::Blocked),
            (Self::Blocked, ActionEvent::Resume) => Ok(Self::Pending),
            (Self::Running, ActionEvent::Succeed) => Ok(Self::Succeeded),
            (Self::Running, ActionEvent::Fail) => Ok(Self::Failed),
            (Self::Running, ActionEvent::MarkResultUnknown) => Ok(Self::ResultUnknown),
            (Self::ResultUnknown, ActionEvent::ResolveSucceeded) => Ok(Self::Succeeded),
            (Self::ResultUnknown, ActionEvent::ResolveFailed) => Ok(Self::Failed),
            (Self::Pending | Self::Running | Self::Blocked, ActionEvent::Cancel) => {
                Ok(Self::Cancelled)
            }
            _ => Err(InvalidTransition { from: self, event }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approval_block_can_resume_to_pending() {
        let blocked = ActionStatus::Pending
            .transition(ActionEvent::Block)
            .unwrap();
        assert_eq!(
            blocked.transition(ActionEvent::Resume),
            Ok(ActionStatus::Pending)
        );
    }

    #[test]
    fn result_unknown_requires_explicit_resolution() {
        let unknown = ActionStatus::Running
            .transition(ActionEvent::MarkResultUnknown)
            .unwrap();
        assert!(unknown.transition(ActionEvent::Start).is_err());
        assert_eq!(
            unknown.transition(ActionEvent::ResolveSucceeded),
            Ok(ActionStatus::Succeeded)
        );
    }

    #[test]
    fn terminal_action_cannot_restart() {
        assert!(
            ActionStatus::Succeeded
                .transition(ActionEvent::Start)
                .is_err()
        );
        assert!(ActionStatus::Failed.transition(ActionEvent::Start).is_err());
        assert!(
            ActionStatus::Cancelled
                .transition(ActionEvent::Start)
                .is_err()
        );
    }
}
