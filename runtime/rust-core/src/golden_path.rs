use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

use rusqlite::{Connection, params};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    agent::install_agent_package,
    evaluation::evaluate_prd_content,
    event::EventLog,
    skill_package::install_skill_package,
    storage::migrate,
    task::TaskEvent,
    task_service::{ExecutionSnapshot, TaskService, TaskServiceError},
    tool::{PermissionContext, ToolCall, ToolResultStatus},
    tool_executor::ToolExecutor,
    tool_package::install_tool_package,
};

pub struct GoldenPathConfig {
    pub repository_root: PathBuf,
    pub database: PathBuf,
    pub output_dir: PathBuf,
    pub python: PathBuf,
    pub task_input: String,
    pub approve_write: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct WorkerDecision {
    schema_version: String,
    #[serde(rename = "type")]
    kind: String,
    call_id: String,
    action: String,
    arguments: Value,
    idempotency_key: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct WorkerFinal {
    schema_version: String,
    #[serde(rename = "type")]
    kind: String,
    content: String,
    metrics: Value,
}

struct LockedExecution<'a> {
    task_id: &'a str,
    action_id: &'a str,
    approval_id: &'a str,
    permission_id: &'a str,
    call_id: &'a str,
    idempotency_key: &'a str,
    trace_id: &'a str,
    deadline: &'a str,
    artifact: &'a Path,
}

struct WorkerChild {
    child: Child,
}

impl WorkerChild {
    fn new(child: Child) -> Self {
        Self { child }
    }

    fn terminate(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for WorkerChild {
    fn drop(&mut self) {
        self.terminate();
    }
}

pub fn run(config: &GoldenPathConfig) -> Result<Value, String> {
    if !config.approve_write {
        return Err("document write requires explicit --approve-write".to_owned());
    }
    fs::create_dir_all(&config.output_dir).map_err(|error| error.to_string())?;
    let output_dir = config
        .output_dir
        .canonicalize()
        .map_err(|error| format!("invalid output directory: {error}"))?;
    let mut connection = Connection::open(&config.database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let now = runtime_now(&connection)?;
    install_packages(&mut connection, &config.repository_root, &now)?;

    let task_id = generated_id(&connection, "task")?;
    let action_id = generated_id(&connection, "action")?;
    let approval_id = generated_id(&connection, "approval")?;
    let permission_id = generated_id(&connection, "permission")?;
    let call_id = generated_id(&connection, "call")?;
    let trace_id = generated_id(&connection, "trace")?;
    let evaluation_id = generated_id(&connection, "evaluation")?;
    let deadline = runtime_deadline(&connection)?;
    let artifact = output_dir.join(format!("{task_id}.md"));

    let mut events = EventLog::default();
    start_task(
        &mut connection,
        &mut events,
        &task_id,
        &config.task_input,
        &now,
    )?;
    seed_execution(&connection, &task_id, &action_id, &approval_id, &now)?;
    ToolExecutor::new(&mut connection).grant_ephemeral(
        &permission_id,
        &task_id,
        &action_id,
        "ai-product-manager",
        &output_dir,
        "document.write",
        &deadline,
    )?;

    let idempotency_key = format!("{task_id}:{action_id}:1");
    let worker_request = json!({
        "schema_version": "1.0",
        "task_id": task_id,
        "task_input": config.task_input,
        "artifact_path": artifact,
        "call_id": call_id,
        "idempotency_key": idempotency_key,
        "trace_id": trace_id,
    });
    let locked = LockedExecution {
        task_id: &task_id,
        action_id: &action_id,
        approval_id: &approval_id,
        permission_id: &permission_id,
        call_id: &call_id,
        idempotency_key: &idempotency_key,
        trace_id: &trace_id,
        deadline: &deadline,
        artifact: &artifact,
    };
    let worker_metrics =
        match invoke_worker(config, &worker_request, &locked, &mut connection, &now) {
            Ok(metrics) => metrics,
            Err(error) => resolve_worker_failure(
                &mut connection,
                &mut events,
                &task_id,
                &action_id,
                &artifact,
                &now,
                error,
            )?,
        };

    let content = match fs::read_to_string(&artifact) {
        Ok(content) => content,
        Err(error) => {
            fail_running_task(&mut connection, &mut events, &task_id, &now)?;
            return Err(format!("could not read locked PRD artifact: {error}"));
        }
    };
    let outcome = evaluate_prd_content(&content);
    let completion = TaskService::new(&mut connection, &mut events).complete_with_evaluation(
        &task_id,
        &evaluation_id,
        &outcome,
        &now,
    );
    let final_task = match completion {
        Ok(task) => task,
        Err(TaskServiceError::EvaluationBlocked { score }) => {
            TaskService::new(&mut connection, &mut events)
                .transition(&task_id, TaskEvent::Fail, &now)
                .map_err(|error| format!("could not fail rejected task: {error:?}"))?;
            return Err(format!("evaluation blocked delivery with score {score}"));
        }
        Err(error) => {
            fail_running_task(&mut connection, &mut events, &task_id, &now)?;
            return Err(format!("could not complete task: {error:?}"));
        }
    };
    let event_values: Vec<Value> = events
        .after(0)
        .into_iter()
        .map(|event| {
            json!({
                "event_id": event.event_id,
                "sequence": event.sequence,
                "type": event.event_type.as_str(),
                "occurred_at": event.occurred_at,
                "payload": event.payload,
            })
        })
        .collect();
    Ok(json!({
        "schema_version": "1.0",
        "task_id": task_id,
        "status": final_task.status.as_str(),
        "artifact_path": artifact,
        "evaluation": {"score": outcome.score, "delivery_allowed": outcome.delivery_allowed},
        "worker_metrics": worker_metrics,
        "events": event_values,
    }))
}

fn fail_running_task(
    connection: &mut Connection,
    events: &mut EventLog,
    task_id: &str,
    now: &str,
) -> Result<(), String> {
    let status: String = connection
        .query_row("SELECT status FROM tasks WHERE id=?1", [task_id], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    if status == "running" {
        TaskService::new(connection, events)
            .transition(task_id, TaskEvent::Fail, now)
            .map_err(|error| format!("could not fail task: {error:?}"))?;
    }
    Ok(())
}

fn start_task(
    connection: &mut Connection,
    events: &mut EventLog,
    task_id: &str,
    task_input: &str,
    now: &str,
) -> Result<(), String> {
    let mut tasks = TaskService::new(connection, events);
    tasks
        .create(task_id, "ai-product-manager", task_input, now)
        .map_err(|error| format!("could not create task: {error:?}"))?;
    tasks
        .start_with_snapshot(
            task_id,
            ExecutionSnapshot {
                skill: r#"{"id":"prd-generation","version":"1.0.0"}"#,
                toolset: r#"[{"id":"document-tool","version":"1.0.0"}]"#,
                persona: r#"{"agent_id":"ai-product-manager"}"#,
                context_policy: r#"{"knowledge":"optional_for_golden_path"}"#,
                permissions: r#"["document.write"]"#,
                provider_config: r#"{"provider":"deterministic","network":false}"#,
            },
            now,
        )
        .map_err(|error| format!("could not start task: {error:?}"))?;
    Ok(())
}

fn invoke_worker(
    config: &GoldenPathConfig,
    request: &Value,
    locked: &LockedExecution<'_>,
    connection: &mut Connection,
    now: &str,
) -> Result<Value, String> {
    let profile = worker_sandbox_profile(
        &config.database,
        &config.repository_root.join("runtime/python-agent"),
        &config.python,
    )?;
    let child = Command::new("/usr/bin/sandbox-exec")
        .args(["-p", &profile])
        .arg(&config.python)
        .args(["-m", "app.worker"])
        .env(
            "PYTHONPATH",
            config.repository_root.join("runtime/python-agent"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("could not start Python worker: {error}"))?;
    let mut child = WorkerChild::new(child);
    let mut stdin = child.child.stdin.take().ok_or("worker stdin unavailable")?;
    let stdout = child
        .child
        .stdout
        .take()
        .ok_or("worker stdout unavailable")?;
    let (output_tx, output_rx) = mpsc::channel();
    thread::spawn(move || {
        let mut stdout = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match stdout.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if output_tx.send(line).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
    write_json_line(&mut stdin, request)?;

    let decision: WorkerDecision = receive_worker_json(&output_rx, &mut child.child)?;
    validate_decision(&decision, locked)?;
    let call = ToolCall {
        schema_version: "1.0".to_owned(),
        call_id: locked.call_id.to_owned(),
        task_id: locked.task_id.to_owned(),
        action_id: locked.action_id.to_owned(),
        agent_id: "ai-product-manager".to_owned(),
        tool_id: "document-tool".to_owned(),
        tool_version: "1.0.0".to_owned(),
        action: decision.action,
        arguments: decision.arguments,
        idempotency_key: decision.idempotency_key,
        permission_context: PermissionContext {
            grant_ids: vec![locked.permission_id.to_owned()],
        },
        approval_id: Some(locked.approval_id.to_owned()),
        deadline: locked.deadline.to_owned(),
        trace_id: locked.trace_id.to_owned(),
        attempt: 1,
    };
    let result = ToolExecutor::new(connection).execute(&call, now);
    write_json_line(
        &mut stdin,
        &serde_json::to_value(&result).map_err(|e| e.to_string())?,
    )?;
    if result.status != ToolResultStatus::Succeeded {
        return Err(format!(
            "Tool execution ended as {:?}; durable={}",
            result.status,
            result
                .verification
                .as_ref()
                .and_then(|value| value.get("durable"))
                .and_then(Value::as_bool)
                .unwrap_or(true)
        ));
    }
    let final_result: WorkerFinal = receive_worker_json(&output_rx, &mut child.child)?;
    drop(stdin);
    child.terminate();
    if final_result.schema_version != "1.0"
        || final_result.kind != "final"
        || final_result.content.is_empty()
    {
        return Err("Python worker did not return a canonical final result".to_owned());
    }
    Ok(final_result.metrics)
}

fn receive_worker_json<T: serde::de::DeserializeOwned>(
    receiver: &mpsc::Receiver<String>,
    child: &mut std::process::Child,
) -> Result<T, String> {
    match receiver.recv_timeout(Duration::from_secs(30)) {
        Ok(line) => serde_json::from_str(&line).map_err(|error| error.to_string()),
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(format!(
                "Python worker response timeout or disconnect: {error}"
            ))
        }
    }
}

fn worker_sandbox_profile(
    database: &Path,
    worker_root: &Path,
    python: &Path,
) -> Result<String, String> {
    fn escaped(path: &Path) -> Result<String, String> {
        let value = path
            .canonicalize()
            .map_err(|error| format!("could not canonicalize sandbox path: {error}"))?
            .to_string_lossy()
            .replace('\\', "\\\\")
            .replace('"', "\\\"");
        Ok(value)
    }
    let database = escaped(database)?;
    let worker_root = escaped(worker_root)?;
    let python = escaped(&resolve_executable(python)?)?;
    Ok(format!(
        "(version 1) \
         (deny default) \
         (allow process-exec process-info*) \
         (allow sysctl-read) \
         (allow file-read*) \
         (deny file-read* (subpath \"/Users\") (subpath \"/Volumes\") \
           (subpath \"/private/tmp\") (subpath \"/private/var/folders\")) \
         (allow file-read* (subpath \"{worker_root}\") \
           (literal \"/usr/bin/env\") (literal \"/dev/null\") (literal \"{python}\")) \
         (deny file-read* (literal \"{database}\") \
           (literal \"{database}-wal\") (literal \"{database}-shm\"))"
    ))
}

fn resolve_executable(executable: &Path) -> Result<PathBuf, String> {
    if executable.components().count() > 1 {
        return Ok(executable.to_path_buf());
    }
    std::env::var_os("PATH")
        .and_then(|paths| {
            std::env::split_paths(&paths)
                .map(|path| path.join(executable))
                .find(|candidate| candidate.is_file())
        })
        .ok_or_else(|| format!("Python executable was not found: {}", executable.display()))
}

fn validate_decision(
    decision: &WorkerDecision,
    locked: &LockedExecution<'_>,
) -> Result<(), String> {
    if decision.schema_version != "1.0"
        || decision.kind != "tool_call"
        || decision.call_id != locked.call_id
        || decision.idempotency_key != locked.idempotency_key
        || decision.action != "create_markdown"
    {
        return Err("Python worker returned a decision outside the locked route".to_owned());
    }
    if decision.arguments.get("path").and_then(Value::as_str)
        != Some(locked.artifact.to_string_lossy().as_ref())
    {
        return Err("Python worker changed the locked artifact path".to_owned());
    }
    Ok(())
}

fn resolve_worker_failure(
    connection: &mut Connection,
    events: &mut EventLog,
    task_id: &str,
    action_id: &str,
    artifact: &Path,
    now: &str,
    error: String,
) -> Result<Value, String> {
    let status: String = connection
        .query_row(
            "SELECT status FROM actions WHERE id=?1",
            [action_id],
            |row| row.get(0),
        )
        .map_err(|query_error| query_error.to_string())?;
    if status == "succeeded" && artifact.is_file() {
        return Ok(json!({"worker_final_missing": true}));
    }
    if status == "result_unknown" || error.contains("ResultUnknown") {
        return Err(format!("{error}; Action requires human verification"));
    }
    if status == "running" {
        connection
            .execute(
                "UPDATE actions SET status='failed', updated_at=?1 WHERE id=?2 AND status='running'",
                params![now, action_id],
            )
            .map_err(|update_error| update_error.to_string())?;
    }
    TaskService::new(connection, events)
        .transition(task_id, TaskEvent::Fail, now)
        .map_err(|task_error| format!("could not fail task: {task_error:?}"))?;
    Err(error)
}

fn write_json_line(writer: &mut impl Write, value: &Value) -> Result<(), String> {
    serde_json::to_writer(&mut *writer, value).map_err(|error| error.to_string())?;
    writer.write_all(b"\n").map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn install_packages(connection: &mut Connection, root: &Path, now: &str) -> Result<(), String> {
    install_tool_package(connection, &root.join("packages/tools/document-tool"), now)
        .map_err(|error| format!("document-tool install failed: {error:?}"))?;
    install_skill_package(
        connection,
        &root.join("packages/skills/prd-generation"),
        now,
    )?;
    install_agent_package(
        connection,
        &root.join("packages/agents/ai-product-manager"),
        now,
    )
    .map_err(|error| format!("Alex install failed: {error:?}"))?;
    Ok(())
}

fn seed_execution(
    connection: &Connection,
    task_id: &str,
    action_id: &str,
    approval_id: &str,
    now: &str,
) -> Result<(), String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO actions VALUES (?1,?2,'document-tool','{}',NULL,'running',?3,?3)",
            params![action_id, task_id, now],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO approvals VALUES (?1,?2,'ai-product-manager','create_markdown',2,'approved',?3,?3)",
            params![approval_id, task_id, now],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn runtime_now(connection: &Connection) -> Result<String, String> {
    connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())
}

fn generated_id(connection: &Connection, prefix: &str) -> Result<String, String> {
    let value: String = connection
        .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    Ok(format!("{prefix}_{value}"))
}

fn runtime_deadline(connection: &Connection) -> Result<String, String> {
    connection
        .query_row(
            "SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+5 minutes')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
}
