use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum AgentDecision {
    AskUser {
        schema_version: String,
        question: String,
        required_input_schema: Value,
    },
    ToolCall {
        schema_version: String,
        skill_id: String,
        tool_id: String,
        action: String,
        arguments: Value,
        rationale_summary: String,
    },
    Complete {
        schema_version: String,
        output: Value,
        deliverable_candidates: Vec<Value>,
        evidence_refs: Vec<String>,
    },
}

impl AgentDecision {
    pub fn parse(value: Value) -> Result<Self, String> {
        for forbidden in [
            "call_id",
            "action_id",
            "idempotency_key",
            "permission_context",
            "approval_id",
            "deadline",
            "trace_id",
            "attempt",
        ] {
            if value.get(forbidden).is_some() {
                return Err(format!("decision_forbidden_field: {forbidden}"));
            }
        }
        let decision: Self = serde_json::from_value(value)
            .map_err(|error| format!("decision_schema_invalid: {error}"))?;
        let version = match &decision {
            Self::AskUser { schema_version, .. }
            | Self::ToolCall { schema_version, .. }
            | Self::Complete { schema_version, .. } => schema_version,
        };
        if version != "1.0.0" {
            return Err("decision_schema_invalid: unsupported schema_version".to_owned());
        }
        Ok(decision)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_model_owned_security_fields() {
        let value = serde_json::json!({
            "schema_version":"1.0.0", "type":"tool_call", "skill_id":"local-file-operations", "tool_id":"file-tool",
            "action":"read_file", "arguments":{}, "rationale_summary":"read",
            "call_id":"model-owned"
        });
        assert!(
            AgentDecision::parse(value)
                .unwrap_err()
                .contains("decision_forbidden_field")
        );
    }

    #[test]
    fn rejects_unsupported_worker_schema_version() {
        let value = serde_json::json!({
            "schema_version":"2.0.0", "type":"complete", "output":{},
            "deliverable_candidates":[], "evidence_refs":[]
        });
        assert_eq!(
            AgentDecision::parse(value).unwrap_err(),
            "decision_schema_invalid: unsupported schema_version"
        );
    }
}
