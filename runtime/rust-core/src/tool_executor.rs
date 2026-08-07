use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    os::fd::{AsRawFd, FromRawFd},
    os::unix::ffi::OsStrExt,
    os::unix::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    process::Command,
    sync::mpsc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};

use crate::tool::{
    SideEffectState, ToolAction, ToolCall, ToolError, ToolManifestSnapshot, ToolResult,
    ToolResultStatus,
};

pub struct ToolExecutor<'a> {
    connection: &'a mut Connection,
}

impl<'a> ToolExecutor<'a> {
    pub fn new(connection: &'a mut Connection) -> Self {
        Self { connection }
    }

    pub fn grant_ephemeral(
        &self,
        id: &str,
        task_id: &str,
        action_id: &str,
        agent_id: &str,
        resource: &Path,
        action: &str,
        expires_at: &str,
    ) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO scoped_permission_grants VALUES
                 (?1,?2,?3,?4,?5,?6,?7,NULL,strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
                params![
                    id,
                    task_id,
                    action_id,
                    agent_id,
                    resource.to_string_lossy(),
                    action,
                    expires_at
                ],
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    pub fn execute(&mut self, call: &ToolCall, now: &str) -> ToolResult {
        if call.schema_version != "1.0" {
            return self.reject(call, now, "INVALID_ARGUMENT", "unsupported schema_version");
        }
        let manifest = match self.resolve_manifest(call) {
            Ok(value) => value,
            Err((code, message)) => return self.reject(call, now, code, &message),
        };
        let action = match manifest
            .tool
            .actions
            .iter()
            .find(|item| item.name == call.action)
        {
            Some(value) => value,
            None => return self.reject(call, now, "ACTION_NOT_FOUND", "action is not registered"),
        };
        if now > call.deadline.as_str() {
            return self.reject(call, now, "TIMEOUT", "tool call deadline has elapsed");
        }
        if let Err(message) = validate_schema(&action.input_schema, &call.arguments, "$") {
            return self.reject(call, now, "INVALID_ARGUMENT", &message);
        }
        if let Err((code, message)) = self.validate_context(call, action, now) {
            return self.reject(call, now, code, &message);
        }
        if let Err((code, message)) = self.begin_execution(call, action, now) {
            return self.reject(call, now, code, &message);
        }

        let authorized_root = action
            .required_permissions
            .first()
            .and_then(|permission| self.authorized_resource(call, permission, now).ok());
        let execution = execute_native_with_timeout(call, action, authorized_root);
        match execution {
            Ok((output, side_effect_state)) => {
                if let Err(message) = validate_schema(&action.output_schema, &output, "$") {
                    let result = failed_result(
                        call,
                        now,
                        "OUTPUT_SCHEMA_INVALID",
                        &message,
                        side_effect_state,
                    );
                    return self.persist_or_unknown(call, result, now);
                }
                let result = ToolResult {
                    schema_version: "1.0",
                    call_id: call.call_id.clone(),
                    status: ToolResultStatus::Succeeded,
                    output: Some(output),
                    error: None,
                    side_effect_state,
                    verification: None,
                    artifacts: vec![],
                    result_ref: None,
                    started_at: now.to_owned(),
                    finished_at: now.to_owned(),
                    duration_ms: 0,
                    trace_id: call.trace_id.clone(),
                };
                self.persist_or_unknown(call, result, now)
            }
            Err((code, message, side_effect_state)) => {
                let status = if side_effect_state == SideEffectState::Unknown {
                    ToolResultStatus::ResultUnknown
                } else {
                    ToolResultStatus::Failed
                };
                let result = ToolResult {
                    schema_version: "1.0",
                    call_id: call.call_id.clone(),
                    status,
                    output: None,
                    error: Some(ToolError {
                        code: code.to_owned(),
                        message,
                        retryable: false,
                    }),
                    side_effect_state,
                    verification: None,
                    artifacts: vec![],
                    result_ref: None,
                    started_at: now.to_owned(),
                    finished_at: now.to_owned(),
                    duration_ms: 0,
                    trace_id: call.trace_id.clone(),
                };
                self.persist_or_unknown(call, result, now)
            }
        }
    }

    fn resolve_manifest(
        &self,
        call: &ToolCall,
    ) -> Result<ToolManifestSnapshot, (&'static str, String)> {
        let row: Option<(String, String, String)> = self
            .connection
            .query_row(
                "SELECT version, manifest_json, status FROM tools WHERE id = ?1",
                [&call.tool_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
        let (version, manifest_json, status) =
            row.ok_or(("TOOL_NOT_FOUND", "tool is not installed".to_owned()))?;
        if status != "active" {
            return Err(("TOOL_NOT_FOUND", "tool is disabled".to_owned()));
        }
        if version != call.tool_version {
            return Err(("VERSION_MISMATCH", "tool version is not locked".to_owned()));
        }
        let manifest: ToolManifestSnapshot = serde_json::from_str(&manifest_json)
            .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
        if manifest.schema_version != "1.0.0"
            || manifest.tool.id != call.tool_id
            || manifest.tool.version != call.tool_version
            || manifest.tool.runtime != "rust-native-v1"
        {
            return Err(("VERSION_MISMATCH", "manifest snapshot mismatch".to_owned()));
        }
        Ok(manifest)
    }

    fn validate_context(
        &self,
        call: &ToolCall,
        action: &ToolAction,
        now: &str,
    ) -> Result<(), (&'static str, String)> {
        let relation_exists: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM actions a JOIN tasks t ON t.id = a.task_id
                   WHERE a.id = ?1 AND t.id = ?2 AND t.agent_id = ?3 AND a.tool_id = ?4
                 )",
                params![call.action_id, call.task_id, call.agent_id, call.tool_id],
                |row| row.get(0),
            )
            .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
        if !relation_exists {
            return Err((
                "INVALID_ARGUMENT",
                "task/action/agent/tool mismatch".to_owned(),
            ));
        }

        for required in &action.required_permissions {
            let denied: bool = self
                .connection
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM permissions
                       WHERE subject_type = 'agent' AND subject_id = ?1
                         AND action = ?2 AND effect = 'deny'
                     )",
                    params![call.agent_id, required],
                    |row| row.get(0),
                )
                .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
            if denied {
                return Err((
                    "PERMISSION_DENIED",
                    format!("explicit deny for permission {required}"),
                ));
            }
        }

        for required in &action.required_permissions {
            let granted = call.permission_context.grant_ids.iter().any(|grant_id| {
                let persistent = self
                    .connection
                    .query_row(
                        "SELECT EXISTS(
                           SELECT 1 FROM permissions
                           WHERE id = ?1 AND subject_type = 'agent' AND subject_id = ?2
                             AND action = ?3 AND effect = 'allow'
                         )",
                        params![grant_id, call.agent_id, required],
                        |row| row.get::<_, bool>(0),
                    )
                    .unwrap_or(false);
                persistent || self.has_ephemeral_grant(call, grant_id, required, now)
            });
            if !granted {
                return Err((
                    "PERMISSION_DENIED",
                    format!("missing permission {required}"),
                ));
            }
        }

        if action.risk_level >= 2 {
            let approval_id = call
                .approval_id
                .as_ref()
                .ok_or(("APPROVAL_REQUIRED", "approval is required".to_owned()))?;
            let approved: bool = self
                .connection
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM approvals
                       WHERE id = ?1 AND task_id = ?2 AND agent_id = ?3
                         AND action = ?4 AND status = 'approved'
                     )",
                    params![approval_id, call.task_id, call.agent_id, call.action],
                    |row| row.get(0),
                )
                .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
            if !approved {
                return Err(("APPROVAL_REJECTED", "approval is not valid".to_owned()));
            }
        }
        Ok(())
    }

    fn authorized_resource(
        &self,
        call: &ToolCall,
        required: &str,
        now: &str,
    ) -> Result<PathBuf, (&'static str, String)> {
        for grant_id in &call.permission_context.grant_ids {
            let resource: Option<String> = self
                .connection
                .query_row(
                    "SELECT resource FROM permissions
                     WHERE id = ?1 AND subject_type = 'agent' AND subject_id = ?2
                       AND action = ?3 AND effect = 'allow'",
                    params![grant_id, call.agent_id, required],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
            if let Some(resource) = resource {
                return Ok(PathBuf::from(resource));
            }
            let resource: Option<String> = self
                .connection
                .query_row(
                    "SELECT resource FROM scoped_permission_grants
                     WHERE id=?1 AND task_id=?2 AND action_id=?3 AND subject_id=?4
                       AND action=?5 AND consumed_at IS NULL AND expires_at>=?6",
                    params![
                        grant_id,
                        call.task_id,
                        call.action_id,
                        call.agent_id,
                        required,
                        now
                    ],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
            if let Some(resource) = resource {
                return Ok(PathBuf::from(resource));
            }
        }
        Err((
            "PERMISSION_DENIED",
            format!("missing permission {required}"),
        ))
    }

    fn has_ephemeral_grant(
        &self,
        call: &ToolCall,
        grant_id: &str,
        required: &str,
        now: &str,
    ) -> bool {
        self.connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM scoped_permission_grants
                   WHERE id=?1 AND task_id=?2 AND action_id=?3 AND subject_id=?4
                     AND action=?5 AND consumed_at IS NULL AND expires_at>=?6
                 )",
                params![
                    grant_id,
                    call.task_id,
                    call.action_id,
                    call.agent_id,
                    required,
                    now
                ],
                |row| row.get(0),
            )
            .unwrap_or(false)
    }

    fn begin_execution(
        &mut self,
        call: &ToolCall,
        action: &ToolAction,
        now: &str,
    ) -> Result<(), (&'static str, String)> {
        let duplicate: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tool_executions WHERE idempotency_key=?1)",
                [&call.idempotency_key],
                |row| row.get(0),
            )
            .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
        if duplicate {
            return Err(("RESULT_UNKNOWN", "duplicate execution attempt".to_owned()));
        }
        let action_running: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM actions WHERE id=?1 AND status='running')",
                [&call.action_id],
                |row| row.get(0),
            )
            .map_err(|error| ("EXECUTION_FAILED", error.to_string()))?;
        if !action_running {
            return Err(("INVALID_ARGUMENT", "action is not running".to_owned()));
        }
        let side_effect_state = if action.side_effect == "none" {
            "none"
        } else {
            "not_started"
        };
        self.connection
            .execute(
                "INSERT INTO tool_executions (
                   call_id, action_id, idempotency_key, attempt, status, side_effect_state,
                   result_json, started_at, finished_at, trace_id
                 ) VALUES (?1, ?2, ?3, ?4, 'running', ?5, NULL, ?6, NULL, ?7)",
                params![
                    call.call_id,
                    call.action_id,
                    call.idempotency_key,
                    call.attempt,
                    side_effect_state,
                    now,
                    call.trace_id
                ],
            )
            .map_err(|error| {
                if error.to_string().contains("UNIQUE constraint failed") {
                    ("RESULT_UNKNOWN", "duplicate execution attempt".to_owned())
                } else {
                    ("EXECUTION_FAILED", error.to_string())
                }
            })?;
        Ok(())
    }

    fn persist_or_unknown(&mut self, call: &ToolCall, result: ToolResult, now: &str) -> ToolResult {
        match self.finish(call, &result, now) {
            Ok(()) => result,
            Err(message) => {
                let unknown = failed_result(
                    call,
                    now,
                    "RESULT_UNKNOWN",
                    &format!("could not persist verified result: {message}"),
                    SideEffectState::Unknown,
                );
                if let Err(evidence_error) = self.persist_unknown_evidence(call, &unknown, now) {
                    let mut unpersisted = unknown;
                    unpersisted.error = Some(ToolError {
                        code: "DURABILITY_FAILURE".to_owned(),
                        message: format!(
                            "result is unknown and durable evidence could not be written: {evidence_error}"
                        ),
                        retryable: false,
                    });
                    unpersisted.verification = Some(json!({"durable": false}));
                    return unpersisted;
                }
                unknown
            }
        }
    }

    fn persist_unknown_evidence(
        &mut self,
        call: &ToolCall,
        result: &ToolResult,
        now: &str,
    ) -> rusqlite::Result<()> {
        let result_json = serde_json::to_string(result).ok();
        let transaction = self.connection.transaction()?;
        let execution_updated = transaction.execute(
            "UPDATE tool_executions SET status='result_unknown', side_effect_state='unknown',
             result_json=?1, finished_at=?2 WHERE call_id=?3 AND status='running'",
            params![result_json, now, call.call_id],
        )?;
        if execution_updated != 1 {
            let equivalent: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM tool_executions
                 WHERE call_id=?1 AND status='result_unknown' AND side_effect_state='unknown')",
                [&call.call_id],
                |row| row.get(0),
            )?;
            if !equivalent {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
        }
        let action_updated = transaction.execute(
            "UPDATE actions SET status='result_unknown', updated_at=?1
             WHERE id=?2 AND status IN ('running','cancelled')",
            params![now, call.action_id],
        )?;
        if action_updated == 0 {
            let reviewable_terminal: bool = transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM actions
                 WHERE id=?1 AND status='result_unknown')",
                [&call.action_id],
                |row| row.get(0),
            )?;
            if !reviewable_terminal {
                return Err(rusqlite::Error::QueryReturnedNoRows);
            }
        }
        transaction.execute(
            "INSERT OR IGNORE INTO audit_logs (
               id, agent_id, task_id, approval_id, action, resource, result, created_at
             ) VALUES (?1,?2,?3,?4,?5,'redacted','result_unknown',?6)",
            params![
                format!("audit_unknown_{}", call.call_id),
                call.agent_id,
                call.task_id,
                call.approval_id,
                call.action,
                now
            ],
        )?;
        transaction.commit()
    }

    fn finish(&mut self, call: &ToolCall, result: &ToolResult, now: &str) -> rusqlite::Result<()> {
        let status = match result.status {
            ToolResultStatus::Succeeded => "succeeded",
            ToolResultStatus::Failed => "failed",
            ToolResultStatus::Blocked => "blocked",
            ToolResultStatus::ResultUnknown => "result_unknown",
        };
        let side_effect = match result.side_effect_state {
            SideEffectState::None => "none",
            SideEffectState::NotStarted => "not_started",
            SideEffectState::Confirmed => "confirmed",
            SideEffectState::Unknown => "unknown",
        };
        let result_json = serde_json::to_string(result).ok();
        let action_output = result
            .output
            .as_ref()
            .and_then(|output| serde_json::to_string(output).ok());
        let transaction = self.connection.transaction()?;
        let execution_updated = transaction.execute(
            "UPDATE tool_executions SET status = ?1, side_effect_state = ?2,
                   result_json = ?3, finished_at = ?4 WHERE call_id = ?5",
            params![status, side_effect, result_json, now, call.call_id],
        )?;
        if execution_updated != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        let action_updated = transaction.execute(
            "UPDATE actions SET status = ?1, output_json = ?2, updated_at = ?3 WHERE id = ?4 AND status='running'",
            params![status, action_output, now, call.action_id],
        )?;
        if action_updated != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        transaction.execute(
            "UPDATE scoped_permission_grants SET consumed_at=?1
             WHERE task_id=?2 AND action_id=?3 AND consumed_at IS NULL",
            params![now, call.task_id, call.action_id],
        )?;
        transaction.execute(
            "INSERT INTO audit_logs (
                   id, agent_id, task_id, approval_id, action, resource, result, created_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                format!("audit_{}", call.call_id),
                call.agent_id,
                call.task_id,
                call.approval_id,
                call.action,
                "redacted",
                status,
                now
            ],
        )?;
        transaction.commit()
    }

    fn reject(&mut self, call: &ToolCall, now: &str, code: &str, message: &str) -> ToolResult {
        let status = if matches!(code, "APPROVAL_REQUIRED" | "APPROVAL_REJECTED") {
            ToolResultStatus::Blocked
        } else if code == "RESULT_UNKNOWN" {
            ToolResultStatus::ResultUnknown
        } else {
            ToolResultStatus::Failed
        };
        let result = ToolResult {
            schema_version: "1.0",
            call_id: call.call_id.clone(),
            status,
            output: None,
            error: Some(ToolError {
                code: code.to_owned(),
                message: message.to_owned(),
                retryable: false,
            }),
            side_effect_state: if status == ToolResultStatus::ResultUnknown {
                SideEffectState::Unknown
            } else {
                SideEffectState::NotStarted
            },
            verification: None,
            artifacts: vec![],
            result_ref: None,
            started_at: now.to_owned(),
            finished_at: now.to_owned(),
            duration_ms: 0,
            trace_id: call.trace_id.clone(),
        };
        let action_status = match status {
            ToolResultStatus::Blocked => "blocked",
            ToolResultStatus::ResultUnknown => "result_unknown",
            ToolResultStatus::Failed => "failed",
            ToolResultStatus::Succeeded => "succeeded",
        };
        let _ = self.connection.execute(
            "UPDATE actions SET status = ?1, updated_at = ?2 WHERE id = ?3 AND status='running'",
            params![action_status, now, call.action_id],
        );
        let _ = self.connection.execute(
            "INSERT INTO audit_logs (
               id, agent_id, task_id, approval_id, action, resource, result, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'redacted', ?6, ?7)",
            params![
                format!("audit_{}_rejected", call.call_id),
                call.agent_id,
                call.task_id,
                call.approval_id,
                call.action,
                code,
                now
            ],
        );
        result
    }
}

fn failed_result(
    call: &ToolCall,
    now: &str,
    code: &str,
    message: &str,
    side_effect_state: SideEffectState,
) -> ToolResult {
    ToolResult {
        schema_version: "1.0",
        call_id: call.call_id.clone(),
        status: if code == "RESULT_UNKNOWN" {
            ToolResultStatus::ResultUnknown
        } else {
            ToolResultStatus::Failed
        },
        output: None,
        error: Some(ToolError {
            code: code.to_owned(),
            message: message.to_owned(),
            retryable: false,
        }),
        side_effect_state,
        verification: None,
        artifacts: vec![],
        result_ref: None,
        started_at: now.to_owned(),
        finished_at: now.to_owned(),
        duration_ms: 0,
        trace_id: call.trace_id.clone(),
    }
}

fn validate_schema(schema: &Value, value: &Value, path: &str) -> Result<(), String> {
    if let Some(expected) = schema.get("type").and_then(Value::as_str) {
        let valid = match expected {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
            "number" => value.is_number(),
            "boolean" => value.is_boolean(),
            "null" => value.is_null(),
            _ => false,
        };
        if !valid {
            return Err(format!("{path}: expected {expected}"));
        }
    }
    if let Some(allowed) = schema.get("enum").and_then(Value::as_array) {
        if !allowed.contains(value) {
            return Err(format!("{path}: unsupported value"));
        }
    }
    if let Some(object) = value.as_object() {
        let properties = schema.get("properties").and_then(Value::as_object);
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for field in required.iter().filter_map(Value::as_str) {
                if !object.contains_key(field) {
                    return Err(format!("{path}: missing required field {field}"));
                }
            }
        }
        if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
            let allowed = properties
                .ok_or_else(|| format!("{path}: closed object schema must declare properties"))?;
            if let Some(field) = object.keys().find(|field| !allowed.contains_key(*field)) {
                return Err(format!("{path}: unknown field {field}"));
            }
        }
        if let Some(properties) = properties {
            for (field, field_schema) in properties {
                if let Some(field_value) = object.get(field) {
                    validate_schema(field_schema, field_value, &format!("{path}.{field}"))?;
                }
            }
        }
    }
    if let Some(items) = value.as_array() {
        if let Some(item_schema) = schema.get("items") {
            for (index, item) in items.iter().enumerate() {
                validate_schema(item_schema, item, &format!("{path}[{index}]"))?;
            }
        }
    }
    Ok(())
}

type NativeExecution = Result<(Value, SideEffectState), (&'static str, String, SideEffectState)>;

fn execute_native_with_timeout(
    call: &ToolCall,
    action: &ToolAction,
    authorized_root: Option<PathBuf>,
) -> NativeExecution {
    let root = authorized_root.ok_or((
        "PERMISSION_DENIED",
        "authorized resource is missing".to_owned(),
        SideEffectState::NotStarted,
    ))?;
    let tool_id = call.tool_id.clone();
    let action_name = call.action.clone();
    let arguments = call.arguments.clone();
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let result = match (tool_id.as_str(), action_name.as_str()) {
            ("file-tool", "read_file") => read_file(&arguments, &root),
            ("file-tool", "create_file") => create_file(&arguments, &root),
            ("file-tool", "edit_file") => edit_file(&arguments, &root),
            ("document-tool", "create_markdown") => create_markdown(&arguments, &root),
            ("agent-reach-tool", "search_web") => search_web(&arguments),
            #[cfg(test)]
            ("document-tool", "slow_write") => {
                std::thread::sleep(Duration::from_millis(20));
                Ok((json!({"path": "late.md"}), SideEffectState::Confirmed))
            }
            _ => Err((
                "ACTION_NOT_FOUND",
                "no native adapter is registered".to_owned(),
                SideEffectState::NotStarted,
            )),
        };
        let _ = sender.send(result);
    });
    match receiver.recv_timeout(Duration::from_millis(action.timeout_ms)) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) if action.side_effect == "none" => Err((
            "TIMEOUT",
            "tool execution exceeded timeout_ms".to_owned(),
            SideEffectState::None,
        )),
        Err(mpsc::RecvTimeoutError::Timeout) => Err((
            "RESULT_UNKNOWN",
            "side-effecting tool exceeded timeout_ms".to_owned(),
            SideEffectState::Unknown,
        )),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err((
            "EXECUTION_FAILED",
            "native tool worker disconnected".to_owned(),
            SideEffectState::Unknown,
        )),
    }
}

fn requested_path(arguments: &Value) -> Result<&Path, (&'static str, String, SideEffectState)> {
    let path = arguments.get("path").and_then(Value::as_str).ok_or((
        "INVALID_ARGUMENT",
        "path is required".to_owned(),
        SideEffectState::NotStarted,
    ))?;
    Ok(Path::new(path))
}

fn read_file(
    arguments: &Value,
    root: &Path,
) -> Result<(Value, SideEffectState), (&'static str, String, SideEffectState)> {
    let path = requested_path(arguments)?;
    let canonical_root = root
        .canonicalize()
        .map_err(|error| ("INVALID_ARGUMENT", error.to_string(), SideEffectState::None))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| ("EXECUTION_FAILED", error.to_string(), SideEffectState::None))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err((
            "PERMISSION_DENIED",
            "path is outside authorized root".to_owned(),
            SideEffectState::None,
        ));
    }
    let content = fs::read_to_string(canonical_path)
        .map_err(|error| ("EXECUTION_FAILED", error.to_string(), SideEffectState::None))?;
    Ok((json!({"content": content}), SideEffectState::None))
}

fn create_file(
    arguments: &Value,
    root: &Path,
) -> Result<(Value, SideEffectState), (&'static str, String, SideEffectState)> {
    let path = requested_path(arguments)?;
    let content = required_string(arguments, "content")?;
    let (directory, leaf_name) = writable_parent(root, path)?;
    let destination = std::ffi::CString::new(leaf_name.as_bytes()).map_err(|error| {
        (
            "INVALID_ARGUMENT",
            error.to_string(),
            SideEffectState::NotStarted,
        )
    })?;
    let descriptor = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            destination.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            0o600,
        )
    };
    if descriptor < 0 {
        let error = std::io::Error::last_os_error();
        let code = if error.kind() == std::io::ErrorKind::AlreadyExists {
            "ALREADY_EXISTS"
        } else {
            "EXECUTION_FAILED"
        };
        return Err((code, error.to_string(), SideEffectState::NotStarted));
    }
    let mut file = unsafe { File::from_raw_fd(descriptor) };
    if let Err(error) = file
        .write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
        .and_then(|_| directory.sync_all())
    {
        return Err((
            "RESULT_UNKNOWN",
            error.to_string(),
            SideEffectState::Unknown,
        ));
    }
    Ok((
        json!({"path": path.to_string_lossy(), "bytes_written": content.len()}),
        SideEffectState::Confirmed,
    ))
}

fn edit_file(
    arguments: &Value,
    root: &Path,
) -> Result<(Value, SideEffectState), (&'static str, String, SideEffectState)> {
    let path = requested_path(arguments)?;
    let old_text = required_string(arguments, "old_text")?;
    let new_text = required_string(arguments, "new_text")?;
    if old_text.is_empty() {
        return Err((
            "INVALID_ARGUMENT",
            "old_text must not be empty".to_owned(),
            SideEffectState::NotStarted,
        ));
    }
    let canonical_root = root.canonicalize().map_err(|error| {
        (
            "INVALID_ARGUMENT",
            error.to_string(),
            SideEffectState::NotStarted,
        )
    })?;
    let canonical_path = path.canonicalize().map_err(|error| {
        (
            "EXECUTION_FAILED",
            error.to_string(),
            SideEffectState::NotStarted,
        )
    })?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err((
            "PERMISSION_DENIED",
            "path is outside authorized root".to_owned(),
            SideEffectState::NotStarted,
        ));
    }
    let content = fs::read_to_string(&canonical_path).map_err(|error| {
        (
            "EXECUTION_FAILED",
            error.to_string(),
            SideEffectState::NotStarted,
        )
    })?;
    if content.matches(old_text).count() != 1 {
        return Err((
            "EDIT_CONFLICT",
            "old_text must occur exactly once".to_owned(),
            SideEffectState::NotStarted,
        ));
    }
    let updated = content.replacen(old_text, new_text, 1);
    atomic_replace(root, path, updated.as_bytes())?;
    Ok((
        json!({"path": path.to_string_lossy(), "replacements": 1}),
        SideEffectState::Confirmed,
    ))
}

fn required_string<'a>(
    arguments: &'a Value,
    field: &str,
) -> Result<&'a str, (&'static str, String, SideEffectState)> {
    arguments.get(field).and_then(Value::as_str).ok_or((
        "INVALID_ARGUMENT",
        format!("{field} is required"),
        SideEffectState::NotStarted,
    ))
}

fn writable_parent(
    root: &Path,
    path: &Path,
) -> Result<(File, std::ffi::OsString), (&'static str, String, SideEffectState)> {
    open_parent_beneath(root, path).map_err(|error| {
        (
            "PERMISSION_DENIED",
            error.to_string(),
            SideEffectState::NotStarted,
        )
    })
}

fn atomic_replace(
    root: &Path,
    path: &Path,
    content: &[u8],
) -> Result<(), (&'static str, String, SideEffectState)> {
    let (directory, leaf_name) = writable_parent(root, path)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            (
                "EXECUTION_FAILED",
                error.to_string(),
                SideEffectState::NotStarted,
            )
        })?
        .as_nanos();
    let name = path.file_name().and_then(|value| value.to_str()).ok_or((
        "INVALID_ARGUMENT",
        "file path has no valid file name".to_owned(),
        SideEffectState::NotStarted,
    ))?;
    let temporary_name = format!(".{name}.{}-{nonce}.tmp", std::process::id());
    let write_result = (|| -> std::io::Result<()> {
        let temporary = std::ffi::CString::new(temporary_name.as_bytes())?;
        let destination = std::ffi::CString::new(leaf_name.as_bytes())?;
        let descriptor = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                temporary.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                0o600,
            )
        };
        if descriptor < 0 {
            return Err(std::io::Error::last_os_error());
        }
        let mut file = unsafe { File::from_raw_fd(descriptor) };
        file.write_all(content)?;
        file.sync_all()?;
        let renamed = unsafe {
            libc::renameat(
                directory.as_raw_fd(),
                temporary.as_ptr(),
                directory.as_raw_fd(),
                destination.as_ptr(),
            )
        };
        if renamed != 0 {
            unsafe {
                libc::unlinkat(directory.as_raw_fd(), temporary.as_ptr(), 0);
            }
            return Err(std::io::Error::last_os_error());
        }
        directory.sync_all()
    })();
    write_result.map_err(|error| {
        (
            "RESULT_UNKNOWN",
            error.to_string(),
            SideEffectState::Unknown,
        )
    })
}

fn search_web(
    arguments: &Value,
) -> Result<(Value, SideEffectState), (&'static str, String, SideEffectState)> {
    let query = required_string(arguments, "query")?;
    if query.trim().is_empty() {
        return Err((
            "INVALID_ARGUMENT",
            "query must not be empty".to_owned(),
            SideEffectState::None,
        ));
    }
    let num_results = arguments
        .get("num_results")
        .and_then(Value::as_u64)
        .unwrap_or(5);
    if !(1..=10).contains(&num_results) {
        return Err((
            "INVALID_ARGUMENT",
            "num_results must be between 1 and 10".to_owned(),
            SideEffectState::None,
        ));
    }
    let payload = json!({"query": query, "numResults": num_results}).to_string();
    let output = Command::new(mcporter_executable())
        .args([
            "--log-level",
            "error",
            "call",
            "exa.web_search_exa",
            "--args",
            &payload,
            "--timeout",
            "25000",
            "--output",
            "json",
            "--no-oauth",
        ])
        .output()
        .map_err(|error| {
            (
                "DEPENDENCY_UNAVAILABLE",
                format!("could not start Agent Reach search backend: {error}"),
                SideEffectState::None,
            )
        })?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr);
        return Err((
            "SEARCH_FAILED",
            message.trim().chars().take(4096).collect(),
            SideEffectState::None,
        ));
    }
    let content = String::from_utf8(output.stdout).map_err(|error| {
        (
            "SEARCH_FAILED",
            format!("search backend returned non-UTF-8 output: {error}"),
            SideEffectState::None,
        )
    })?;
    if content.len() > 1_048_576 {
        return Err((
            "RESULT_TOO_LARGE",
            "search result exceeded 1 MiB".to_owned(),
            SideEffectState::None,
        ));
    }
    Ok((
        json!({"provider": "agent-reach/exa", "content": content}),
        SideEffectState::None,
    ))
}

fn mcporter_executable() -> PathBuf {
    if let Some(configured) = std::env::var_os("AI_EMPLOYEE_MCPORTER_PATH") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return path;
        }
    }
    for candidate in ["/opt/homebrew/bin/mcporter", "/usr/local/bin/mcporter"] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return path;
        }
    }
    PathBuf::from("mcporter")
}

fn create_markdown(
    arguments: &Value,
    root: &Path,
) -> Result<(Value, SideEffectState), (&'static str, String, SideEffectState)> {
    let path = requested_path(arguments)?;
    let content = arguments.get("content").and_then(Value::as_str).ok_or((
        "INVALID_ARGUMENT",
        "content is required".to_owned(),
        SideEffectState::NotStarted,
    ))?;
    if path.extension().and_then(|value| value.to_str()) != Some("md") {
        return Err((
            "INVALID_ARGUMENT",
            "document must use .md".to_owned(),
            SideEffectState::NotStarted,
        ));
    }
    let (directory, leaf_name) = open_parent_beneath(root, path).map_err(|error| {
        (
            "PERMISSION_DENIED",
            error.to_string(),
            SideEffectState::NotStarted,
        )
    })?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            (
                "EXECUTION_FAILED",
                error.to_string(),
                SideEffectState::NotStarted,
            )
        })?
        .as_nanos();
    let name = path.file_name().and_then(|value| value.to_str()).ok_or((
        "INVALID_ARGUMENT",
        "document path has no valid file name".to_owned(),
        SideEffectState::NotStarted,
    ))?;
    let temporary_name = format!(".{name}.{}-{nonce}.tmp", std::process::id());
    let write_result = (|| -> std::io::Result<()> {
        let temporary = std::ffi::CString::new(temporary_name.as_bytes())?;
        let destination = std::ffi::CString::new(leaf_name.as_bytes())?;
        let descriptor = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                temporary.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_NOFOLLOW | libc::O_CLOEXEC,
                0o600,
            )
        };
        if descriptor < 0 {
            return Err(std::io::Error::last_os_error());
        }
        let mut file = unsafe { File::from_raw_fd(descriptor) };
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        let renamed = unsafe {
            libc::renameat(
                directory.as_raw_fd(),
                temporary.as_ptr(),
                directory.as_raw_fd(),
                destination.as_ptr(),
            )
        };
        if renamed != 0 {
            unsafe {
                libc::unlinkat(directory.as_raw_fd(), temporary.as_ptr(), 0);
            }
            return Err(std::io::Error::last_os_error());
        }
        directory.sync_all()
    })();
    if let Err(error) = write_result {
        return Err((
            "RESULT_UNKNOWN",
            error.to_string(),
            SideEffectState::Unknown,
        ));
    }
    Ok((
        json!({"path": path.to_string_lossy()}),
        SideEffectState::Confirmed,
    ))
}

fn open_parent_beneath(root: &Path, path: &Path) -> std::io::Result<(File, std::ffi::OsString)> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| std::io::Error::other("path is outside authorized root"))?;
    let leaf = relative
        .file_name()
        .ok_or_else(|| std::io::Error::other("document path has no file name"))?
        .to_os_string();
    let parent = relative.parent().unwrap_or_else(|| Path::new(""));
    let mut directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(root)?;
    for component in parent.components() {
        let std::path::Component::Normal(name) = component else {
            return Err(std::io::Error::other("path contains an unsafe component"));
        };
        let name = std::ffi::CString::new(name.as_bytes())?;
        let descriptor = unsafe {
            libc::openat(
                directory.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
            )
        };
        if descriptor < 0 {
            return Err(std::io::Error::last_os_error());
        }
        directory = unsafe { File::from_raw_fd(descriptor) };
    }
    Ok((directory, leaf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;

    fn temp_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("ai-employee-{label}-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn setup(
        tool_id: &str,
        action: &str,
        permission: &str,
        risk_level: u8,
        root: &Path,
    ) -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let now = "2026-08-04T00:00:00Z";
        connection.execute(
            "INSERT INTO agents VALUES ('ai-product-manager', 'Alex', 'AI Product Manager', '/agents/alex', 'active', ?1, ?1)",
            [now],
        ).unwrap();
        let manifest = json!({
            "schema_version": "1.0.0",
            "tool": {
                "id": tool_id,
                "version": "1.0.0",
                "runtime": "rust-native-v1",
                "actions": [{
                    "name": action,
                    "input_schema": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": if tool_id == "file-tool" { json!(["path"]) } else { json!(["path", "content"]) },
                        "properties": if tool_id == "file-tool" {
                            json!({"path": {"type": "string"}})
                        } else {
                            json!({"path": {"type": "string"}, "content": {"type": "string"}})
                        }
                    },
                    "output_schema": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": if tool_id == "file-tool" { json!(["content"]) } else { json!(["path"]) },
                        "properties": if tool_id == "file-tool" {
                            json!({"content": {"type": "string"}})
                        } else {
                            json!({"path": {"type": "string"}})
                        }
                    },
                    "required_permissions": [permission],
                    "risk_level": risk_level,
                    "side_effect": if tool_id == "file-tool" { "none" } else { "reversible" },
                    "timeout_ms": 10000
                }]
            }
        });
        connection
            .execute(
                "INSERT INTO tools VALUES (?1, ?1, 'native', '1.0.0', ?2, 'active', ?3, ?3)",
                params![tool_id, manifest.to_string(), now],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task_1', 'ai-product-manager', 'test', 'running', ?1, ?1)",
            [now],
        ).unwrap();
        connection.execute(
            "INSERT INTO actions VALUES ('action_1', 'task_1', ?1, '{}', NULL, 'running', ?2, ?2)",
            params![tool_id, now],
        ).unwrap();
        connection.execute(
            "INSERT INTO permissions VALUES ('grant_1', 'agent', 'ai-product-manager', ?1, ?2, 'allow', ?3, ?3)",
            params![root.to_string_lossy(), permission, now],
        ).unwrap();
        connection
    }

    fn call(tool_id: &str, action: &str, arguments: Value) -> ToolCall {
        ToolCall {
            schema_version: "1.0".to_owned(),
            call_id: "call_1".to_owned(),
            task_id: "task_1".to_owned(),
            action_id: "action_1".to_owned(),
            agent_id: "ai-product-manager".to_owned(),
            tool_id: tool_id.to_owned(),
            tool_version: "1.0.0".to_owned(),
            action: action.to_owned(),
            arguments,
            idempotency_key: "task_1:action_1:1".to_owned(),
            permission_context: crate::tool::PermissionContext {
                grant_ids: vec!["grant_1".to_owned()],
            },
            approval_id: None,
            deadline: "2026-08-04T00:00:10Z".to_owned(),
            trace_id: "trace_1".to_owned(),
            attempt: 1,
        }
    }

    #[test]
    fn creates_new_file_and_refuses_overwrite() {
        let root = temp_root("create-file");
        let path = root.join("created.txt");
        let created = create_file(&json!({"path": path, "content": "hello"}), &root).unwrap();
        assert_eq!(created.0["bytes_written"], 5);
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");

        let duplicate =
            create_file(&json!({"path": path, "content": "replacement"}), &root).unwrap_err();
        assert_eq!(duplicate.0, "ALREADY_EXISTS");
        assert_eq!(fs::read_to_string(path).unwrap(), "hello");
    }

    #[test]
    fn edits_only_one_exact_occurrence() {
        let root = temp_root("edit-file");
        let path = root.join("edited.txt");
        fs::write(&path, "before and after").unwrap();
        let edited = edit_file(
            &json!({"path": path, "old_text": "before", "new_text": "after"}),
            &root,
        )
        .unwrap();
        assert_eq!(edited.0["replacements"], 1);
        assert_eq!(fs::read_to_string(&path).unwrap(), "after and after");

        let ambiguous = edit_file(
            &json!({"path": path, "old_text": "after", "new_text": "changed"}),
            &root,
        )
        .unwrap_err();
        assert_eq!(ambiguous.0, "EDIT_CONFLICT");
        assert_eq!(fs::read_to_string(path).unwrap(), "after and after");
    }

    #[test]
    fn file_mutations_reject_paths_outside_authorized_root() {
        let root = temp_root("file-boundary");
        let outside = temp_root("file-outside").join("outside.txt");
        let create_error =
            create_file(&json!({"path": outside, "content": "no"}), &root).unwrap_err();
        assert_eq!(create_error.0, "PERMISSION_DENIED");
    }

    #[test]
    fn reads_only_inside_the_database_authorized_root() {
        let root = temp_root("read");
        let inside = root.join("input.txt");
        fs::write(&inside, "evidence").unwrap();
        let mut connection = setup("file-tool", "read_file", "filesystem.read", 0, &root);
        let result = ToolExecutor::new(&mut connection).execute(
            &call("file-tool", "read_file", json!({"path": inside})),
            "2026-08-04T00:00:01Z",
        );
        assert_eq!(result.status, ToolResultStatus::Succeeded);
        assert_eq!(result.output, Some(json!({"content": "evidence"})));

        let execution_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM tool_executions WHERE status = 'succeeded'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let audit_count: i64 = connection
            .query_row("SELECT count(*) FROM audit_logs", [], |row| row.get(0))
            .unwrap();
        assert_eq!((execution_count, audit_count), (1, 1));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_path_escape_and_duplicate_idempotency_key() {
        let root = temp_root("scope");
        let outside_root = temp_root("outside");
        let outside = outside_root.join("secret.txt");
        fs::write(&outside, "secret").unwrap();
        let mut connection = setup("file-tool", "read_file", "filesystem.read", 0, &root);
        let first = call("file-tool", "read_file", json!({"path": outside}));
        let denied = ToolExecutor::new(&mut connection).execute(&first, "2026-08-04T00:00:01Z");
        assert_eq!(denied.status, ToolResultStatus::Failed);
        assert_eq!(denied.error.unwrap().code, "PERMISSION_DENIED");

        let mut duplicate = first;
        duplicate.call_id = "call_2".to_owned();
        duplicate.attempt = 2;
        let duplicate_result =
            ToolExecutor::new(&mut connection).execute(&duplicate, "2026-08-04T00:00:02Z");
        assert_eq!(duplicate_result.status, ToolResultStatus::ResultUnknown);
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside_root).unwrap();
    }

    #[test]
    fn blocks_high_risk_action_without_approval() {
        let root = temp_root("approval");
        let mut connection = setup(
            "document-tool",
            "create_markdown",
            "document.write",
            2,
            &root,
        );
        let result = ToolExecutor::new(&mut connection).execute(
            &call(
                "document-tool",
                "create_markdown",
                json!({"path": root.join("prd.md"), "content": "# PRD"}),
            ),
            "2026-08-04T00:00:01Z",
        );
        assert_eq!(result.status, ToolResultStatus::Blocked);
        assert_eq!(result.error.unwrap().code, "APPROVAL_REQUIRED");
        let action_status: String = connection
            .query_row(
                "SELECT status FROM actions WHERE id='action_1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(action_status, "blocked");
        assert!(!root.join("prd.md").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn approved_document_write_is_verified_and_audited() {
        let root = temp_root("document");
        let target = root.join("prd.md");
        let mut connection = setup(
            "document-tool",
            "create_markdown",
            "document.write",
            2,
            &root,
        );
        connection
            .execute(
                "INSERT INTO approvals VALUES (
               'approval_1', 'task_1', 'ai-product-manager', 'create_markdown',
               2, 'approved', ?1, ?1
             )",
                ["2026-08-04T00:00:00Z"],
            )
            .unwrap();
        let mut approved_call = call(
            "document-tool",
            "create_markdown",
            json!({"path": target, "content": "# PRD"}),
        );
        approved_call.approval_id = Some("approval_1".to_owned());
        let result =
            ToolExecutor::new(&mut connection).execute(&approved_call, "2026-08-04T00:00:01Z");
        assert_eq!(result.status, ToolResultStatus::Succeeded);
        assert_eq!(result.side_effect_state, SideEffectState::Confirmed);
        let (action_status, action_output): (String, String) = connection
            .query_row(
                "SELECT status, output_json FROM actions WHERE id='action_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(action_status, "succeeded");
        assert_eq!(
            serde_json::from_str::<Value>(&action_output).unwrap(),
            json!({"path": target})
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "# PRD");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn document_write_replaces_a_symlink_without_following_it() {
        use std::os::unix::fs::symlink;

        let root = temp_root("document-symlink");
        let outside_root = temp_root("document-symlink-outside");
        let outside = outside_root.join("outside.md");
        fs::write(&outside, "protected").unwrap();
        let target = root.join("prd.md");
        symlink(&outside, &target).unwrap();
        let mut connection = setup(
            "document-tool",
            "create_markdown",
            "document.write",
            0,
            &root,
        );
        let result = ToolExecutor::new(&mut connection).execute(
            &call(
                "document-tool",
                "create_markdown",
                json!({"path": target, "content": "# Safe"}),
            ),
            "2026-08-04T00:00:01Z",
        );
        assert_eq!(result.status, ToolResultStatus::Succeeded);
        assert_eq!(fs::read_to_string(&outside).unwrap(), "protected");
        assert_eq!(fs::read_to_string(root.join("prd.md")).unwrap(), "# Safe");
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside_root).unwrap();
    }

    #[test]
    fn finish_rejects_a_concurrent_terminal_action_change() {
        let root = temp_root("concurrent-action");
        let mut connection = setup("file-tool", "read_file", "filesystem.read", 0, &root);
        connection
            .execute(
                "INSERT INTO tool_executions VALUES ('call_1','action_1','task_1:action_1:1',1,'running','none',NULL,'t',NULL,'trace_1')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "UPDATE actions SET status='cancelled' WHERE id='action_1'",
                [],
            )
            .unwrap();
        let tool_call = call(
            "file-tool",
            "read_file",
            json!({"path": root.join("missing")}),
        );
        let result = ToolResult {
            schema_version: "1.0",
            call_id: "call_1".into(),
            status: ToolResultStatus::Succeeded,
            output: Some(json!({"content":"x"})),
            error: None,
            side_effect_state: SideEffectState::None,
            verification: None,
            artifacts: vec![],
            result_ref: None,
            started_at: "t".into(),
            finished_at: "t".into(),
            duration_ms: 0,
            trace_id: "trace_1".into(),
        };
        let persisted =
            ToolExecutor::new(&mut connection).persist_or_unknown(&tool_call, result, "t");
        assert_eq!(persisted.status, ToolResultStatus::ResultUnknown);
        let execution_status: String = connection
            .query_row(
                "SELECT status FROM tool_executions WHERE call_id='call_1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(execution_status, "result_unknown");
        let action_status: String = connection
            .query_row(
                "SELECT status FROM actions WHERE id='action_1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(action_status, "result_unknown");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn explicit_deny_wins_and_elapsed_deadline_fails_closed() {
        let root = temp_root("deny");
        let inside = root.join("input.txt");
        fs::write(&inside, "evidence").unwrap();
        let mut connection = setup("file-tool", "read_file", "filesystem.read", 0, &root);
        connection
            .execute(
                "INSERT INTO permissions VALUES (
               'deny_1', 'agent', 'ai-product-manager', ?1, 'filesystem.read',
               'deny', ?2, ?2
             )",
                params!["/", "2026-08-04T00:00:00Z"],
            )
            .unwrap();
        let denied = ToolExecutor::new(&mut connection).execute(
            &call("file-tool", "read_file", json!({"path": inside})),
            "2026-08-04T00:00:01Z",
        );
        assert_eq!(denied.error.unwrap().code, "PERMISSION_DENIED");

        connection
            .execute("DELETE FROM permissions WHERE effect = 'deny'", [])
            .unwrap();
        let mut expired = call("file-tool", "read_file", json!({"path": inside}));
        expired.call_id = "call_expired".to_owned();
        expired.deadline = "2026-08-04T00:00:00Z".to_owned();
        let timed_out =
            ToolExecutor::new(&mut connection).execute(&expired, "2026-08-04T00:00:01Z");
        assert_eq!(timed_out.error.unwrap().code, "TIMEOUT");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_nested_schema_type_mismatch() {
        let root = temp_root("schema");
        let mut connection = setup("file-tool", "read_file", "filesystem.read", 0, &root);
        let result = ToolExecutor::new(&mut connection).execute(
            &call("file-tool", "read_file", json!({"path": 42})),
            "2026-08-04T00:00:01Z",
        );
        assert_eq!(result.status, ToolResultStatus::Failed);
        assert_eq!(result.error.unwrap().code, "INVALID_ARGUMENT");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn side_effecting_timeout_becomes_result_unknown() {
        let root = temp_root("timeout");
        let mut connection = setup("document-tool", "slow_write", "document.write", 0, &root);
        let manifest_json: String = connection
            .query_row(
                "SELECT manifest_json FROM tools WHERE id = 'document-tool'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let mut manifest: Value = serde_json::from_str(&manifest_json).unwrap();
        manifest["tool"]["actions"][0]["timeout_ms"] = json!(1);
        connection
            .execute(
                "UPDATE tools SET manifest_json = ?1 WHERE id = 'document-tool'",
                [manifest.to_string()],
            )
            .unwrap();
        let result = ToolExecutor::new(&mut connection).execute(
            &call(
                "document-tool",
                "slow_write",
                json!({"path": root.join("late.md"), "content": "late"}),
            ),
            "2026-08-04T00:00:01Z",
        );
        assert_eq!(result.status, ToolResultStatus::ResultUnknown);
        assert_eq!(result.side_effect_state, SideEffectState::Unknown);
        let persisted: String = connection
            .query_row(
                "SELECT status FROM tool_executions WHERE call_id = 'call_1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(persisted, "result_unknown");
        fs::remove_dir_all(root).unwrap();
    }
}
