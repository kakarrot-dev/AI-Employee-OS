use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolCall {
    pub schema_version: String,
    pub call_id: String,
    pub task_id: String,
    pub action_id: String,
    pub agent_id: String,
    pub tool_id: String,
    pub tool_version: String,
    pub action: String,
    pub arguments: Value,
    pub idempotency_key: String,
    pub permission_context: PermissionContext,
    pub approval_id: Option<String>,
    pub deadline: String,
    pub trace_id: String,
    pub attempt: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PermissionContext {
    pub grant_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolResultStatus {
    Succeeded,
    Failed,
    Blocked,
    ResultUnknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SideEffectState {
    None,
    NotStarted,
    Confirmed,
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
pub struct ToolError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct ToolResult {
    pub schema_version: &'static str,
    pub call_id: String,
    pub status: ToolResultStatus,
    pub output: Option<Value>,
    pub error: Option<ToolError>,
    pub side_effect_state: SideEffectState,
    pub verification: Option<Value>,
    pub artifacts: Vec<Value>,
    pub result_ref: Option<String>,
    pub started_at: String,
    pub finished_at: String,
    pub duration_ms: u64,
    pub trace_id: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ToolManifestSnapshot {
    pub schema_version: String,
    pub tool: ToolDefinition,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ToolDefinition {
    pub id: String,
    pub version: String,
    pub runtime: String,
    pub actions: Vec<ToolAction>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ToolAction {
    pub name: String,
    pub input_schema: Value,
    pub output_schema: Value,
    pub required_permissions: Vec<String>,
    pub risk_level: u8,
    pub side_effect: String,
    pub confirmation: String,
    pub timeout_ms: u64,
    pub result_size_limit: u64,
    pub sensitive_fields: Vec<String>,
}
