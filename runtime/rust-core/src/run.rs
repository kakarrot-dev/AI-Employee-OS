use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{
    context_pipeline,
    decision::AgentDecision,
    employee_prompt::compile_effective_prompt,
    graph_runtime::GraphPlan,
    json_schema,
    tool::{PermissionContext, ToolCall, ToolResultStatus},
    tool_executor::ToolExecutor,
};

pub struct RunSkillConfig<'a> {
    pub connection: &'a mut Connection,
    pub repository_root: &'a Path,
    pub python: &'a Path,
    pub agent_id: &'a str,
    pub skill_id: &'a str,
    pub input: Value,
    pub conversation_id: Option<&'a str>,
    pub capability_mode: bool,
    pub existing_task_id: Option<&'a str>,
}

pub struct ContinueRunConfig<'a> {
    pub connection: &'a mut Connection,
    pub repository_root: &'a Path,
    pub python: &'a Path,
    pub run_id: &'a str,
    pub authorized_root: &'a Path,
    pub approve: bool,
}

#[derive(Clone, Debug)]
struct LockedRun {
    task_id: String,
    run_id: String,
    prompt: String,
    skill: Value,
    instructions: String,
    capability_set: Value,
    tool_surface: Value,
    max_model_turns: i64,
    max_tool_calls: i64,
}

pub fn run_agent(
    connection: &mut Connection,
    repository_root: &Path,
    python: &Path,
    agent_id: &str,
    input: Value,
    conversation_id: Option<&str>,
) -> Result<Value, String> {
    let skill_ids = crate::skill_resolver::ready_skill_ids(connection, agent_id)?;
    let first = skill_ids.first().ok_or("capability_not_found")?.clone();
    run_skill(RunSkillConfig {
        connection,
        repository_root,
        python,
        agent_id,
        skill_id: &first,
        input,
        conversation_id,
        capability_mode: true,
        existing_task_id: None,
    })
}

pub fn run_existing_agent_task(
    connection: &mut Connection,
    repository_root: &Path,
    python: &Path,
    task_id: &str,
) -> Result<Value, String> {
    let (agent_id, input, status): (String, String, String) = connection
        .query_row(
            "SELECT agent_id,input,status FROM tasks WHERE id=?1 AND parent_task_id IS NOT NULL",
            [task_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| "existing_task_not_found".to_owned())?;
    if status != "pending" {
        return Err("existing_task_not_dispatchable".into());
    }
    let input: Value = serde_json::from_str(&input).map_err(|_| "task_input_invalid")?;
    let input = resolve_shared_context(connection, task_id, &agent_id, input)?;
    let skills = crate::skill_resolver::ready_skill_ids(connection, &agent_id)?;
    let first = skills.first().ok_or("capability_not_found")?.clone();
    run_skill(RunSkillConfig {
        connection,
        repository_root,
        python,
        agent_id: &agent_id,
        skill_id: &first,
        input,
        conversation_id: None,
        capability_mode: true,
        existing_task_id: Some(task_id),
    })
}

pub(crate) fn resolve_shared_context(
    connection: &Connection,
    task_id: &str,
    agent_id: &str,
    mut input: Value,
) -> Result<Value, String> {
    let Some(refs) = input.get("input_refs").and_then(Value::as_array) else {
        return Ok(input);
    };
    let mut shared = Vec::new();
    for reference in refs.iter().filter_map(Value::as_str) {
        let Some(deliverable_id) = reference.strip_prefix("deliverable:") else {
            return Err("shared_context_ref_invalid".to_owned());
        };
        let row: Option<(String, String, String)> = connection.query_row(
            "SELECT ref.content_sha256,ref.allowed_agents_json,deliverable.output_json
             FROM work_orders work
             JOIN shared_context_refs ref ON ref.business_flow_id=work.business_flow_id AND ref.source_type='deliverable' AND ref.source_id=?2
             JOIN deliverables deliverable ON deliverable.id=ref.source_id AND deliverable.status='verified'
             WHERE work.child_task_id=?1 AND work.assignee_agent_id=?3",
            params![task_id, deliverable_id, agent_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).optional().map_err(|error| error.to_string())?;
        let (expected_hash, allowed_raw, output_raw) = row.ok_or("shared_context_forbidden")?;
        let allowed: Vec<String> =
            serde_json::from_str(&allowed_raw).map_err(|_| "shared_context_invalid")?;
        if !allowed.iter().any(|allowed_id| allowed_id == agent_id)
            || sha256(&output_raw) != expected_hash
        {
            return Err("shared_context_forbidden".to_owned());
        }
        let output: Value =
            serde_json::from_str(&output_raw).map_err(|_| "shared_context_invalid")?;
        shared.push(json!({"source_type":"deliverable","source_id":deliverable_id,"content_sha256":expected_hash,"content":output}));
    }
    if let Some(object) = input.as_object_mut() {
        object.insert("shared_context".to_owned(), Value::Array(shared));
    }
    Ok(input)
}

pub fn run_skill(mut config: RunSkillConfig<'_>) -> Result<Value, String> {
    let now = timestamp();
    let locked = lock_run(&mut config, &now)?;
    if locked.skill["execution"]["mode"] == "workflow" {
        return run_workflow(config, locked, &now);
    }
    set_phase(
        config.connection,
        &locked.run_id,
        "context_build",
        None,
        &now,
    )?;
    let request = request_payload(&config, &locked)?;
    checkpoint(
        config.connection,
        &locked.run_id,
        "before_model",
        &request,
        &now,
    )?;
    set_phase(
        config.connection,
        &locked.run_id,
        "model_decision",
        None,
        &now,
    )?;
    consume_model_turn(config.connection, &locked.run_id, &now)?;
    let raw = match invoke_worker_bounded(
        config.connection,
        config.repository_root,
        config.python,
        &locked.run_id,
        &request,
        &now,
    ) {
        Ok(raw) => raw,
        Err(error) => return fail_run(config.connection, &locked, &error, &now),
    };
    let decision = match AgentDecision::parse(raw.clone()) {
        Ok(decision) => decision,
        Err(error) => return fail_run(config.connection, &locked, &error, &now),
    };
    observe(
        config.connection,
        &locked.run_id,
        "model_decision",
        &raw,
        &now,
    )?;
    match decision {
        AgentDecision::AskUser {
            question,
            required_input_schema,
            ..
        } => {
            set_phase(
                config.connection,
                &locked.run_id,
                "waiting_user",
                Some("user_input_required"),
                &now,
            )?;
            Ok(json!({
                "schema_version":"1.0.0", "task_id":locked.task_id, "run_id":locked.run_id,
                "status":"running", "phase":"waiting_user", "question":question,
                "required_input_schema":required_input_schema
            }))
        }
        AgentDecision::ToolCall {
            skill_id,
            tool_id,
            action,
            arguments,
            rationale_summary,
            ..
        } => request_tool(
            config.connection,
            &locked,
            config.agent_id,
            &skill_id,
            &tool_id,
            &action,
            &arguments,
            &rationale_summary,
            &now,
            None,
        ),
        AgentDecision::Complete {
            output,
            evidence_refs,
            ..
        } => finalize_existing_run(
            config.connection,
            &locked.task_id,
            &locked.run_id,
            config.agent_id,
            &locked.skill,
            output,
            evidence_refs,
            &now,
        ),
    }
}

fn run_workflow(config: RunSkillConfig<'_>, locked: LockedRun, now: &str) -> Result<Value, String> {
    let version = locked.skill["version"].as_str().ok_or("package_invalid")?;
    let plan = GraphPlan::load(config.connection, config.skill_id, version)?;
    plan.materialize(config.connection, &locked.task_id, now)?;
    let mut observations = Vec::new();
    let mut final_output = Value::Null;
    for node in &plan.nodes {
        if let (Some(tool_id), Some(action)) = (&node.tool_id, &node.tool_action) {
            let arguments = resolve_workflow_arguments(&node.arguments, &config.input)?;
            return request_tool(
                config.connection,
                &locked,
                config.agent_id,
                config.skill_id,
                tool_id,
                action,
                &arguments,
                &format!("Workflow step: {}", node.id),
                now,
                Some(plan.action_id(&locked.task_id, &node.id)),
            );
        }
        plan.start_step(config.connection, &locked.task_id, &node.id, now)?;
        let context = context_pipeline::build(
            &locked.prompt,
            &json!([{"id":config.skill_id,"instructions":format!("{}\n\nWorkflow step: {}\nOutput as: {}", locked.instructions, node.id, node.output_as),"output_schema":locked.skill["output_schema"]}]),
            &config.input,
            &json!([]),
            &Value::Array(observations.clone()),
            locked.skill["context"]["max_bytes"]
                .as_u64()
                .unwrap_or(65_536) as usize,
        )?;
        let request = json!({
            "schema_version":"1.0.0",
            "task":{"id":locked.task_id,"input":config.input},
            "run":{"id":locked.run_id,"max_model_turns":locked.max_model_turns,"max_tool_calls":locked.max_tool_calls},
            "agent":{"id":config.agent_id,"effective_prompt":locked.prompt},
            "capability_set":[{"id":config.skill_id,"instructions":format!("{}\n\nWorkflow step: {}\nOutput as: {}", locked.instructions, node.id, node.output_as),"output_schema":locked.skill["output_schema"]}],
            "tool_surface":[], "context":context, "observations":observations
        });
        checkpoint(
            config.connection,
            &locked.run_id,
            "before_model",
            &request,
            now,
        )?;
        set_phase(
            config.connection,
            &locked.run_id,
            "model_decision",
            None,
            now,
        )?;
        consume_model_turn(config.connection, &locked.run_id, now)?;
        let raw = invoke_worker(
            config.repository_root,
            config.python,
            &request,
            Some((config.connection, &locked.run_id)),
        )?;
        let decision = AgentDecision::parse(raw.clone())?;
        observe(
            config.connection,
            &locked.run_id,
            "model_decision",
            &raw,
            now,
        )?;
        let output = match decision {
            AgentDecision::Complete { output, .. } => output,
            AgentDecision::AskUser { .. } => {
                return fail_run(
                    config.connection,
                    &locked,
                    "workflow_step_requires_user",
                    now,
                );
            }
            AgentDecision::ToolCall { .. } => {
                return fail_run(
                    config.connection,
                    &locked,
                    "workflow_step_tool_not_declared",
                    now,
                );
            }
        };
        plan.complete_step(config.connection, &locked.task_id, &node.id, &output, now)?;
        observations.push(json!({"step_id":node.id,"output":output}));
        final_output = output;
    }
    finalize_existing_run(
        config.connection,
        &locked.task_id,
        &locked.run_id,
        config.agent_id,
        &locked.skill,
        final_output,
        Vec::new(),
        now,
    )
}

pub fn continue_run(config: ContinueRunConfig<'_>) -> Result<Value, String> {
    let now = timestamp();
    let row: (String, String, String, String, String, String) = config
        .connection
        .query_row(
            "SELECT r.task_id,t.agent_id,a.id,a.tool_id,a.input_json,ap.id
         FROM agent_runs r JOIN tasks t ON t.id=r.task_id
         JOIN actions a ON a.task_id=t.id AND a.status='blocked'
         JOIN approvals ap ON ap.task_id=t.id AND ap.status='pending'
         WHERE r.id=?1 AND r.phase='waiting_approval' ORDER BY a.created_at DESC LIMIT 1",
            [config.run_id],
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
        .map_err(|_| "run_not_waiting_approval".to_owned())?;
    let (task_id, agent_id, action_id, tool_id, action_input, approval_id) = row;
    if !config.approve {
        let tx = config
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let approval_changed = tx.execute("UPDATE approvals SET status='rejected',resolved_at=?1 WHERE id=?2 AND status='pending'",params![now,approval_id]).map_err(|error| error.to_string())?;
        let action_changed = tx
            .execute(
                "UPDATE actions SET status='failed',updated_at=?1 WHERE id=?2 AND status='blocked'",
                params![now, action_id],
            )
            .map_err(|error| error.to_string())?;
        if approval_changed != 1 || action_changed != 1 {
            return Err("run_not_waiting_approval".to_owned());
        }
        tx.execute(
            "UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running'",
            params![now, task_id],
        )
        .map_err(|error| error.to_string())?;
        tx.execute("UPDATE agent_runs SET phase='terminal',stop_reason='approval_rejected',revision=revision+1,updated_at=?1 WHERE id=?2",params![now,config.run_id]).map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())?;
        return Ok(
            json!({"schema_version":"1.0.0","task_id":task_id,"run_id":config.run_id,"status":"failed","phase":"terminal","reason":"approval_rejected"}),
        );
    }
    let input: Value =
        serde_json::from_str(&action_input).map_err(|_| "checkpoint_conflict".to_owned())?;
    let action = input["action"].as_str().ok_or("checkpoint_conflict")?;
    let mut arguments = input["arguments"].clone();
    if let Some(path) = arguments.get("path").and_then(Value::as_str) {
        let requested = PathBuf::from(path);
        if requested.is_relative() {
            arguments["path"] = json!(config.authorized_root.join(requested));
        }
    }
    let (tool_version, manifest_raw): (String, String) = config
        .connection
        .query_row(
            "SELECT version,manifest_json FROM tools WHERE id=?1 AND status='active'",
            [&tool_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "tool_not_allowed".to_owned())?;
    let manifest: Value =
        serde_json::from_str(&manifest_raw).map_err(|_| "package_invalid".to_owned())?;
    let tool_action = manifest["tool"]["actions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|item| item["name"] == action)
        .ok_or("tool_action_not_allowed")?;
    let permissions: Vec<String> = tool_action["required_permissions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    let grant_ids: Vec<String> = permissions
        .iter()
        .enumerate()
        .map(|(index, _)| format!("grant_{}_{index}", nonce()))
        .collect();
    let deadline = (timestamp_seconds() + 60).to_string();
    let tx = config
        .connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let approval_changed = tx.execute(
        "UPDATE approvals SET status='approved',resolved_at=?1 WHERE id=?2 AND status='pending'",
        params![now, approval_id],
    )
    .map_err(|error| error.to_string())?;
    let action_changed = tx
        .execute(
            "UPDATE actions SET status='running',updated_at=?1 WHERE id=?2 AND status='blocked'",
            params![now, action_id],
        )
        .map_err(|error| error.to_string())?;
    if approval_changed != 1 || action_changed != 1 {
        return Err("run_not_waiting_approval".to_owned());
    }
    for (grant_id, permission) in grant_ids.iter().zip(&permissions) {
        tx.execute(
            "INSERT INTO scoped_permission_grants VALUES (?1,?2,?3,?4,?5,?6,?7,NULL,?8)",
            params![
                grant_id,
                task_id,
                action_id,
                agent_id,
                config.authorized_root.to_string_lossy(),
                permission,
                deadline,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.execute("UPDATE agent_runs SET phase='tool_execution',revision=revision+1,waiting_reason=NULL,updated_at=?1 WHERE id=?2",params![now,config.run_id]).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    let call = ToolCall {
        schema_version: "1.0".to_owned(),
        call_id: format!("call_{}", nonce()),
        task_id: task_id.clone(),
        action_id: action_id.clone(),
        agent_id: agent_id.clone(),
        tool_id: tool_id.clone(),
        tool_version,
        action: action.to_owned(),
        arguments,
        idempotency_key: sha256(&format!(
            "{task_id}:{action_id}:{tool_id}:{action}:{action_input}"
        )),
        permission_context: PermissionContext { grant_ids },
        approval_id: Some(approval_id),
        deadline,
        trace_id: format!("trace_{}", nonce()),
        attempt: 1,
    };
    checkpoint(
        config.connection,
        config.run_id,
        "before_tool",
        &serde_json::to_value(&input).unwrap_or(json!({})),
        &now,
    )?;
    let result = ToolExecutor::new(config.connection).execute(&call, &now);
    let result_value = serde_json::to_value(&result).map_err(|error| error.to_string())?;
    checkpoint(
        config.connection,
        config.run_id,
        "tool_result_persisted",
        &result_value,
        &now,
    )?;
    observe(
        config.connection,
        config.run_id,
        "tool_result",
        &result_value,
        &now,
    )?;
    match result.status {
        ToolResultStatus::Succeeded => {
            config.connection.execute("UPDATE agent_runs SET phase='observe',revision=revision+1,tool_calls_used=tool_calls_used+1,updated_at=?1 WHERE id=?2",params![now,config.run_id]).map_err(|error| error.to_string())?;
            resume_after_observation(config, &task_id, &agent_id, &result_value, &now)
        }
        ToolResultStatus::ResultUnknown => {
            config.connection.execute("UPDATE agent_runs SET phase='terminal',stop_reason='result_unknown',revision=revision+1,updated_at=?1 WHERE id=?2",params![now,config.run_id]).map_err(|error| error.to_string())?;
            Ok(
                json!({"schema_version":"1.0.0","task_id":task_id,"run_id":config.run_id,"status":"running","phase":"terminal","reason":"result_unknown"}),
            )
        }
        _ => fail_existing_run(
            config.connection,
            &task_id,
            config.run_id,
            "tool_execution_failed",
            &now,
        ),
    }
}

pub fn continue_with_user_input(
    connection: &mut Connection,
    repository_root: &Path,
    python: &Path,
    run_id: &str,
    input: Value,
) -> Result<Value, String> {
    let now = timestamp();
    let (task_id,agent_id,phase):(String,String,String)=connection.query_row(
        "SELECT r.task_id,t.agent_id,r.phase FROM agent_runs r JOIN tasks t ON t.id=r.task_id WHERE r.id=?1",
        [run_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).map_err(|_|"run_not_found".to_owned())?;
    if phase != "waiting_user" {
        return Err("run_not_waiting_user".to_owned());
    }
    observe(connection, run_id, "user_input", &input, &now)?;
    resume_after_observation(
        ContinueRunConfig {
            connection,
            repository_root,
            python,
            run_id,
            authorized_root: repository_root,
            approve: false,
        },
        &task_id,
        &agent_id,
        &input,
        &now,
    )
}

pub fn resolve_unknown_action(
    connection: &mut Connection,
    action_id: &str,
    status: &str,
    evidence: Value,
) -> Result<Value, String> {
    if !matches!(status, "succeeded" | "failed") {
        return Err("invalid_resolution_status".to_owned());
    }
    let now = timestamp();
    let (task_id,agent_id,run_id):(String,String,String)=connection.query_row(
        "SELECT a.task_id,t.agent_id,r.id FROM actions a JOIN tasks t ON t.id=a.task_id JOIN agent_runs r ON r.task_id=t.id WHERE a.id=?1 AND a.status='result_unknown'",
        [action_id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
    ).map_err(|_|"recovery_requires_verification".to_owned())?;
    let evidence_valid = evidence.as_object().is_some_and(|item| {
        item.get("method")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
            && item
                .get("observation")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.trim().is_empty())
            && item
                .get("observed_at")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.trim().is_empty())
    });
    if !evidence_valid {
        return Err("recovery_requires_verification".to_owned());
    }
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    tx.execute("UPDATE actions SET status=?1,output_json=?2,updated_at=?3 WHERE id=?4 AND status='result_unknown'",params![status,evidence.to_string(),now,action_id]).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO audit_logs(id,agent_id,task_id,approval_id,action,resource,result,created_at) VALUES (?1,?2,?3,NULL,'resolve_result_unknown','redacted',?4,?5)",params![format!("audit_resolution_{}",nonce()),agent_id,task_id,status,now]).map_err(|e|e.to_string())?;
    if status == "failed" {
        tx.execute(
            "UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running'",
            params![now, task_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("UPDATE agent_runs SET phase='terminal',stop_reason='result_verified_failed',revision=revision+1,updated_at=?1 WHERE id=?2",params![now,run_id]).map_err(|e|e.to_string())?;
    } else {
        tx.execute("UPDATE agent_runs SET phase='observe',stop_reason=NULL,revision=revision+1,updated_at=?1 WHERE id=?2",params![now,run_id]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(
        json!({"schema_version":"1.0.0","task_id":task_id,"run_id":run_id,"action_id":action_id,"status":status,"phase":if status=="failed"{"terminal"}else{"observe"}}),
    )
}

pub fn continue_after_verified_action(
    connection: &mut Connection,
    repository_root: &Path,
    python: &Path,
    run_id: &str,
    evidence: Value,
) -> Result<Value, String> {
    let now = timestamp();
    let (task_id, agent_id, phase): (String, String, String) = connection
        .query_row(
            "SELECT r.task_id,t.agent_id,r.phase FROM agent_runs r JOIN tasks t ON t.id=r.task_id WHERE r.id=?1",
            [run_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).map_err(|_| "run_not_found".to_owned())?;
    if phase != "observe" {
        return Err("run_not_observing".to_owned());
    }
    observe(connection, run_id, "tool_result", &evidence, &now)?;
    resume_after_observation(
        ContinueRunConfig {
            connection,
            repository_root,
            python,
            run_id,
            authorized_root: repository_root,
            approve: false,
        },
        &task_id,
        &agent_id,
        &evidence,
        &now,
    )
}

fn resume_after_observation(
    config: ContinueRunConfig<'_>,
    task_id: &str,
    agent_id: &str,
    tool_result: &Value,
    now: &str,
) -> Result<Value, String> {
    let task_input_raw: String = config
        .connection
        .query_row("SELECT input FROM tasks WHERE id=?1", [task_id], |row| {
            row.get(0)
        })
        .map_err(|_| "checkpoint_conflict".to_owned())?;
    let task_input = serde_json::from_str::<Value>(&task_input_raw)
        .unwrap_or_else(|_| json!({"text":task_input_raw}));
    let agent_raw: String = config
        .connection
        .query_row(
            "SELECT snapshot_json FROM run_snapshots WHERE run_id=?1 AND snapshot_type='agent'",
            [config.run_id],
            |row| row.get(0),
        )
        .map_err(|_| "checkpoint_conflict".to_owned())?;
    let capability_raw: String = config
        .connection
        .query_row(
            "SELECT snapshot_json FROM run_snapshots WHERE run_id=?1 AND snapshot_type IN ('capability_set','skill') ORDER BY CASE snapshot_type WHEN 'capability_set' THEN 0 ELSE 1 END LIMIT 1",
            [config.run_id],
            |row| row.get(0),
        )
        .map_err(|_| "checkpoint_conflict".to_owned())?;
    let toolset_raw: String = config
        .connection
        .query_row(
            "SELECT snapshot_json FROM run_snapshots WHERE run_id=?1 AND snapshot_type='toolset'",
            [config.run_id],
            |row| row.get(0),
        )
        .map_err(|_| "checkpoint_conflict".to_owned())?;
    let agent: Value =
        serde_json::from_str(&agent_raw).map_err(|_| "checkpoint_conflict".to_owned())?;
    let capability_lock: Value =
        serde_json::from_str(&capability_raw).map_err(|_| "checkpoint_conflict".to_owned())?;
    let toolset_lock: Value =
        serde_json::from_str(&toolset_raw).map_err(|_| "checkpoint_conflict".to_owned())?;
    let capability_set = if let Some(skills) = capability_lock["skills"].as_array() {
        Value::Array(skills.clone())
    } else {
        Value::Array(vec![capability_lock.clone()])
    };
    let is_capability_run = capability_lock.get("skills").is_some();
    let first_capability = &capability_set.as_array().ok_or("checkpoint_conflict")?[0];
    let skill = if is_capability_run {
        json!({
            "id":"agent-capability-set","name":"工作结果","output_schema":{"type":"object"},
            "execution":{"max_model_turns":8,"max_tool_calls":8},
            "deliverables":{"required":false,"evidence":"output_schema"}
        })
    } else {
        first_capability["manifest"]["skill"].clone()
    };
    let (max_model_turns, max_tool_calls): (i64, i64) = config
        .connection
        .query_row(
            "SELECT max_model_turns,max_tool_calls FROM agent_runs WHERE id=?1",
            [config.run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "checkpoint_conflict".to_owned())?;
    let observations = completed_tool_observations(config.connection, task_id, tool_result)?;
    let context = context_pipeline::build(
        agent["effective_prompt"].as_str().unwrap_or_default(),
        &capability_set,
        &task_input,
        &toolset_lock["tools"],
        &observations,
        65_536,
    )?;
    let request = json!({
        "schema_version":"1.0.0","task":{"id":task_id,"input":task_input},
        "run":{"id":config.run_id,"max_model_turns":max_model_turns,"max_tool_calls":max_tool_calls},
        "agent":{"id":agent_id,"effective_prompt":agent["effective_prompt"]},
        "capability_set":capability_set,
        "tool_surface":toolset_lock["tools"],"context":context,"observations":observations
    });
    checkpoint(
        config.connection,
        config.run_id,
        "before_model",
        &request,
        now,
    )?;
    set_phase(
        config.connection,
        config.run_id,
        "model_decision",
        None,
        now,
    )?;
    consume_model_turn(config.connection, config.run_id, now)?;
    let raw = match invoke_worker_bounded(
        config.connection,
        config.repository_root,
        config.python,
        config.run_id,
        &request,
        now,
    ) {
        Ok(raw) => raw,
        Err(error) => {
            return fail_existing_run(config.connection, task_id, config.run_id, &error, now);
        }
    };
    let (decision, raw) = match parse_decision_bounded(
        config.connection,
        config.repository_root,
        config.python,
        config.run_id,
        &request,
        raw,
        now,
    ) {
        Ok(decision) => decision,
        Err(error) => {
            return fail_existing_run(config.connection, task_id, config.run_id, &error, now);
        }
    };
    observe(
        config.connection,
        config.run_id,
        "model_decision",
        &raw,
        now,
    )?;
    match decision {
        AgentDecision::Complete {
            output,
            evidence_refs,
            ..
        } => finalize_existing_run(
            config.connection,
            task_id,
            config.run_id,
            agent_id,
            &skill,
            output,
            evidence_refs,
            now,
        ),
        AgentDecision::AskUser {
            question,
            required_input_schema,
            ..
        } => {
            set_phase(
                config.connection,
                config.run_id,
                "waiting_user",
                Some("user_input_required"),
                now,
            )?;
            Ok(
                json!({"schema_version":"1.0.0","task_id":task_id,"run_id":config.run_id,"status":"running","phase":"waiting_user","question":question,"required_input_schema":required_input_schema}),
            )
        }
        AgentDecision::ToolCall {
            skill_id,
            tool_id,
            action,
            arguments,
            rationale_summary,
            ..
        } => {
            let locked = LockedRun {
                task_id: task_id.to_owned(),
                run_id: config.run_id.to_owned(),
                prompt: agent["effective_prompt"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned(),
                skill: skill.clone(),
                instructions: if is_capability_run {
                    String::new()
                } else {
                    first_capability["instructions"]
                        .as_str()
                        .unwrap_or_default()
                        .to_owned()
                },
                capability_set: capability_set.clone(),
                tool_surface: toolset_lock["tools"].clone(),
                max_model_turns,
                max_tool_calls,
            };
            request_tool(
                config.connection,
                &locked,
                agent_id,
                &skill_id,
                &tool_id,
                &action,
                &arguments,
                &rationale_summary,
                now,
                None,
            )
        }
    }
}

fn finalize_existing_run(
    connection: &Connection,
    task_id: &str,
    run_id: &str,
    agent_id: &str,
    skill: &Value,
    output: Value,
    evidence_refs: Vec<String>,
    now: &str,
) -> Result<Value, String> {
    validate_output(&skill["output_schema"], &output)?;
    let deliverable_id = format!("deliverable_{}", nonce());
    let tx = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    ensure_run_can_advance(&tx, task_id, run_id)?;
    tx.execute("INSERT INTO deliverables(id,task_id,run_id,deliverable_type,title,summary,status,output_json,created_at,verified_at) VALUES (?1,?2,?3,'structured_result',?4,?5,'candidate',?6,?7,NULL)",params![deliverable_id,task_id,run_id,skill["name"].as_str().unwrap_or("Skill result"),summarize(&output),output.to_string(),now]).map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO deliverable_evidence VALUES (?1,'structured_output',?2,?3)",
        params![deliverable_id, sha256(&output.to_string()), now],
    )
    .map_err(|error| error.to_string())?;
    let artifact_result: Option<(String, String)> = tx.query_row(
        "SELECT te.call_id,te.result_json FROM tool_executions te JOIN actions a ON a.id=te.action_id WHERE a.task_id=?1 AND te.status='succeeded' AND json_type(te.result_json,'$.output.path')='text' ORDER BY te.started_at DESC LIMIT 1",
        [task_id], |row| Ok((row.get(0)?,row.get(1)?)),
    ).optional().map_err(|error| error.to_string())?;
    if let Some((call_id, result_json)) = artifact_result {
        let tool_result: Value =
            serde_json::from_str(&result_json).map_err(|_| "evidence_missing".to_owned())?;
        let path = tool_result["output"]["path"]
            .as_str()
            .ok_or("artifact_invalid")?;
        let bytes = std::fs::read(path).map_err(|_| "artifact_invalid".to_owned())?;
        let artifact_id = format!("artifact_{}", nonce());
        tx.execute(
            "INSERT INTO artifacts(id,task_id,run_id,kind,uri,media_type,size_bytes,sha256,created_by_action_id,sensitivity,verification_status,created_at)
             VALUES (?1,?2,?3,'markdown_document',?4,'text/markdown',?5,?6,(SELECT action_id FROM tool_executions WHERE call_id=?7),'internal','verified',?8)",
            params![artifact_id,task_id,run_id,path,bytes.len() as i64,format!("{:x}",Sha256::digest(&bytes)),call_id,now],
        ).map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO deliverable_evidence VALUES (?1,'artifact',?2,?3)",
            params![deliverable_id, artifact_id, now],
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO deliverable_evidence VALUES (?1,'tool_result',?2,?3)",
            params![deliverable_id, call_id, now],
        )
        .map_err(|error| error.to_string())?;
    }
    for reference in evidence_refs {
        let reference_exists: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM tool_executions execution JOIN actions action ON action.id=execution.action_id
               WHERE action.task_id=?1 AND execution.status='succeeded'
                 AND (execution.call_id=?2 OR instr(COALESCE(execution.result_json,''),?2)>0)
               UNION ALL
               SELECT 1 FROM artifacts artifact WHERE artifact.task_id=?1 AND artifact.verification_status='verified'
                 AND (artifact.id=?2 OR artifact.uri=?2)
             )",
            params![task_id, reference],
            |row| row.get(0),
        ).map_err(|error| error.to_string())?;
        if !reference_exists {
            return Err("evidence_reference_invalid".to_owned());
        }
        tx.execute(
            "INSERT OR IGNORE INTO deliverable_evidence VALUES (?1,'verification',?2,?3)",
            params![deliverable_id, reference, now],
        )
        .map_err(|error| error.to_string())?;
    }
    let usage: (i64, i64) = tx
        .query_row(
            "SELECT model_turns_used,tool_calls_used FROM agent_runs WHERE id=?1",
            [run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| error.to_string())?;
    let evaluation_id = format!("eval_{}", nonce());
    let evaluation = deterministic_evaluation(&tx, run_id, task_id, usage.0, usage.1)?;
    let delivery_allowed = evaluation["delivery_allowed"].as_bool() == Some(true);
    let score = evaluation["score"].as_f64().unwrap_or(0.0);
    tx.execute("INSERT INTO evaluations(id,task_id,agent_id,score,metrics_json,created_at) VALUES (?1,?2,?3,?4,?5,?6)",params![evaluation_id,task_id,agent_id,score,evaluation.to_string(),now]).map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO deliverable_evidence VALUES (?1,'evaluation',?2,?3)",
        params![deliverable_id, evaluation_id, now],
    )
    .map_err(|error| error.to_string())?;
    if !delivery_allowed {
        tx.execute(
            "UPDATE deliverables SET status='rejected' WHERE id=?1 AND status='candidate'",
            [&deliverable_id],
        )
        .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())?;
        return Err("evaluation_blocked".to_owned());
    }
    ensure_run_can_advance(&tx, task_id, run_id)?;
    let verified = tx.execute("UPDATE deliverables SET status='verified',verified_at=?2 WHERE id=?1 AND status='candidate'",params![deliverable_id,now]).map_err(|error|error.to_string())?;
    let task_changed = tx
        .execute(
            "UPDATE tasks SET status='succeeded',updated_at=?1 WHERE id=?2 AND status='running'",
            params![now, task_id],
        )
        .map_err(|error| error.to_string())?;
    let run_changed = tx.execute("UPDATE agent_runs SET phase='terminal',stop_reason='succeeded',revision=revision+1,updated_at=?1 WHERE id=?2 AND phase!='terminal'",params![now,run_id]).map_err(|error| error.to_string())?;
    if verified != 1 || task_changed != 1 || run_changed != 1 {
        return Err("run_state_conflict".to_owned());
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(
        json!({"schema_version":"1.0.0","task_id":task_id,"run_id":run_id,"status":"succeeded","phase":"terminal","output":output,"deliverable_id":deliverable_id}),
    )
}

fn deterministic_evaluation(
    connection: &Connection,
    run_id: &str,
    task_id: &str,
    model_turns: i64,
    tool_calls: i64,
) -> Result<Value, String> {
    let unsafe_actions: i64 = connection.query_row("SELECT count(*) FROM actions WHERE task_id=?1 AND status IN ('blocked','running','result_unknown')",[task_id],|row|row.get(0)).map_err(|error|error.to_string())?;
    let failed_tools: i64 = connection.query_row("SELECT count(*) FROM tool_executions execution JOIN actions action ON action.id=execution.action_id WHERE action.task_id=?1 AND execution.status!='succeeded'",[task_id],|row|row.get(0)).map_err(|error|error.to_string())?;
    let cancelled: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM task_cancellation_requests WHERE task_id=?1)",
            [task_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let budget_ok: bool = connection.query_row("SELECT model_turns_used<=max_model_turns AND tool_calls_used<=max_tool_calls FROM agent_runs WHERE id=?1",[run_id],|row|row.get(0)).map_err(|error|error.to_string())?;
    let passed = [
        true,
        unsafe_actions == 0 && failed_tools == 0,
        unsafe_actions == 0,
        budget_ok,
        !cancelled,
    ];
    let score = passed.iter().filter(|value| **value).count() as f64 / passed.len() as f64;
    Ok(json!({
        "schema_version":"1.0.0",
        "run_id":run_id,
        "score":score,
        "delivery_allowed":passed.iter().all(|value| *value),
        "reports":{
            "result":{"status":"passed","rule":"output_schema"},
            "trajectory":{"status":if unsafe_actions==0{"passed"}else{"failed"},"model_turns":model_turns,"unfinished_actions":unsafe_actions},
            "side_effect":{"status":if failed_tools==0{"passed"}else{"failed"},"tool_calls":tool_calls,"non_succeeded":failed_tools},
            "recovery":{"status":if unsafe_actions==0{"passed"}else{"failed"},"result_unknown":unsafe_actions>0},
            "cost":{"status":if budget_ok{"passed"}else{"failed"},"model_turns":model_turns,"tool_calls":tool_calls},
            "risk":{"status":if !cancelled{"passed"}else{"failed"},"policy":"rust_authority","cancellation_requested":cancelled}
        }
    }))
}

fn ensure_run_can_advance(
    connection: &Connection,
    task_id: &str,
    run_id: &str,
) -> Result<(), String> {
    let allowed: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM tasks task JOIN agent_runs run ON run.task_id=task.id WHERE task.id=?1 AND run.id=?2 AND task.status='running' AND run.phase!='terminal' AND NOT EXISTS(SELECT 1 FROM task_cancellation_requests request WHERE request.task_id=task.id))",
        params![task_id, run_id],
        |row| row.get(0),
    ).map_err(|error| error.to_string())?;
    if allowed {
        Ok(())
    } else {
        Err("run_not_advancable".to_owned())
    }
}

fn consume_model_turn(connection: &Connection, run_id: &str, now: &str) -> Result<(), String> {
    let changed = connection.execute(
        "UPDATE agent_runs SET model_turns_used=model_turns_used+1,revision=revision+1,updated_at=?1
         WHERE id=?2 AND model_turns_used < max_model_turns",
        params![now, run_id],
    ).map_err(|error| error.to_string())?;
    if changed != 1 {
        return Err("model_budget_exceeded".to_owned());
    }
    Ok(())
}

fn lock_run(config: &mut RunSkillConfig<'_>, now: &str) -> Result<LockedRun, String> {
    let (prompt, config_version) = compile_effective_prompt(config.connection, config.agent_id)?;
    let skill_ids = if config.capability_mode {
        crate::skill_resolver::ready_skill_ids(config.connection, config.agent_id)?
    } else {
        vec![config.skill_id.to_owned()]
    };
    if skill_ids.is_empty() {
        return Err("capability_not_found".to_owned());
    }
    let mut capabilities = Vec::new();
    let mut surfaces = Vec::new();
    let mut total_model_turns = 0_i64;
    let mut total_tool_calls = 0_i64;
    for skill_id in &skill_ids {
        let (manifest_raw, skill_path, skill_version): (String, String, String) = config.connection.query_row(
            "SELECT s.manifest_json,s.path,s.version FROM skills s JOIN agent_skills a ON a.skill_id=s.id WHERE a.agent_id=?1 AND a.enabled=1 AND s.id=?2 AND s.status='active'",
            params![config.agent_id, skill_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).map_err(|_| "skill_unbound".to_owned())?;
        let manifest: Value =
            serde_json::from_str(&manifest_raw).map_err(|_| "package_invalid".to_owned())?;
        if manifest["schema_version"] != "2.0.0" {
            return Err("runtime_incompatible: run requires Skill Manifest 2.0.0".to_owned());
        }
        let skill = &manifest["skill"];
        if !config.capability_mode {
            validate_input(&skill["input_schema"], &config.input)?;
        }
        let instructions_path = PathBuf::from(skill_path)
            .join(skill["instructions"].as_str().ok_or("package_invalid")?);
        let instructions = std::fs::read_to_string(instructions_path)
            .map_err(|_| "package_invalid: instructions unavailable".to_owned())?;
        total_model_turns += skill["execution"]["max_model_turns"].as_i64().unwrap_or(1);
        total_tool_calls += skill["execution"]["max_tool_calls"].as_i64().unwrap_or(0);
        for mut surface in resolve_tool_surface(config.connection, &skill["tools"])?
            .as_array()
            .cloned()
            .unwrap_or_default()
        {
            surface["skill_id"] = json!(skill_id);
            surfaces.push(surface);
        }
        capabilities.push(json!({
            "id":skill_id,"version":skill_version,"manifest":manifest,"instructions":instructions,
            "instructions_sha256":sha256(&instructions),"output_schema":skill["output_schema"]
        }));
    }
    let capability_set = Value::Array(capabilities.clone());
    let (skill, instructions, max_model_turns, max_tool_calls) = if config.capability_mode {
        (
            json!({
                "id":"agent-capability-set","name":"工作结果","output_schema":{"type":"object"},
                "context":{"max_bytes":65536},"execution":{"mode":"agent_loop","max_model_turns":total_model_turns.clamp(2,8),"max_tool_calls":total_tool_calls.clamp(1,8)},
                "deliverables":{"required":false,"evidence":"output_schema"}
            }),
            String::new(),
            total_model_turns.clamp(2, 8),
            total_tool_calls.clamp(1, 8),
        )
    } else {
        let first = &capabilities[0];
        let locked_skill = first["manifest"]["skill"].clone();
        let explicit_model_turns = locked_skill["execution"]["max_model_turns"]
            .as_i64()
            .ok_or("package_invalid")?;
        let explicit_tool_calls = locked_skill["execution"]["max_tool_calls"]
            .as_i64()
            .ok_or("package_invalid")?;
        (
            locked_skill,
            first["instructions"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            explicit_model_turns,
            explicit_tool_calls,
        )
    };
    let tool_surface = Value::Array(surfaces);
    let execution = &skill["execution"];
    if !matches!(execution["mode"].as_str(), Some("agent_loop" | "workflow")) {
        return Err("runtime_incompatible: unsupported execution mode".to_owned());
    }
    let task_id = config
        .existing_task_id
        .map(str::to_owned)
        .unwrap_or_else(|| format!("task_{}", nonce()));
    let run_id = format!("run_{}", nonce());
    let max_duration_ms = execution["max_duration_ms"].as_i64().unwrap_or(120_000);
    let deadline = (timestamp_seconds() + (max_duration_ms / 1000).max(1) as u64).to_string();
    let tx = config
        .connection
        .transaction()
        .map_err(|error| error.to_string())?;
    if config.existing_task_id.is_some() {
        let changed = tx
            .execute(
                "UPDATE tasks SET status='running',updated_at=?1
             WHERE id=?2 AND agent_id=?3 AND status='pending' AND parent_task_id IS NOT NULL",
                params![now, task_id, config.agent_id],
            )
            .map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("existing_task_not_dispatchable".into());
        }
    } else {
        tx.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES (?1,?2,?3,'running',?4,?4)",
            params![task_id, config.agent_id, config.input.to_string(), now],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.execute(
        "INSERT INTO agent_runs(id,task_id,schema_version,phase,revision,model_turns_used,tool_calls_used,max_model_turns,max_tool_calls,deadline,created_at,updated_at)
         VALUES (?1,?2,'1.0.0','preflight',1,0,0,?3,?4,?5,?6,?6)",
        params![run_id,task_id,max_model_turns,max_tool_calls,deadline,now],
    ).map_err(|error| error.to_string())?;
    let snapshots = [
        (
            "agent",
            json!({"agent_id":config.agent_id,"config_version":config_version,"effective_prompt":prompt,"effective_prompt_sha256":sha256(&prompt)}),
        ),
        (
            if config.capability_mode {
                "capability_set"
            } else {
                "skill"
            },
            if config.capability_mode {
                json!({"skills":capability_set})
            } else {
                capabilities[0].clone()
            },
        ),
        ("toolset", json!({"tools": tool_surface.clone()})),
        (
            "context",
            json!({"conversation_id":config.conversation_id,"input_sha256":sha256(&config.input.to_string())}),
        ),
        (
            "model",
            json!({"provider":"configured","secret_included":false}),
        ),
    ];
    for (kind, value) in snapshots {
        let serialized = value.to_string();
        tx.execute(
            "INSERT INTO run_snapshots VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                format!("snapshot_{run_id}_{kind}"),
                run_id,
                kind,
                serialized,
                sha256(&serialized),
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    }
    tx.commit().map_err(|error| error.to_string())?;
    Ok(LockedRun {
        task_id,
        run_id,
        prompt,
        skill,
        instructions,
        capability_set,
        tool_surface,
        max_model_turns,
        max_tool_calls,
    })
}

fn request_payload(config: &RunSkillConfig<'_>, run: &LockedRun) -> Result<Value, String> {
    let max_bytes = run.skill["context"]["max_bytes"].as_u64().unwrap_or(65_536) as usize;
    let context = context_pipeline::build(
        &run.prompt,
        &run.capability_set,
        &config.input,
        &run.tool_surface,
        &json!([]),
        max_bytes,
    )?;
    Ok(json!({
        "schema_version":"1.0.0", "task":{"id":run.task_id,"input":config.input},
        "run":{"id":run.run_id,"max_model_turns":run.max_model_turns,"max_tool_calls":run.max_tool_calls},
        "agent":{"id":config.agent_id,"effective_prompt":run.prompt},
        "capability_set":run.capability_set,
        "tool_surface":run.tool_surface, "context":context, "observations":[]
    }))
}

fn resolve_tool_surface(connection: &Connection, declarations: &Value) -> Result<Value, String> {
    let declarations = declarations.as_array().ok_or("package_invalid")?;
    let mut surface = Vec::with_capacity(declarations.len());
    for declaration in declarations {
        let tool_id = declaration["id"].as_str().ok_or("package_invalid")?;
        let allowed_actions = declaration["actions"].as_array().ok_or("package_invalid")?;
        let manifest_raw: String = connection
            .query_row(
                "SELECT manifest_json FROM tools WHERE id=?1 AND status='active'",
                [tool_id],
                |row| row.get(0),
            )
            .map_err(|_| "tool_not_allowed".to_owned())?;
        let manifest: Value =
            serde_json::from_str(&manifest_raw).map_err(|_| "package_invalid".to_owned())?;
        let installed_actions = manifest["tool"]["actions"]
            .as_array()
            .ok_or("package_invalid")?;
        let mut actions = Vec::with_capacity(allowed_actions.len());
        for allowed in allowed_actions {
            let action_name = allowed.as_str().ok_or("package_invalid")?;
            let action = installed_actions
                .iter()
                .find(|candidate| candidate["name"] == action_name)
                .ok_or("tool_action_not_allowed")?;
            actions.push(json!({
                "name": action_name,
                "description": action["description"],
                "input_schema": action["input_schema"]
            }));
        }
        surface.push(json!({
            "id":tool_id,
            "max_calls":declaration["max_calls"],
            "actions":actions
        }));
    }
    Ok(Value::Array(surface))
}

fn invoke_worker(
    root: &Path,
    python: &Path,
    request: &Value,
    run: Option<(&Connection, &str)>,
) -> Result<Value, String> {
    let mut child = Command::new(python)
        .args(["-m", "app.task_worker"])
        .current_dir(root.join("runtime/python-agent"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("worker_disconnect: {error}"))?;
    child
        .stdin
        .take()
        .ok_or("worker_disconnect")?
        .write_all(request.to_string().as_bytes())
        .map_err(|error| error.to_string())?;
    loop {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            break;
        }
        if let Some((connection, run_id)) = run {
            let stopped: bool = connection.query_row(
                "SELECT phase='terminal' OR deadline<?2 OR EXISTS(SELECT 1 FROM task_cancellation_requests request WHERE request.task_id=agent_runs.task_id) FROM agent_runs WHERE id=?1",
                params![run_id, timestamp_seconds().to_string()],
                |row| row.get(0),
            ).map_err(|error| error.to_string())?;
            if stopped {
                let _ = child.kill();
                let _ = child.wait();
                return Err("run_cancelled_or_deadline_exceeded".to_owned());
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "worker_disconnect: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("decision_schema_invalid: {error}"))
}

fn invoke_worker_bounded(
    connection: &Connection,
    root: &Path,
    python: &Path,
    run_id: &str,
    request: &Value,
    now: &str,
) -> Result<Value, String> {
    match invoke_worker(root, python, request, Some((connection, run_id))) {
        Ok(value) => Ok(value),
        Err(first)
            if first.contains("decision_schema_invalid")
                || first.contains("provider_output_truncated") =>
        {
            observe(
                connection,
                run_id,
                "system",
                &json!({"protocol_error":first,"retry":1}),
                now,
            )?;
            consume_model_turn(connection, run_id, now).map_err(|_| first.clone())?;
            let mut retry = request.clone();
            append_protocol_error_observation(&mut retry, &first)?;
            checkpoint(connection, run_id, "before_model", &retry, now)?;
            invoke_worker(root, python, &retry, Some((connection, run_id)))
        }
        Err(error) => Err(error),
    }
}

fn parse_decision_bounded(
    connection: &Connection,
    root: &Path,
    python: &Path,
    run_id: &str,
    request: &Value,
    raw: Value,
    now: &str,
) -> Result<(AgentDecision, Value), String> {
    match AgentDecision::parse(raw.clone()) {
        Ok(decision) => Ok((decision, raw)),
        Err(first) => {
            observe(
                connection,
                run_id,
                "system",
                &json!({"protocol_error":first,"retry":1}),
                now,
            )?;
            consume_model_turn(connection, run_id, now).map_err(|_| first.clone())?;
            let mut retry = request.clone();
            append_protocol_error_observation(&mut retry, &first)?;
            checkpoint(connection, run_id, "before_model", &retry, now)?;
            let retried = invoke_worker(root, python, &retry, Some((connection, run_id)))?;
            Ok((AgentDecision::parse(retried.clone())?, retried))
        }
    }
}

fn compact_observation(value: &Value) -> Value {
    let serialized = value.to_string();
    const MAX_VISIBLE_BYTES: usize = 12_000;
    if serialized.len() <= MAX_VISIBLE_BYTES {
        return value.clone();
    }
    let preview: String = serialized.chars().take(MAX_VISIBLE_BYTES).collect();
    json!({
        "status": value.get("status").cloned().unwrap_or(Value::Null),
        "result_ref": format!("sha256:{}", sha256(&serialized)),
        "original_bytes": serialized.len(),
        "content_preview": preview,
        "truncated_for_context": true
    })
}

fn completed_tool_observations(
    connection: &Connection,
    task_id: &str,
    latest_observation: &Value,
) -> Result<Value, String> {
    let mut statement = connection
        .prepare(
            "SELECT te.call_id,a.tool_id,a.input_json,te.result_json
             FROM actions a JOIN tool_executions te ON te.action_id=a.id
             WHERE a.task_id=?1 AND te.status='succeeded'
             ORDER BY te.started_at,te.call_id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([task_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut observations = Vec::new();
    let mut latest_is_in_history = false;
    for row in rows {
        let (call_id, tool_id, input_raw, result_raw) = row.map_err(|error| error.to_string())?;
        let input: Value = serde_json::from_str(&input_raw).map_err(|_| "checkpoint_conflict")?;
        let result: Value = serde_json::from_str(&result_raw).map_err(|_| "checkpoint_conflict")?;
        latest_is_in_history |= &result == latest_observation;
        observations.push(compact_observation(&json!({
            "kind":"completed_tool_call",
            "call_id":call_id,
            "skill_id":input["skill_id"],
            "tool_id":tool_id,
            "action":input["action"],
            "arguments":input["arguments"],
            "status":result["status"],
            "output":result["output"]
        })));
    }
    if !latest_is_in_history {
        observations.push(compact_observation(&json!({
            "kind":"runtime_observation",
            "value":latest_observation
        })));
    }
    Ok(Value::Array(observations))
}

fn append_protocol_error_observation(request: &mut Value, error: &str) -> Result<(), String> {
    request["observations"]
        .as_array_mut()
        .ok_or_else(|| "checkpoint_conflict".to_owned())?
        .push(json!({
            "kind":"protocol_error","error":error,
            "instruction":"Return exactly one valid decision object matching the contract. Do not repeat a completed Tool call."
        }));
    Ok(())
}

fn set_phase(
    connection: &Connection,
    run_id: &str,
    phase: &str,
    reason: Option<&str>,
    now: &str,
) -> Result<(), String> {
    let changed = connection.execute(
        "UPDATE agent_runs SET phase=?1,revision=revision+1,waiting_reason=CASE WHEN ?1 IN ('waiting_user','waiting_approval') THEN ?2 ELSE NULL END,stop_reason=CASE WHEN ?1='terminal' THEN ?2 ELSE NULL END,updated_at=?3 WHERE id=?4",
        params![phase,reason,now,run_id],
    ).map_err(|error| error.to_string())?;
    if changed != 1 {
        return Err("invalid_transition".to_owned());
    }
    Ok(())
}

fn observe(
    connection: &Connection,
    run_id: &str,
    kind: &str,
    value: &Value,
    now: &str,
) -> Result<(), String> {
    connection.execute(
        "INSERT INTO run_observations VALUES (?1,(SELECT COALESCE(MAX(sequence),0)+1 FROM run_observations WHERE run_id=?1),?2,?3,NULL,?4)",
        params![run_id,kind,value.to_string(),now],
    ).map(|_| ()).map_err(|error| error.to_string())
}

fn checkpoint(
    connection: &Connection,
    run_id: &str,
    kind: &str,
    state: &Value,
    now: &str,
) -> Result<(), String> {
    let revision: i64 = connection
        .query_row(
            "SELECT revision FROM agent_runs WHERE id=?1",
            [run_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO run_checkpoints VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                format!("checkpoint_{run_id}_{revision}_{kind}"),
                run_id,
                revision,
                kind,
                sha256(&state.to_string()),
                now
            ],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn fail_run(
    connection: &Connection,
    run: &LockedRun,
    reason: &str,
    now: &str,
) -> Result<Value, String> {
    let changed = connection
        .execute(
            "UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running' AND NOT EXISTS(SELECT 1 FROM task_cancellation_requests WHERE task_id=?2)",
            params![now, run.task_id],
        )
        .map_err(|error| error.to_string())?;
    if changed == 1 {
        connection.execute("UPDATE agent_runs SET phase='terminal',stop_reason=?1,revision=revision+1,updated_at=?2 WHERE id=?3 AND phase!='terminal'",params![reason,now,run.run_id]).map_err(|error|error.to_string())?;
    }
    Err(reason.to_owned())
}

fn fail_existing_run(
    connection: &Connection,
    task_id: &str,
    run_id: &str,
    reason: &str,
    now: &str,
) -> Result<Value, String> {
    connection
        .execute(
            "UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running'",
            params![now, task_id],
        )
        .map_err(|error| error.to_string())?;
    connection.execute("UPDATE agent_runs SET phase='terminal',stop_reason=?1,revision=revision+1,updated_at=?2 WHERE id=?3 AND phase!='terminal'",params![reason,now,run_id]).map_err(|error| error.to_string())?;
    Ok(
        json!({"schema_version":"1.0.0","task_id":task_id,"run_id":run_id,"status":"failed","phase":"terminal","reason":reason}),
    )
}

fn request_tool(
    connection: &Connection,
    run: &LockedRun,
    agent_id: &str,
    skill_id: &str,
    tool_id: &str,
    action: &str,
    arguments: &Value,
    rationale_summary: &str,
    now: &str,
    existing_action_id: Option<String>,
) -> Result<Value, String> {
    ensure_run_can_advance(connection, &run.task_id, &run.run_id)?;
    let budget_available: bool = connection
        .query_row(
            "SELECT tool_calls_used < max_tool_calls FROM agent_runs WHERE id=?1",
            [&run.run_id],
            |row| row.get(0),
        )
        .map_err(|_| "run_not_found".to_owned())?;
    if !budget_available {
        return fail_run(connection, run, "tool_budget_exceeded", now);
    }
    let declared = run
        .tool_surface
        .as_array()
        .into_iter()
        .flatten()
        .any(|tool| {
            tool["id"] == tool_id
                && tool["skill_id"] == skill_id
                && tool["actions"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .any(|allowed| allowed["name"] == action)
        });
    if !declared {
        return fail_run(connection, run, "tool_action_not_allowed", now);
    }
    let skill_call_limit = run
        .tool_surface
        .as_array()
        .into_iter()
        .flatten()
        .find(|tool| tool["id"] == tool_id && tool["skill_id"] == skill_id)
        .and_then(|tool| tool["max_calls"].as_i64())
        .ok_or_else(|| "package_invalid".to_owned())?;
    let skill_calls_used: i64 = connection
        .query_row(
            "SELECT count(*) FROM actions
             WHERE task_id=?1 AND tool_id=?2 AND json_extract(input_json,'$.skill_id')=?3",
            params![run.task_id, tool_id, skill_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if skill_calls_used >= skill_call_limit {
        return fail_run(connection, run, "skill_tool_budget_exceeded", now);
    }
    let manifest_raw: String = connection
        .query_row(
            "SELECT manifest_json FROM tools WHERE id=?1 AND status='active'",
            [tool_id],
            |row| row.get(0),
        )
        .map_err(|_| "tool_not_allowed".to_owned())?;
    let manifest: Value =
        serde_json::from_str(&manifest_raw).map_err(|_| "package_invalid".to_owned())?;
    if manifest["tool"]["runtime"] != "rust-native-v1" {
        return fail_run(connection, run, "adapter_not_enabled", now);
    }
    let tool_action = manifest["tool"]["actions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|item| item["name"] == action)
        .ok_or_else(|| "tool_action_not_allowed".to_owned())?;
    let reuses_workflow_action = existing_action_id.is_some();
    let action_id = existing_action_id.unwrap_or_else(|| format!("action_{}", nonce()));
    let approval_id = format!("approval_{}", nonce());
    let risk_level = tool_action["risk_level"].as_i64().unwrap_or(3);
    let tx = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    if !reuses_workflow_action {
        tx.execute(
            "INSERT INTO actions(id,task_id,tool_id,input_json,output_json,status,created_at,updated_at)
             VALUES (?1,?2,?3,?4,NULL,'blocked',?5,?5)",
            params![action_id,run.task_id,tool_id,json!({"skill_id":skill_id,"action":action,"arguments":arguments,"rationale_summary":rationale_summary}).to_string(),now],
        ).map_err(|error| error.to_string())?;
    } else {
        let changed = tx.execute(
            "UPDATE actions SET tool_id=?1,input_json=?2,status='blocked',updated_at=?3
             WHERE id=?4 AND task_id=?5 AND status='pending'",
            params![tool_id,json!({"skill_id":skill_id,"action":action,"arguments":arguments,"rationale_summary":rationale_summary,"workflow":true}).to_string(),now,action_id,run.task_id],
        ).map_err(|error| error.to_string())?;
        if changed != 1 {
            return Err("workflow_action_not_pending".to_owned());
        }
    }
    tx.execute(
        "INSERT INTO approvals(id,task_id,agent_id,action,risk_level,status,created_at,resolved_at)
         VALUES (?1,?2,?3,?4,?5,'pending',?6,NULL)",
        params![approval_id, run.task_id, agent_id, action, risk_level, now],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE agent_runs SET phase='waiting_approval',revision=revision+1,waiting_reason='permission_or_approval_required',updated_at=?1 WHERE id=?2",
        params![now,run.run_id],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(json!({
        "schema_version":"1.0.0","task_id":run.task_id,"run_id":run.run_id,
        "status":"running","phase":"waiting_approval","action_id":action_id,
        "approval_id":approval_id,"reason":"permission_or_approval_required"
    }))
}

fn resolve_workflow_arguments(template: &Value, input: &Value) -> Result<Value, String> {
    match template {
        Value::String(value) if value.starts_with("$input.") => input
            .get(&value[7..])
            .cloned()
            .ok_or_else(|| format!("workflow_input_missing: {}", &value[7..])),
        Value::Array(items) => items
            .iter()
            .map(|item| resolve_workflow_arguments(item, input))
            .collect(),
        Value::Object(items) => items
            .iter()
            .map(|(key, value)| Ok((key.clone(), resolve_workflow_arguments(value, input)?)))
            .collect(),
        value => Ok(value.clone()),
    }
}

fn validate_input(schema: &Value, value: &Value) -> Result<(), String> {
    validate_object(schema, value, "input_schema_invalid")
}
fn validate_output(schema: &Value, value: &Value) -> Result<(), String> {
    validate_object(schema, value, "output_schema_invalid")
}
fn validate_object(schema: &Value, value: &Value, code: &str) -> Result<(), String> {
    json_schema::validate(schema, value).map_err(|error| format!("{code}: {error}"))
}

fn summarize(value: &Value) -> String {
    let text = value.to_string();
    text.chars().take(240).collect()
}
fn sha256(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn nonce() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}
fn timestamp() -> String {
    timestamp_seconds().to_string()
}
fn timestamp_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt};

    #[test]
    fn protocol_retry_preserves_completed_tool_observations() {
        let mut request = json!({
            "observations":[{
                "kind":"completed_tool_call",
                "skill_id":"local-file-operations",
                "tool_id":"file-tool",
                "action":"create_file",
                "status":"succeeded",
                "output":{"path":"report.md"}
            }]
        });
        append_protocol_error_observation(&mut request, "invalid JSON").unwrap();

        let observations = request["observations"].as_array().unwrap();
        assert_eq!(observations.len(), 2);
        assert_eq!(observations[0]["action"], "create_file");
        assert_eq!(observations[1]["kind"], "protocol_error");
    }

    #[test]
    fn semantic_decision_error_retries_without_losing_tool_history() {
        let root = std::env::temp_dir().join(format!("decision-retry-{}", nonce()));
        fs::create_dir_all(root.join("runtime/python-agent")).unwrap();
        let worker = root.join("fake-python");
        fs::write(
            &worker,
            "#!/bin/sh\nprintf '%s\\n' '{\"schema_version\":\"1.0.0\",\"type\":\"complete\",\"output\":{\"summary\":\"ok\"},\"deliverable_candidates\":[],\"evidence_refs\":[]}'\n",
        )
        .unwrap();
        let mut permissions = fs::metadata(&worker).unwrap().permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&worker, permissions).unwrap();

        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE agent_runs(id TEXT PRIMARY KEY,task_id TEXT,phase TEXT,deadline TEXT,revision INTEGER,model_turns_used INTEGER,max_model_turns INTEGER,updated_at TEXT);
                 CREATE TABLE task_cancellation_requests(task_id TEXT);
                 CREATE TABLE run_observations(run_id TEXT,sequence INTEGER,kind TEXT,summary_json TEXT,result_ref TEXT,created_at TEXT);
                 CREATE TABLE run_checkpoints(id TEXT,run_id TEXT,revision INTEGER,checkpoint_kind TEXT,state_sha256 TEXT,created_at TEXT);
                 INSERT INTO agent_runs VALUES ('run','task','model_decision','9999999999',1,1,3,'now');",
            )
            .unwrap();
        let request = json!({
            "observations":[{
                "kind":"completed_tool_call",
                "skill_id":"local-file-operations",
                "tool_id":"file-tool",
                "action":"create_file",
                "status":"succeeded"
            }]
        });
        let (decision, _) = parse_decision_bounded(
            &connection,
            &root,
            &worker,
            "run",
            &request,
            json!({"valid_json":"wrong_contract"}),
            "now",
        )
        .unwrap();

        assert!(matches!(decision, AgentDecision::Complete { .. }));
        assert_eq!(
            connection
                .query_row(
                    "SELECT model_turns_used FROM agent_runs WHERE id='run'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            2
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT count(*) FROM run_observations WHERE kind='system'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            1
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cancellation_prevents_a_terminal_run_from_advancing() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::storage::migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','role','path','active','t','t')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task','alex','{}','cancelled','t','t')", []).unwrap();
        connection.execute("INSERT INTO agent_runs(id,task_id,schema_version,phase,revision,model_turns_used,tool_calls_used,max_model_turns,max_tool_calls,deadline,waiting_reason,stop_reason,created_at,updated_at) VALUES ('run','task','1.0.0','terminal',1,0,0,1,1,'9999999999',NULL,'cancelled','t','t')", []).unwrap();
        connection
            .execute(
                "INSERT INTO task_cancellation_requests VALUES ('task','t','t')",
                [],
            )
            .unwrap();
        assert_eq!(
            ensure_run_can_advance(&connection, "task", "run").unwrap_err(),
            "run_not_advancable"
        );
    }
}
