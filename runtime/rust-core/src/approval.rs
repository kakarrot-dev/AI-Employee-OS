#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
    Expired,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApprovalEvent {
    Approve,
    Reject,
    Expire,
}

#[derive(Debug, Eq, PartialEq)]
pub struct InvalidTransition {
    pub from: ApprovalStatus,
    pub event: ApprovalEvent,
}

impl ApprovalStatus {
    pub fn transition(self, event: ApprovalEvent) -> Result<Self, InvalidTransition> {
        match (self, event) {
            (Self::Pending, ApprovalEvent::Approve) => Ok(Self::Approved),
            (Self::Pending, ApprovalEvent::Reject) => Ok(Self::Rejected),
            (Self::Pending, ApprovalEvent::Expire) => Ok(Self::Expired),
            _ => Err(InvalidTransition { from: self, event }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_approval_has_exactly_one_terminal_resolution() {
        for event in [
            ApprovalEvent::Approve,
            ApprovalEvent::Reject,
            ApprovalEvent::Expire,
        ] {
            let resolved = ApprovalStatus::Pending.transition(event).unwrap();
            assert!(resolved.transition(ApprovalEvent::Approve).is_err());
        }
    }
}
