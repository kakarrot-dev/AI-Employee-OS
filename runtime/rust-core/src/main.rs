use std::{
    collections::BTreeSet,
    env, fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, ExitCode, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

const WAITING_APPROVAL_MESSAGE: &str = "执行已暂停，等待你批准所需权限。";

use ai_employee_runtime::agent::install_agent_package;
use ai_employee_runtime::business_flow::{
    AcceptanceCriterion, FailurePolicy, ScenarioEdgeSpec, ScenarioNodeRole, ScenarioNodeSpec,
    ScenarioProposal, WorkBudget,
};
use ai_employee_runtime::business_flow_service::{
    advance_after_child_success, disable_scenario, get_scenario, list_business_flows,
    list_scenarios, next_ready_work_order, project_business_flow, record_work_order_started,
    save_scenario, settle_failed_work_order, start_business_flow, validate_scenario,
};
use ai_employee_runtime::employee_prompt::{
    compile_effective_prompt, legacy_mission_from_base_prompt,
};
use ai_employee_runtime::knowledge::{import_source, search as knowledge_search};
use ai_employee_runtime::memory::retrieve as retrieve_memory;
use ai_employee_runtime::recovery::reconcile_interrupted;
use ai_employee_runtime::run::{
    ContinueRunConfig, RunSkillConfig, continue_after_verified_action, continue_run as resume_run,
    continue_with_user_input, resolve_unknown_action, run_agent as execute_agent,
    run_existing_agent_task, run_skill as execute_skill,
};
use ai_employee_runtime::skill_package::install_skill_package;
use ai_employee_runtime::skill_resolver::readiness as skill_readiness;
use ai_employee_runtime::storage::migrate;
use ai_employee_runtime::tool_package::install_tool_package;
use rusqlite::{
    Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior, types::Type,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn main() -> ExitCode {
    match command() {
        Ok(result) => {
            println!("{result}");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("ai-employee-runtime failed: {message}");
            ExitCode::FAILURE
        }
    }
}

fn command() -> Result<serde_json::Value, String> {
    let mut arguments = env::args().skip(1);
    match arguments.next().as_deref() {
        Some("chat-history") => chat_history(arguments),
        Some("chat-send") => chat_send(arguments),
        Some("chat-abort") => chat_abort(arguments),
        Some("chat-delete") => chat_delete(arguments),
        Some("chat-retention") => chat_retention(arguments),
        Some("archive-list") => archive_list(arguments),
        Some("employees-list") => employees_list(arguments),
        Some("employee-save") => employee_save(arguments),
        Some("employee-delete") => employee_delete(arguments),
        Some("effective-prompt") => effective_prompt_command(arguments),
        Some("capabilities") => capabilities(arguments),
        Some("skills-list") => skills_list(arguments),
        Some("tools-list") => tools_list(arguments),
        Some("install-tool") => install_tool_command(arguments),
        Some("install-skill") => install_skill_command(arguments),
        Some("bind-skill") => bind_skill_command(arguments),
        Some("unbind-skill") => unbind_skill_command(arguments),
        Some("knowledge-import") => knowledge_import_command(arguments),
        Some("knowledge-list") => knowledge_list_command(arguments),
        Some("knowledge-search") => knowledge_search_command(arguments),
        Some("run-task") => run_task(arguments),
        Some("run-skill") => run_skill(arguments),
        Some("run-status") => run_status(arguments),
        Some("recover-runtime") => recover_runtime(arguments),
        Some("continue-run") => continue_run(arguments),
        Some("resolve-action-result") => resolve_action_result(arguments),
        Some("capability-readiness") => capability_readiness(arguments),
        Some("list-tasks") => list_tasks(arguments),
        Some("usage-summary") => usage_summary(arguments),
        Some("cancel-task") => cancel_task(arguments),
        Some("events") => list_events(arguments),
        Some("task-thread-create") => task_thread_create(arguments),
        Some("task-thread-list") => task_thread_list(arguments),
        Some("task-thread-get") => task_thread_get(arguments),
        Some("task-thread-message") => task_thread_message(arguments),
        Some("task-thread-timeline") => task_thread_timeline(arguments),
        Some("task-thread-retention") => task_thread_retention(arguments),
        Some("task-proposal-generate") => task_proposal_generate(arguments),
        Some("task-proposal-regenerate") => task_proposal_regenerate(arguments),
        Some("task-proposal-current") => task_proposal_current(arguments),
        Some("task-proposal-confirm") => task_proposal_confirm(arguments),
        Some("scenario-list") => scenario_list(arguments),
        Some("scenario-propose") => scenario_propose(arguments),
        Some("scenario-get") => scenario_get(arguments),
        Some("scenario-validate") => scenario_validate(arguments),
        Some("scenario-save") => scenario_save(arguments),
        Some("scenario-disable") => scenario_disable(arguments),
        Some("business-flow-start") => business_flow_start(arguments),
        Some("business-flow-plan") => business_flow_plan(arguments),
        Some("business-flow-status") => business_flow_status(arguments),
        Some("business-flow-list") => business_flow_list(arguments),
        Some("business-flow-continue") => business_flow_continue(arguments),
        _ => Err(usage()),
    }
}

fn task_thread_create(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut title = None;
    let mut objective = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--title" => title = arguments.next(),
            "--objective" => objective = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let title = title.ok_or_else(usage)?;
    let objective = objective.ok_or_else(usage)?;
    if title.trim().is_empty() || objective.trim().is_empty() {
        return Err("task_thread_input_required".into());
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    let thread_id = format!("thread_{}", unique_suffix());
    let message_id = format!("message_{}", unique_suffix());
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO task_threads(id,title,status,current_revision,created_at,updated_at) VALUES (?1,?2,'drafting',1,?3,?3)", rusqlite::params![thread_id,title,stamp]).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,created_at) VALUES (?1,?2,1,'user','goal',?3,?4)", rusqlite::params![message_id,thread_id,objective,stamp]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    task_thread_projection(&connection, &thread_id)
}

fn task_thread_list(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut archived = false;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--archived" => archived = true,
            _ => return Err(usage()),
        }
    }
    let database = database.ok_or_else(usage)?;
    let mut connection = Connection::open(database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let mut statement = connection
        .prepare(if archived {
            "SELECT id FROM task_threads WHERE deleted_at IS NULL AND archived_at IS NOT NULL ORDER BY updated_at DESC,id"
        } else {
            "SELECT id FROM task_threads WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY updated_at DESC,id"
        })
        .map_err(|e| e.to_string())?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(statement);
    Ok(Value::Array(
        ids.iter()
            .map(|id| task_thread_projection(&connection, id))
            .collect::<Result<Vec<_>, _>>()?,
    ))
}

fn task_thread_retention(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut thread_id = None;
    let mut operation = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--thread-id" => thread_id = arguments.next(),
            "--operation" => operation = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let thread_id = thread_id.ok_or_else(usage)?;
    let operation = operation.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    let changed = match operation.as_str() {
        "archive" => connection.execute("UPDATE task_threads SET archived_at=?2,updated_at=?2 WHERE id=?1 AND deleted_at IS NULL", rusqlite::params![thread_id,stamp]),
        "restore" => connection.execute("UPDATE task_threads SET archived_at=NULL,updated_at=?2 WHERE id=?1 AND deleted_at IS NULL", rusqlite::params![thread_id,stamp]),
        "delete" => connection.execute("UPDATE task_threads SET deleted_at=?2,updated_at=?2 WHERE id=?1 AND deleted_at IS NULL", rusqlite::params![thread_id,stamp]),
        _ => return Err("task_thread_retention_operation_invalid".into()),
    }.map_err(|e| e.to_string())?;
    if changed != 1 {
        return Err("task_thread_not_found".into());
    }
    Ok(
        json!({"schema_version":"1.0.0","thread_id":thread_id,"operation":operation,"updated_at":stamp}),
    )
}

fn task_thread_get(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut thread_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--thread-id" => thread_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    task_thread_projection(&connection, &thread_id.ok_or_else(usage)?)
}

fn task_thread_timeline(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut thread_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--thread-id" => thread_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    task_room_timeline_projection(&connection, &thread_id.ok_or_else(usage)?)
}

fn task_thread_message(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut thread_id = None;
    let mut input = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--thread-id" => thread_id = arguments.next(),
            "--input" => input = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let thread_id = thread_id.ok_or_else(usage)?;
    let input = input.ok_or_else(usage)?.trim().to_owned();
    if input.is_empty() {
        return Err("task_thread_message_required".into());
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let status: String = tx
        .query_row(
            "SELECT status FROM task_threads WHERE id=?1",
            [&thread_id],
            |r| r.get(0),
        )
        .map_err(|_| "task_thread_not_found".to_owned())?;
    if matches!(
        status.as_str(),
        "materialized" | "running" | "succeeded" | "failed" | "cancelled"
    ) {
        return Err("task_thread_already_materialized".into());
    }
    let sequence: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_thread_messages WHERE thread_id=?1",
            [&thread_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,created_at) VALUES (?1,?2,?3,'user','clarification',?4,?5)",rusqlite::params![format!("message_{}",unique_suffix()),thread_id,sequence,input,stamp]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE task_proposals SET status='rejected',updated_at=?2 WHERE thread_id=?1 AND status IN ('awaiting_input','validated')",rusqlite::params![thread_id,stamp]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE task_threads SET status='drafting',current_revision=current_revision+1,updated_at=?2 WHERE id=?1",rusqlite::params![thread_id,stamp]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    task_thread_projection(&connection, &thread_id)
}

fn task_thread_projection(connection: &Connection, thread_id: &str) -> Result<Value, String> {
    let thread: (String,String,i64,String,String,Option<String>)=connection.query_row("SELECT title,status,current_revision,created_at,updated_at,archived_at FROM task_threads WHERE id=?1 AND deleted_at IS NULL",[thread_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).map_err(|_|"task_thread_not_found".to_owned())?;
    let root_task:Option<(String,String)>=connection.query_row("SELECT binding.task_id,task.status FROM task_thread_task_bindings binding JOIN tasks task ON task.id=binding.task_id WHERE binding.thread_id=?1 AND binding.binding_role IN ('single','root') ORDER BY binding.created_at DESC LIMIT 1",[thread_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
    let root_task_id = root_task.as_ref().map(|item| item.0.clone());
    let projected_status = root_task
        .as_ref()
        .map_or(thread.1.as_str(), |item| item.1.as_str());
    let execution = if let Some(task_id) = &root_task_id {
        let flow_id: Option<String> = connection
            .query_row(
                "SELECT id FROM business_flows WHERE root_task_id=?1",
                [task_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        flow_id
            .map(|id| project_business_flow(connection, &id))
            .transpose()?
            .map(|flow| serde_json::to_value(flow).map_err(|e| e.to_string()))
            .transpose()?
    } else {
        None
    };
    let mut statement=connection.prepare("SELECT id,sequence,role,kind,content,proposal_id,task_id,created_at FROM task_thread_messages WHERE thread_id=?1 ORDER BY sequence").map_err(|e|e.to_string())?;
    let messages=statement.query_map([thread_id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"sequence":r.get::<_,i64>(1)?,"role":r.get::<_,String>(2)?,"kind":r.get::<_,String>(3)?,"content":r.get::<_,String>(4)?,"proposal_id":r.get::<_,Option<String>>(5)?,"task_id":r.get::<_,Option<String>>(6)?,"created_at":r.get::<_,String>(7)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    let room = task_room_timeline_projection(connection, thread_id)?;
    Ok(
        json!({"schema_version":"1.0.0","id":thread_id,"title":thread.0,"status":projected_status,"current_revision":thread.2,"root_task_id":root_task_id,"execution":execution,"created_at":thread.3,"updated_at":thread.4,"archived_at":thread.5,"messages":messages,"room":room}),
    )
}

fn task_room_timeline_projection(
    connection: &Connection,
    thread_id: &str,
) -> Result<Value, String> {
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM task_threads WHERE id=?1)",
            [thread_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !exists {
        return Err("task_thread_not_found".into());
    }

    let mut participants = Vec::new();
    let mut participant_ids = BTreeSet::new();
    let mut participant_statement = connection
        .prepare(
            "SELECT agent.id,agent.name,agent.role,profile.avatar_path,task.status
             FROM task_thread_task_bindings binding
             JOIN tasks task ON task.id=binding.task_id
             JOIN agents agent ON agent.id=task.agent_id
             LEFT JOIN employee_profiles profile ON profile.agent_id=agent.id
             WHERE binding.thread_id=?1 AND binding.binding_role IN ('single','child')
             ORDER BY binding.created_at,binding.task_id",
        )
        .map_err(|error| error.to_string())?;
    let participant_rows = participant_statement
        .query_map([thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (agent_id, name, role, avatar_path, status) in participant_rows {
        if participant_ids.insert(agent_id.clone()) {
            participants.push(json!({
                "agent_id":agent_id,"name":name,"role":role,
                "avatar_path":avatar_path,"status":status
            }));
        }
    }

    let mut candidates: Vec<(i128, String, Value)> = Vec::new();
    let mut message_statement = connection
        .prepare(
            "SELECT id,role,kind,content,task_id,created_at
             FROM task_thread_messages WHERE thread_id=?1 ORDER BY sequence",
        )
        .map_err(|error| error.to_string())?;
    let messages = message_statement
        .query_map([thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    for (id, role, kind, content, task_id, created_at) in messages {
        candidates.push((
            timeline_sort_time(&created_at),
            format!("0:{id}"),
            timeline_item(
                &id,
                &role,
                &kind,
                &content,
                &created_at,
                None,
                None,
                None,
                None,
                task_id,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            ),
        ));
    }

    let mut run_statement = connection
        .prepare(
            "SELECT run.id,task.id,agent.id,agent.name,agent.role,profile.avatar_path,
                    COALESCE(work.goal,json_extract(task.input,'$.goal'),task.input),run.phase,run.created_at,run.updated_at,
                    (SELECT json_extract(observation.summary_json,'$.question') FROM run_observations observation
                     WHERE observation.run_id=run.id AND observation.kind='model_decision'
                     ORDER BY observation.sequence DESC LIMIT 1)
             FROM task_thread_task_bindings binding
             JOIN tasks task ON task.id=binding.task_id
             JOIN agents agent ON agent.id=task.agent_id
             LEFT JOIN employee_profiles profile ON profile.agent_id=agent.id
             JOIN agent_runs run ON run.task_id=task.id
             LEFT JOIN work_orders work ON work.child_task_id=task.id
             WHERE binding.thread_id=?1 AND binding.binding_role IN ('single','child')",
        )
        .map_err(|error| error.to_string())?;
    let runs = run_statement
        .query_map([thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (
        run_id,
        task_id,
        agent_id,
        name,
        role,
        avatar,
        goal,
        phase,
        created_at,
        updated_at,
        question,
    ) in runs
    {
        let id = format!("timeline:run:{run_id}:started");
        candidates.push((
            timeline_sort_time(&created_at),
            format!("1:{id}"),
            timeline_item(
                &id,
                "agent",
                "agent_update",
                &format!("开始执行：{goal}"),
                &created_at,
                Some(agent_id.clone()),
                Some(name.clone()),
                Some(role.clone()),
                avatar.clone(),
                Some(task_id.clone()),
                Some(run_id.clone()),
                None,
                None,
                None,
                None,
                Some("started".into()),
                None,
                None,
                None,
            ),
        ));
        if phase == "waiting_user" {
            if let Some(question) = question {
                let question_id = format!("timeline:run:{run_id}:question");
                candidates.push((
                    timeline_sort_time(&updated_at),
                    format!("6:{question_id}"),
                    timeline_item(
                        &question_id,
                        "agent",
                        "clarification",
                        &question,
                        &updated_at,
                        Some(agent_id),
                        Some(name),
                        Some(role),
                        avatar,
                        Some(task_id),
                        Some(run_id),
                        None,
                        None,
                        None,
                        None,
                        Some("waiting_user".into()),
                        None,
                        None,
                        None,
                    ),
                ));
            }
        }
    }

    let mut action_statement = connection.prepare(
        "SELECT action.id,task.id,agent.id,agent.name,agent.role,profile.avatar_path,
                action.tool_id,COALESCE(json_extract(action.input_json,'$.action'),''),
                action.status,approval.id,approval.status,action.updated_at
         FROM task_thread_task_bindings binding
         JOIN tasks task ON task.id=binding.task_id JOIN agents agent ON agent.id=task.agent_id
         LEFT JOIN employee_profiles profile ON profile.agent_id=agent.id
         JOIN actions action ON action.task_id=task.id
         LEFT JOIN approvals approval ON approval.id=(
             SELECT candidate.id FROM approvals candidate
             WHERE candidate.task_id=task.id AND candidate.action=json_extract(action.input_json,'$.action')
             ORDER BY candidate.created_at DESC LIMIT 1)
         WHERE binding.thread_id=?1 AND binding.binding_role IN ('single','child')"
    ).map_err(|e|e.to_string())?;
    let actions = action_statement
        .query_map([thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, String>(11)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (
        action_id,
        task_id,
        agent_id,
        name,
        role,
        avatar,
        tool_id,
        action,
        status,
        approval_id,
        approval_status,
        created_at,
    ) in actions
    {
        let kind = if approval_id.is_some() {
            "approval"
        } else {
            "activity"
        };
        let shown_status = approval_status.clone().unwrap_or_else(|| status.clone());
        let content = if approval_status.as_deref() == Some("pending") {
            format!("请求批准执行 {action}")
        } else {
            format!("{action} · {shown_status}")
        };
        let id = format!("timeline:action:{action_id}");
        candidates.push((
            timeline_sort_time(&created_at),
            format!("2:{id}"),
            timeline_item(
                &id,
                "system",
                kind,
                &content,
                &created_at,
                Some(agent_id),
                Some(name),
                Some(role),
                avatar,
                Some(task_id),
                None,
                Some(action_id),
                approval_id,
                None,
                None,
                Some(shown_status),
                tool_id,
                Some(action),
                None,
            ),
        ));
    }

    let mut deliverable_statement=connection.prepare(
        "SELECT deliverable.id,deliverable.task_id,agent.id,agent.name,agent.role,profile.avatar_path,
                deliverable.summary,deliverable.output_json,deliverable.status,deliverable.created_at,
                (SELECT artifact.uri FROM deliverable_evidence evidence JOIN artifacts artifact ON artifact.id=evidence.evidence_ref
                 WHERE evidence.deliverable_id=deliverable.id AND evidence.evidence_type='artifact'
                 ORDER BY artifact.created_at DESC LIMIT 1),
                EXISTS(SELECT 1 FROM business_flow_outputs output WHERE output.deliverable_id=deliverable.id)
         FROM task_thread_task_bindings binding JOIN deliverables deliverable ON deliverable.task_id=binding.task_id
         JOIN tasks task ON task.id=deliverable.task_id JOIN agents agent ON agent.id=task.agent_id
         LEFT JOIN employee_profiles profile ON profile.agent_id=agent.id
         WHERE binding.thread_id=?1 AND binding.binding_role IN ('single','child') AND deliverable.status='verified'"
    ).map_err(|e|e.to_string())?;
    let deliverables = deliverable_statement
        .query_map([thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, bool>(11)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (
        deliverable_id,
        task_id,
        agent_id,
        name,
        role,
        avatar,
        summary,
        output_raw,
        status,
        created_at,
        artifact_uri,
        is_root,
    ) in deliverables
    {
        let content = readable_deliverable_content(&output_raw, &summary);
        let id = format!("timeline:deliverable:{deliverable_id}:agent");
        candidates.push((
            timeline_sort_time(&created_at),
            format!("3:{id}"),
            timeline_item(
                &id,
                "agent",
                "agent_update",
                &content,
                &created_at,
                Some(agent_id.clone()),
                Some(name.clone()),
                Some(role.clone()),
                avatar.clone(),
                Some(task_id.clone()),
                None,
                None,
                None,
                None,
                Some(deliverable_id.clone()),
                Some(status.clone()),
                None,
                None,
                artifact_uri.clone(),
            ),
        ));
        if is_root || artifact_uri.is_some() {
            let card_id = format!("timeline:deliverable:{deliverable_id}:card");
            candidates.push((
                timeline_sort_time(&created_at),
                format!("5:{card_id}"),
                timeline_item(
                    &card_id,
                    "system",
                    "deliverable",
                    &artifact_uri.as_ref().map_or_else(
                        || "最终交付物已通过 Runtime 验证。".to_owned(),
                        |uri| format!("最终交付物已通过 Runtime 验证：{uri}"),
                    ),
                    &created_at,
                    Some(agent_id),
                    Some(name),
                    Some(role),
                    avatar,
                    Some(task_id),
                    None,
                    None,
                    None,
                    None,
                    Some(deliverable_id),
                    Some(status),
                    None,
                    None,
                    artifact_uri,
                ),
            ));
        }
    }

    let mut handoff_statement = connection
        .prepare(
            "SELECT handoff.id,handoff.summary,handoff.acceptance,handoff.created_at,
                source_agent.name,target_agent.name,handoff.deliverable_id
         FROM handoffs handoff
         JOIN work_orders source ON source.id=handoff.source_work_order_id
         JOIN work_orders target ON target.id=handoff.target_work_order_id
         JOIN agents source_agent ON source_agent.id=source.assignee_agent_id
         JOIN agents target_agent ON target_agent.id=target.assignee_agent_id
         JOIN business_flows flow ON flow.id=handoff.business_flow_id
         JOIN task_thread_task_bindings binding ON binding.task_id=flow.root_task_id
         WHERE binding.thread_id=?1",
        )
        .map_err(|e| e.to_string())?;
    let handoffs = handoff_statement
        .query_map([thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (handoff_id, summary, status, created_at, source, target, deliverable_id) in handoffs {
        let id = format!("timeline:handoff:{handoff_id}");
        candidates.push((
            timeline_sort_time(&created_at),
            format!("4:{id}"),
            timeline_item(
                &id,
                "system",
                "handoff",
                &format!("{source} 已将结果交接给 {target}：{summary}"),
                &created_at,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(handoff_id),
                Some(deliverable_id),
                Some(status),
                None,
                None,
                None,
            ),
        ));
    }

    candidates.sort_by(|left, right| left.0.cmp(&right.0).then(left.1.cmp(&right.1)));
    let items = candidates
        .into_iter()
        .enumerate()
        .map(|(index, (_, _, mut item))| {
            item["sequence"] = json!((index + 1) as i64);
            item
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"schema_version":"1.0.0","thread_id":thread_id,"participants":participants,"items":items}),
    )
}

#[allow(clippy::too_many_arguments)]
fn timeline_item(
    id: &str,
    role: &str,
    kind: &str,
    content: &str,
    created_at: &str,
    agent_id: Option<String>,
    agent_name: Option<String>,
    agent_role: Option<String>,
    avatar_path: Option<String>,
    task_id: Option<String>,
    run_id: Option<String>,
    action_id: Option<String>,
    approval_id: Option<String>,
    handoff_id: Option<String>,
    deliverable_id: Option<String>,
    status: Option<String>,
    tool_id: Option<String>,
    action: Option<String>,
    artifact_uri: Option<String>,
) -> Value {
    json!({"id":id,"sequence":0,"role":role,"kind":kind,"content":content,"created_at":created_at,
        "agent_id":agent_id,"agent_name":agent_name,"agent_role":agent_role,"avatar_path":avatar_path,
        "task_id":task_id,"run_id":run_id,"action_id":action_id,"approval_id":approval_id,
        "handoff_id":handoff_id,"deliverable_id":deliverable_id,"status":status,"tool_id":tool_id,
        "action":action,"artifact_uri":artifact_uri})
}

fn readable_deliverable_content(output_raw: &str, summary: &str) -> String {
    serde_json::from_str::<Value>(output_raw)
        .ok()
        .and_then(|value| {
            value
                .get("answer")
                .or_else(|| value.get("summary"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| summary.to_owned())
}

fn timeline_sort_time(value: &str) -> i128 {
    let parsed = value.parse::<i128>().unwrap_or(0);
    if parsed > 0 && parsed < 1_000_000_000_000 {
        parsed * 1_000
    } else {
        parsed
    }
}

enum ProposalGenerationMode {
    Initial,
    Regenerate,
}

fn task_proposal_generate(arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    task_proposal_generation_command(arguments, ProposalGenerationMode::Initial)
}

fn task_proposal_regenerate(arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    task_proposal_generation_command(arguments, ProposalGenerationMode::Regenerate)
}

fn task_proposal_generation_command(
    mut arguments: impl Iterator<Item = String>,
    mode: ProposalGenerationMode,
) -> Result<Value, String> {
    let mut database = None;
    let mut repository_root = None;
    let mut thread_id = None;
    let mut preferred_agent_id = None;
    let mut python = PathBuf::from("python3");
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--thread-id" => thread_id = arguments.next(),
            "--preferred-agent-id" => preferred_agent_id = arguments.next(),
            "--python" => python = PathBuf::from(arguments.next().ok_or_else(usage)?),
            _ => return Err(usage()),
        }
    }
    let thread_id = thread_id.ok_or_else(usage)?;
    let root = repository_root.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    connection
        .query_row(
            "SELECT m.content FROM task_threads t JOIN task_thread_messages m ON m.thread_id=t.id
         WHERE t.id=?1 AND t.deleted_at IS NULL AND m.kind='goal' ORDER BY m.sequence LIMIT 1",
            [&thread_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|_| "task_thread_not_found".to_owned())?;
    match generate_task_proposal(
        &mut connection,
        &root,
        &python,
        &thread_id,
        preferred_agent_id,
        mode,
    ) {
        Ok(response) => Ok(response),
        Err(error) => {
            let safe_code = safe_task_proposal_error_code(&error);
            record_task_proposal_failure(&mut connection, &thread_id, safe_code)?;
            Err(error)
        }
    }
}

fn generate_task_proposal(
    connection: &mut Connection,
    root: &Path,
    python: &Path,
    thread_id: &str,
    preferred_agent_id: Option<String>,
    mode: ProposalGenerationMode,
) -> Result<Value, String> {
    generate_task_proposal_with_hook(
        connection,
        root,
        python,
        thread_id,
        preferred_agent_id,
        mode,
        || Ok(()),
    )
}

fn generate_task_proposal_with_hook(
    connection: &mut Connection,
    root: &Path,
    python: &Path,
    thread_id: &str,
    preferred_agent_id: Option<String>,
    mode: ProposalGenerationMode,
    before_save: impl FnOnce() -> Result<(), String>,
) -> Result<Value, String> {
    if matches!(mode, ProposalGenerationMode::Regenerate) {
        let stamp = now();
        let current_epoch_seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
        let tx = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| error.to_string())?;
        let old_count = tx
            .execute(
                "UPDATE task_proposals SET status=CASE WHEN expires_at<?2 THEN 'expired' ELSE 'rejected' END,updated_at=?3
                 WHERE thread_id=?1 AND status IN ('awaiting_input','validated')",
                rusqlite::params![thread_id, current_epoch_seconds, stamp],
            )
            .map_err(|error| error.to_string())?;
        if old_count > 0 {
            tx.execute(
                "UPDATE task_threads SET status='drafting',current_revision=current_revision+1,updated_at=?2 WHERE id=?1",
                rusqlite::params![thread_id, stamp],
            )
            .map_err(|error| error.to_string())?;
        }
        tx.commit().map_err(|error| error.to_string())?;
    }
    let revision: i64 = connection
        .query_row(
            "SELECT current_revision FROM task_threads WHERE id=?1",
            [thread_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let objective:String=connection.query_row("SELECT content FROM task_thread_messages WHERE thread_id=?1 AND kind='goal' ORDER BY sequence LIMIT 1",[&thread_id],|r|r.get(0)).map_err(|_|"task_thread_not_found".to_owned())?;
    let mut statement=connection.prepare("SELECT a.id,a.name FROM agents a JOIN employee_profiles p ON p.agent_id=a.id WHERE a.status='active' ORDER BY a.id").map_err(|e|e.to_string())?;
    let employees = statement
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(statement);
    let catalog = employees
        .into_iter()
        .filter_map(|(id, name)| {
            let caps =
                ai_employee_runtime::skill_resolver::ready_skill_ids(&connection, &id).ok()?;
            (!caps.is_empty())
                .then(|| json!({"agent_id":id,"display_name":name,"ready_capabilities":caps}))
        })
        .collect::<Vec<_>>();
    if catalog.is_empty() {
        return Err("task_proposal_employee_catalog_empty".into());
    }
    let mut context_statement=connection.prepare("SELECT role,kind,content FROM task_thread_messages WHERE thread_id=?1 AND kind IN ('clarification') ORDER BY sequence").map_err(|e|e.to_string())?;
    let thread_context=context_statement.query_map([&thread_id],|r|Ok(json!({"role":r.get::<_,String>(0)?,"kind":r.get::<_,String>(1)?,"content":r.get::<_,String>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    drop(context_statement);
    let request = json!({"schema_version":"1.0.0","objective":objective,"thread_context":thread_context,"employee_catalog":catalog.clone(),"preferred_agent_id":preferred_agent_id});
    let worker_root = root.join("runtime/python-agent");
    let mut child = Command::new(python)
        .args(["-m", "app.task_proposal_worker"])
        .env("PYTHONPATH", &worker_root)
        .current_dir(&worker_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("task_proposal_worker_disconnect:{e}"))?;
    child
        .stdin
        .take()
        .ok_or("task_proposal_worker_disconnect")?
        .write_all(request.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_code = serde_json::from_str::<Value>(stderr.trim())
            .ok()
            .and_then(|value| value["error_code"].as_str().map(str::to_owned))
            .unwrap_or_else(|| "invalid_response".to_owned());
        return Err(format!("task_proposal_provider_{error_code}"));
    }
    let proposal: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("task_proposal_schema_invalid:{e}"))?;
    validate_task_proposal_schema(&proposal)
        .map_err(|error| format!("task_proposal_schema_invalid:{error}"))?;
    let assignments = proposal["assignments"]
        .as_array()
        .ok_or("task_proposal_assignments_invalid")?;
    if proposal["intent"] == "chat" {
        return Err("task_proposal_chat_not_executable".into());
    }
    if assignments.is_empty() {
        return Err("task_proposal_assignments_empty".into());
    }
    for assignment in assignments {
        let preferred = assignment["employee_selector"]["preferred_id"].as_str();
        if let Some(id) = preferred {
            if !catalog.iter().any(|e| e["agent_id"] == id) {
                return Err(format!("task_proposal_agent_unavailable:{id}"));
            }
        }
    }
    let resolved_assignments = resolve_all_assignments(&connection, &proposal)?;
    before_save()?;
    let canonical = serde_json::to_string(&proposal).map_err(|e| e.to_string())?;
    let hash = format!("{:x}", Sha256::digest(canonical.as_bytes()));
    let mut proposal_id = format!("proposal_{}", unique_suffix());
    let stamp = now();
    let expires_at = (SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + 900)
        .to_string();
    let status = if proposal["missing_inputs"]
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item["required"] == true))
    {
        "awaiting_input"
    } else {
        "awaiting_confirmation"
    };
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let thread_updated = tx
        .execute(
            "UPDATE task_threads SET status=?2,updated_at=?3
             WHERE id=?1 AND current_revision=?4",
            rusqlite::params![thread_id, status, stamp, revision],
        )
        .map_err(|error| error.to_string())?;
    if thread_updated != 1 {
        return Err("task_proposal_revision_conflict".into());
    }
    let stored_status = if status == "awaiting_input" {
        "awaiting_input"
    } else {
        "validated"
    };
    let reusable_proposal_id: Option<String> = tx
        .query_row(
            "SELECT id FROM task_proposals
             WHERE thread_id=?1 AND proposal_sha256=?2 AND status IN ('expired','rejected')",
            rusqlite::params![thread_id, hash],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(reusable_proposal_id) = reusable_proposal_id {
        proposal_id = reusable_proposal_id;
        let reused = tx
            .execute(
                "UPDATE task_proposals SET revision=?2,status=?3,proposal_json=?4,expires_at=?5,
                 confirmed_at=NULL,updated_at=?6 WHERE id=?1 AND status IN ('expired','rejected')",
                rusqlite::params![
                    proposal_id,
                    revision,
                    stored_status,
                    canonical,
                    expires_at,
                    stamp
                ],
            )
            .map_err(|error| error.to_string())?;
        if reused != 1 {
            return Err("task_proposal_revision_conflict".into());
        }
    } else {
        tx.execute("INSERT INTO task_proposals(id,thread_id,revision,status,proposal_json,proposal_sha256,expires_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",rusqlite::params![proposal_id,thread_id,revision,stored_status,canonical,hash,expires_at,stamp]).map_err(|e|e.to_string())?;
    }
    let sequence: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_thread_messages WHERE thread_id=?1",
            [&thread_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,proposal_id,created_at) VALUES (?1,?2,?3,'system','proposal',?4,?5,?6)",rusqlite::params![format!("message_{}",unique_suffix()),thread_id,sequence,proposal["title"].as_str().unwrap_or("执行方案"),proposal_id,stamp]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    let mut response = task_proposal_response(
        &proposal_id,
        &thread_id,
        &hash,
        resolved_assignments,
        proposal,
    );
    let object = response
        .as_object_mut()
        .expect("task proposal response is an object");
    object.insert("revision".into(), json!(revision));
    object.insert("expires_at".into(), json!(expires_at));
    Ok(response)
}

fn safe_task_proposal_error_code(error: &str) -> &'static str {
    match error {
        "task_proposal_provider_network" => "task_proposal_provider_network",
        "task_proposal_provider_rate_limited" => "task_proposal_provider_rate_limited",
        "task_proposal_provider_authentication" => "task_proposal_provider_authentication",
        "task_proposal_provider_quota" => "task_proposal_provider_quota",
        "task_proposal_provider_server_temporary" => "task_proposal_provider_server_temporary",
        "task_proposal_provider_dependency_unavailable" => {
            "task_proposal_provider_dependency_unavailable"
        }
        "task_proposal_provider_invalid_response" => "task_proposal_provider_invalid_response",
        "task_proposal_schema_invalid" => "task_proposal_schema_invalid",
        "task_proposal_employee_catalog_empty" => "task_proposal_employee_catalog_empty",
        "task_proposal_assignee_not_ready" => "task_proposal_assignee_not_ready",
        "task_proposal_expired" => "task_proposal_expired",
        "task_proposal_stale" => "task_proposal_stale",
        "task_proposal_revision_conflict" => "task_proposal_revision_conflict",
        "task_proposal_not_found" => "task_proposal_not_found",
        _ => "task_proposal_unknown",
    }
}

fn record_task_proposal_failure(
    connection: &mut Connection,
    thread_id: &str,
    error_code: &str,
) -> Result<(), String> {
    let safe_code = safe_task_proposal_error_code(error_code);
    let stamp = now();
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let sequence: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_thread_messages WHERE thread_id=?1",
            [thread_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,created_at)
         VALUES (?1,?2,?3,'system','error',?4,?5)",
        rusqlite::params![
            format!("message_{}", unique_suffix()),
            thread_id,
            sequence,
            safe_code,
            stamp
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())
}

fn task_proposal_current(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let (database, thread_id) = parse_database_and_thread_id(&mut arguments)?;
    let connection = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| error.to_string())?;
    let (proposal_id, raw, hash, expires_at): (String, String, String, String) = connection
        .query_row(
            "SELECT id,proposal_json,proposal_sha256,expires_at FROM task_proposals
             WHERE thread_id=?1 AND revision=(SELECT current_revision FROM task_threads WHERE id=?1)
             AND status IN ('awaiting_input','validated') ORDER BY created_at DESC LIMIT 1",
            [&thread_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "task_proposal_not_found".to_owned())?;
    let current = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if current
        > expires_at
            .parse::<u64>()
            .map_err(|_| "task_proposal_expiry_invalid")?
    {
        return Err("task_proposal_expired".into());
    }
    let proposal: Value = serde_json::from_str(&raw).map_err(|_| "task_proposal_invalid")?;
    validate_task_proposal_schema(&proposal).map_err(|_| "task_proposal_schema_invalid")?;
    let resolved_assignments = resolve_all_assignments(&connection, &proposal)
        .map_err(|_| "task_proposal_stale".to_owned())?;
    Ok(task_proposal_response(
        &proposal_id,
        &thread_id,
        &hash,
        resolved_assignments,
        proposal,
    ))
}

fn parse_database_and_thread_id(
    arguments: &mut impl Iterator<Item = String>,
) -> Result<(PathBuf, String), String> {
    let mut database = None;
    let mut thread_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--thread-id" => thread_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    Ok((database.ok_or_else(usage)?, thread_id.ok_or_else(usage)?))
}

fn validate_task_proposal_schema(proposal: &Value) -> Result<(), String> {
    let schema: Value =
        serde_json::from_str(include_str!("../../../contracts/task-proposal.schema.json"))
            .map_err(|error| error.to_string())?;
    ai_employee_runtime::json_schema::validate(&schema, proposal)
}

fn resolve_all_assignments(
    connection: &Connection,
    proposal: &Value,
) -> Result<Vec<Value>, String> {
    proposal["assignments"]
        .as_array()
        .ok_or("task_proposal_assignments_invalid")?
        .iter()
        .map(|assignment| {
            let (agent_id, skill_ids) = resolve_task_assignment(connection, assignment)?;
            Ok(json!({"node_id":assignment["node_id"],"agent_id":agent_id,"skill_ids":skill_ids}))
        })
        .collect()
}

fn task_proposal_response(
    proposal_id: &str,
    thread_id: &str,
    hash: &str,
    resolved_assignments: Vec<Value>,
    proposal: Value,
) -> Value {
    json!({
        "schema_version":"1.0.0",
        "proposal_id":proposal_id,
        "thread_id":thread_id,
        "proposal_hash":hash,
        "requires_confirmation":true,
        "resolved_assignments":resolved_assignments,
        "proposal":proposal
    })
}

fn task_proposal_confirm(arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    task_proposal_confirm_with_hook(arguments, |_, _| Ok(()))
}

fn task_proposal_confirm_with_hook(
    mut arguments: impl Iterator<Item = String>,
    after_claim: impl FnOnce(&str, &str) -> Result<(), String>,
) -> Result<Value, String> {
    let mut database = None;
    let mut repository_root = None;
    let mut proposal_id = None;
    let mut proposal_hash = None;
    let mut python = PathBuf::from("python3");
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--proposal-id" => proposal_id = arguments.next(),
            "--proposal-hash" => proposal_hash = arguments.next(),
            "--python" => python = PathBuf::from(arguments.next().ok_or_else(usage)?),
            _ => return Err(usage()),
        }
    }
    let proposal_id = proposal_id.ok_or_else(usage)?;
    let expected_hash = proposal_hash.ok_or_else(usage)?;
    let root = repository_root.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    bootstrap_packages(&mut connection, &root, &now())?;
    let (thread_id, status, raw, stored_hash): (String, String, String, String) = connection
        .query_row(
            "SELECT thread_id,status,proposal_json,proposal_sha256 FROM task_proposals WHERE id=?1",
            [&proposal_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| "task_proposal_not_found".to_owned())?;
    if status == "materialized" {
        return Ok(
            json!({"schema_version":"1.0.0","thread":task_thread_projection(&connection,&thread_id)?}),
        );
    }
    if status != "validated" || stored_hash != expected_hash {
        return Err("task_proposal_revision_conflict".into());
    }
    let expires_at: u64 = connection
        .query_row(
            "SELECT expires_at FROM task_proposals WHERE id=?1",
            [&proposal_id],
            |r| r.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?
        .parse()
        .map_err(|_| "task_proposal_expiry_invalid")?;
    let current = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if current > expires_at {
        connection.execute("UPDATE task_proposals SET status='expired',updated_at=?2 WHERE id=?1 AND status='validated'",rusqlite::params![proposal_id,now()]).map_err(|e|e.to_string())?;
        return Err("task_proposal_expired".into());
    }
    let proposal: Value = serde_json::from_str(&raw).map_err(|_| "task_proposal_invalid")?;
    if proposal["missing_inputs"]
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item["required"] == true))
    {
        return Err("task_proposal_requires_input".into());
    }
    let assignments = proposal["assignments"]
        .as_array()
        .ok_or("task_proposal_assignments_invalid")?;
    if assignments.is_empty() {
        return Err("task_proposal_assignments_empty".into());
    }
    let resolved = assignments
        .iter()
        .map(|assignment| resolve_task_assignment(&connection, assignment))
        .collect::<Result<Vec<_>, _>>()?;
    let is_single_agent = proposal["intent"] == "single_agent_task" && resolved.len() == 1;
    if !is_single_agent && (proposal["intent"] != "multi_agent_task" || resolved.len() < 2) {
        return Err("task_proposal_intent_assignment_mismatch".into());
    }
    let scenario = if is_single_agent {
        None
    } else {
        let scenario = task_proposal_to_scenario(&proposal_id, &proposal, &resolved)?;
        validate_scenario(&connection, scenario.clone())?;
        Some(scenario)
    };
    let stamp = now();
    claim_task_proposal_confirmation(&mut connection, &proposal_id, &expected_hash, &stamp)?;
    after_claim(&thread_id, &proposal_id)?;
    if is_single_agent {
        let result = execute_agent(
            &mut connection,
            &root,
            &python,
            &resolved[0].0,
            json!({"objective": proposal["objective"], "acceptance_criteria": proposal["acceptance_criteria"], "requested_resources": proposal["requested_resources"]}),
            None,
        )?;
        let task_id = result["task_id"]
            .as_str()
            .ok_or("task_materialization_failed")?;
        bind_materialized_task(
            &mut connection,
            &thread_id,
            &proposal_id,
            task_id,
            "single",
            &stamp,
        )?;
        return Ok(
            json!({"schema_version":"1.0.0","thread":task_thread_projection(&connection,&thread_id)?,"execution":result}),
        );
    }

    let scenario = scenario.expect("multi-agent proposal has a validated scenario");
    let scenario_id = format!("internal:{proposal_id}");
    let saved = save_scenario(
        &mut connection,
        &scenario_id,
        "ai_proposal",
        scenario,
        &stamp,
    )?;
    let flow_id = format!("flow_{}", unique_suffix());
    let flow = start_business_flow(
        &mut connection,
        &flow_id,
        &scenario_id,
        &saved.sha256,
        &stamp,
    )?;
    bind_materialized_task(
        &mut connection,
        &thread_id,
        &proposal_id,
        &flow.root_task_id,
        "root",
        &stamp,
    )?;
    for work in &flow.work_orders {
        bind_materialized_task(
            &mut connection,
            &thread_id,
            &proposal_id,
            &work.child_task_id,
            "child",
            &stamp,
        )?;
    }
    for _ in 0..resolved.len() {
        if next_ready_work_order(&connection, &flow_id)?.is_none() {
            break;
        }
        let _ = drive_business_flow_once(&mut connection, &root, &python, &flow_id)?;
    }
    let flow = project_business_flow(&connection, &flow_id)?;
    Ok(
        json!({"schema_version":"1.0.0","thread":task_thread_projection(&connection,&thread_id)?,"execution":flow}),
    )
}

fn claim_task_proposal_confirmation(
    connection: &mut Connection,
    proposal_id: &str,
    expected_hash: &str,
    stamp: &str,
) -> Result<(), String> {
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let claimed = tx
        .execute(
            "UPDATE task_proposals SET status='confirmed',confirmed_at=?3,updated_at=?3
             WHERE id=?1 AND proposal_sha256=?2 AND status='validated'
             AND revision=(SELECT current_revision FROM task_threads WHERE id=task_proposals.thread_id)",
            rusqlite::params![proposal_id, expected_hash, stamp],
        )
        .map_err(|error| error.to_string())?;
    if claimed != 1 {
        return Err("task_proposal_revision_conflict".into());
    }
    tx.commit().map_err(|error| error.to_string())
}

fn resolve_task_assignment(
    connection: &Connection,
    assignment: &Value,
) -> Result<(String, Vec<String>), String> {
    let requested = assignment["employee_selector"]["capabilities"]
        .as_array()
        .ok_or("task_proposal_capabilities_invalid")?
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if requested.is_empty() {
        return Err("task_proposal_capabilities_empty".into());
    }
    let preferred = assignment["employee_selector"]["preferred_id"].as_str();
    let mut statement = connection
        .prepare("SELECT id FROM agents WHERE status='active' ORDER BY id")
        .map_err(|e| e.to_string())?;
    let candidates = statement
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for id in candidates {
        if preferred.is_some_and(|value| value != id) {
            continue;
        }
        let ready = ai_employee_runtime::skill_resolver::ready_skill_ids(connection, &id)?;
        if requested
            .iter()
            .all(|capability| ready.contains(capability))
        {
            return Ok((id, requested));
        }
    }
    Err("task_proposal_assignee_not_ready".into())
}

fn task_proposal_to_scenario(
    proposal_id: &str,
    proposal: &Value,
    resolved: &[(String, Vec<String>)],
) -> Result<ScenarioProposal, String> {
    let assignments = proposal["assignments"]
        .as_array()
        .ok_or("task_proposal_assignments_invalid")?;
    let finalizers = assignments
        .iter()
        .enumerate()
        .filter(|(_, item)| item["role"] == "finalizer")
        .collect::<Vec<_>>();
    if finalizers.len() != 1 {
        return Err("task_proposal_finalizer_required".into());
    }
    let coordinator = resolved[finalizers[0].0].0.clone();
    let criteria: Vec<AcceptanceCriterion> =
        serde_json::from_value(proposal["acceptance_criteria"].clone())
            .map_err(|_| "task_proposal_acceptance_invalid")?;
    if criteria.is_empty() {
        return Err("task_proposal_acceptance_required".into());
    }
    let budget = &proposal["budget_hint"];
    let make_budget = || WorkBudget {
        max_input_tokens: budget["input_tokens"]
            .as_u64()
            .unwrap_or(1)
            .clamp(1, 200_000),
        max_output_tokens: budget["output_tokens"]
            .as_u64()
            .unwrap_or(1)
            .clamp(1, 64_000),
        max_tool_rounds: budget["tool_rounds"].as_u64().unwrap_or(0).min(32) as u32,
        max_elapsed_ms: budget["wall_clock_ms"]
            .as_u64()
            .unwrap_or(1)
            .clamp(1, 3_600_000),
    };
    let nodes = assignments
        .iter()
        .enumerate()
        .map(|(index, item)| {
            Ok(ScenarioNodeSpec {
                node_id: item["node_id"]
                    .as_str()
                    .ok_or("task_proposal_node_id_invalid")?
                    .to_owned(),
                role: if item["role"] == "finalizer" {
                    ScenarioNodeRole::Finalization
                } else {
                    ScenarioNodeRole::Executor
                },
                goal: item["goal"]
                    .as_str()
                    .ok_or("task_proposal_goal_invalid")?
                    .to_owned(),
                suggested_agent_id: resolved[index].0.clone(),
                required_capabilities: resolved[index].1.clone(),
                input_refs: vec![],
                acceptance_criteria: serde_json::from_value(item["acceptance_criteria"].clone())
                    .map_err(|_| "task_proposal_assignment_acceptance_invalid")?,
                budget: make_budget(),
                failure_policy: FailurePolicy::Stop,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let edges = assignments
        .iter()
        .flat_map(|item| {
            let successor = item["node_id"].as_str().unwrap_or_default().to_owned();
            item["depends_on"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(move |dependency| {
                    dependency.as_str().map(|predecessor| ScenarioEdgeSpec {
                        predecessor_node_id: predecessor.to_owned(),
                        successor_node_id: successor.clone(),
                        required: true,
                    })
                })
        })
        .collect();
    Ok(ScenarioProposal {
        schema_version: "1.0.0".into(),
        proposal_id: proposal_id.into(),
        title: proposal["title"].as_str().unwrap_or("任务").into(),
        objective: proposal["objective"].as_str().unwrap_or_default().into(),
        overall_acceptance_criteria: criteria,
        coordinator_agent_id: coordinator,
        nodes,
        edges,
        assumptions: vec![],
        risks: vec![],
        questions_for_user: vec![],
    })
}

fn bind_materialized_task(
    connection: &mut Connection,
    thread_id: &str,
    proposal_id: &str,
    task_id: &str,
    role: &str,
    stamp: &str,
) -> Result<(), String> {
    let task_status: String = connection
        .query_row("SELECT status FROM tasks WHERE id=?1", [task_id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let thread_status = match task_status.as_str() {
        "succeeded" => "succeeded",
        "failed" => "failed",
        "cancelled" => "cancelled",
        _ => "running",
    };
    let tx = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    if role != "child" {
        let materialized = tx
            .execute(
                "UPDATE task_proposals SET status='materialized',updated_at=?2 WHERE id=?1 AND status='confirmed'",
                rusqlite::params![proposal_id, stamp],
            )
            .map_err(|e| e.to_string())?;
        if materialized != 1 {
            return Err("task_proposal_revision_conflict".into());
        }
    }
    tx.execute("INSERT OR IGNORE INTO task_thread_task_bindings(thread_id,task_id,proposal_id,binding_role,created_at) VALUES (?1,?2,?3,?4,?5)",rusqlite::params![thread_id,task_id,proposal_id,role,stamp]).map_err(|e|e.to_string())?;
    if role != "child" {
        tx.execute(
            "UPDATE task_threads SET status=?2,updated_at=?3 WHERE id=?1",
            rusqlite::params![thread_id, thread_status, stamp],
        )
        .map_err(|e| e.to_string())?;
        let sequence: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM task_thread_messages WHERE thread_id=?1",
                [thread_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,proposal_id,task_id,created_at) VALUES (?1,?2,?3,'user','confirmation','确认执行',?4,?5,?6)",rusqlite::params![format!("message_{}",unique_suffix()),thread_id,sequence,proposal_id,task_id,stamp]).map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn business_flow_list(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    serde_json::to_value(list_business_flows(&connection)?).map_err(|e| e.to_string())
}

fn business_flow_continue(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut repository_root = None;
    let mut flow_id = None;
    let mut python = PathBuf::from("python3");
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--flow-id" => flow_id = arguments.next(),
            "--python" => python = PathBuf::from(arguments.next().ok_or_else(usage)?),
            _ => return Err(usage()),
        }
    }
    let flow_id = flow_id.ok_or_else(usage)?;
    let repository_root = repository_root.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    bootstrap_packages(&mut connection, &repository_root, &now())?;
    drive_business_flow_once(&mut connection, &repository_root, &python, &flow_id)
}

fn drive_business_flow_once(
    connection: &mut Connection,
    repository_root: &Path,
    python: &Path,
    flow_id: &str,
) -> Result<Value, String> {
    let ready = next_ready_work_order(&connection, &flow_id)?;
    let Some(work_order) = ready else {
        return serde_json::to_value(project_business_flow(connection, flow_id)?)
            .map_err(|e| e.to_string());
    };
    record_work_order_started(connection, flow_id, &work_order.id, &now())?;
    let result = run_existing_agent_task(
        connection,
        repository_root,
        python,
        &work_order.child_task_id,
    )?;
    if result["status"] == "succeeded" {
        let deliverable_id = result["deliverable_id"]
            .as_str()
            .ok_or("deliverable_missing")?;
        return serde_json::to_value(advance_after_child_success(
            connection,
            flow_id,
            &work_order.id,
            deliverable_id,
            &now(),
        )?)
        .map_err(|e| e.to_string());
    }
    if result["status"] == "failed" {
        let projection = settle_failed_work_order(
            connection,
            flow_id,
            &work_order.id,
            result["reason"].as_str().unwrap_or("child_run_failed"),
            &now(),
        )?;
        return Ok(json!({"flow":projection,"run":result}));
    }
    if result["reason"] == "result_unknown" {
        let root_task_id = project_business_flow(connection, flow_id)?.root_task_id;
        let mut event_log = ai_employee_runtime::event::EventLog::default();
        event_log
            .append_persisted(
                connection,
                &root_task_id,
                ai_employee_runtime::event::EventType::BusinessFlowVerificationRequired,
                &now(),
                json!({"work_order_id":work_order.id,"reason":"result_unknown"}),
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(json!({"flow":project_business_flow(connection,flow_id)?,"run":result}))
}

fn scenario_propose(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut repository_root = None;
    let mut input_json = None;
    let mut python = PathBuf::from("python3");
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--input-json" => input_json = arguments.next(),
            "--python" => python = PathBuf::from(arguments.next().ok_or_else(usage)?),
            _ => return Err(usage()),
        }
    }
    let input: Value = serde_json::from_str(&input_json.ok_or_else(usage)?)
        .map_err(|_| "scenario_proposal_input_invalid".to_owned())?;
    let allowed = ["objective", "constraints", "overall_acceptance_criteria"];
    let object = input.as_object().ok_or("scenario_proposal_input_invalid")?;
    if object.keys().any(|key| !allowed.contains(&key.as_str()))
        || !input["objective"].is_string()
        || !input["constraints"].is_array()
        || !input["overall_acceptance_criteria"].is_array()
    {
        return Err("scenario_proposal_input_invalid".into());
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT a.id, a.name FROM agents a
             JOIN employee_profiles p ON p.agent_id=a.id
             WHERE a.status='active' ORDER BY a.id",
        )
        .map_err(|error| error.to_string())?;
    let employees = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);
    let catalog = employees
        .into_iter()
        .filter_map(|(agent_id, display_name)| {
            let capabilities =
                ai_employee_runtime::skill_resolver::ready_skill_ids(&connection, &agent_id)
                    .ok()?;
            (!capabilities.is_empty()).then(|| {
                json!({
                    "agent_id":agent_id,
                    "display_name":display_name,
                    "ready_capabilities":capabilities
                })
            })
        })
        .collect::<Vec<_>>();
    if catalog.is_empty() {
        return Err("scenario_employee_catalog_empty".into());
    }
    let request = json!({
        "schema_version":"1.0.0",
        "objective":input["objective"],
        "constraints":input["constraints"],
        "overall_acceptance_criteria":input["overall_acceptance_criteria"],
        "employee_catalog":catalog
    });
    let root = repository_root.ok_or_else(usage)?;
    let worker_root = root.join("runtime/python-agent");
    let mut child = Command::new(python)
        .args(["-m", "app.scenario_coordinator"])
        .env("PYTHONPATH", &worker_root)
        .current_dir(&worker_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("scenario_coordinator_disconnect:{error}"))?;
    child
        .stdin
        .take()
        .ok_or("scenario_coordinator_disconnect")?
        .write_all(request.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "scenario_coordinator_failed:{}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let proposal: ScenarioProposal = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("scenario_schema_invalid:{error}"))?;
    let validated = validate_scenario(&connection, proposal)?;
    Ok(json!({
        "schema_version":"1.0.0",
        "proposal":validated.proposal,
        "proposal_hash":validated.proposal_hash,
        "execution_order":validated.execution_order,
        "persisted":false
    }))
}

fn scenario_list(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    serde_json::to_value(list_scenarios(&connection)?).map_err(|e| e.to_string())
}

fn scenario_get(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut scenario_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--scenario-id" => scenario_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    serde_json::to_value(get_scenario(&connection, &scenario_id.ok_or_else(usage)?)?)
        .map_err(|e| e.to_string())
}

fn scenario_validate(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut input_json = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--input-json" => input_json = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let proposal: ScenarioProposal = serde_json::from_str(&input_json.ok_or_else(usage)?)
        .map_err(|error| format!("scenario_schema_invalid:{error}"))?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let validated = validate_scenario(&connection, proposal)?;
    Ok(json!({
        "schema_version":"1.0.0",
        "valid":true,
        "proposal_hash":validated.proposal_hash,
        "issues":[],
        "execution_order":validated.execution_order,
        "normalized_proposal":validated.proposal
    }))
}

fn scenario_save(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut scenario_id = None;
    let mut source = None;
    let mut input_json = None;
    let mut confirmed = false;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--scenario-id" => scenario_id = arguments.next(),
            "--source" => source = arguments.next(),
            "--input-json" => input_json = arguments.next(),
            "--confirmed" => confirmed = true,
            _ => return Err(usage()),
        }
    }
    if !confirmed {
        return Err("scenario_confirmation_required".into());
    }
    let proposal: ScenarioProposal = serde_json::from_str(&input_json.ok_or_else(usage)?)
        .map_err(|error| format!("scenario_schema_invalid:{error}"))?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let saved = save_scenario(
        &mut connection,
        &scenario_id.ok_or_else(usage)?,
        &source.ok_or_else(usage)?,
        proposal,
        &now(),
    )?;
    serde_json::to_value(saved).map_err(|e| e.to_string())
}

fn scenario_disable(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut scenario_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--scenario-id" => scenario_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let scenario_id = scenario_id.ok_or_else(usage)?;
    disable_scenario(&connection, &scenario_id, &now())?;
    Ok(json!({"scenario_id":scenario_id,"status":"disabled"}))
}

fn business_flow_start(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut flow_id = None;
    let mut scenario_id = None;
    let mut plan_hash = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--flow-id" => flow_id = arguments.next(),
            "--scenario-id" => scenario_id = arguments.next(),
            "--plan-hash" => plan_hash = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let projection = start_business_flow(
        &mut connection,
        &flow_id.ok_or_else(usage)?,
        &scenario_id.ok_or_else(usage)?,
        &plan_hash.ok_or_else(usage)?,
        &now(),
    )?;
    serde_json::to_value(projection).map_err(|e| e.to_string())
}

fn business_flow_plan(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut scenario_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--scenario-id" => scenario_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let scenario = get_scenario(&connection, &scenario_id.ok_or_else(usage)?)?;
    let validated = validate_scenario(&connection, scenario.definition)?;
    let work_orders = validated
        .execution_order
        .iter()
        .map(|node_id| {
            let node = validated
                .proposal
                .nodes
                .iter()
                .find(|node| &node.node_id == node_id)
                .expect("validated execution order references known nodes");
            let dependencies = validated
                .proposal
                .edges
                .iter()
                .filter(|edge| edge.required && edge.successor_node_id == *node_id)
                .map(|edge| edge.predecessor_node_id.clone())
                .collect::<Vec<_>>();
            json!({
                "node_id":node.node_id,
                "assignee_agent_id":node.suggested_agent_id,
                "role":node.role,
                "dependency_ids":dependencies,
                "budget":node.budget
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "schema_version":"1.0.0",
        "scenario_id":scenario.id,
        "scenario_version_id":scenario.version_id,
        "plan_hash":scenario.sha256,
        "execution_order":validated.execution_order,
        "work_orders":work_orders,
        "blocking_issues":[]
    }))
}

fn business_flow_status(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut flow_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--flow-id" => flow_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    serde_json::to_value(project_business_flow(
        &connection,
        &flow_id.ok_or_else(usage)?,
    )?)
    .map_err(|e| e.to_string())
}

/// DeepSeek V4 Flash 官方人民币单价（CNY / million tokens）。
/// model_calls 尚未记录缓存命中拆分，因此输入统一按缓存未命中价保守估算。
/// Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
const USAGE_INPUT_CACHE_MISS_CNY_PER_MTOK: f64 = 1.0;
const USAGE_OUTPUT_CNY_PER_MTOK: f64 = 2.0;
const USAGE_PRICING_VERSION: &str = "deepseek-v4-flash-cny-v1";
const USAGE_PRICING_SOURCE: &str = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";

fn employee_arguments(
    mut arguments: impl Iterator<Item = String>,
    payload_key: &str,
) -> Result<(PathBuf, Option<PathBuf>, String), String> {
    let mut database = None;
    let mut repository_root = None;
    let mut value = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            key if key == payload_key => value = arguments.next(),
            _ => return Err(usage()),
        }
    }
    Ok((
        database.ok_or_else(usage)?,
        repository_root,
        value.ok_or_else(usage)?,
    ))
}

const DEFAULT_AGENT_ID: &str = "ai-product-manager";
const DEFAULT_AGENT_DISMISSED_FLAG: &str = "default_agent_dismissed";

fn ensure_default_agent(connection: &mut Connection, root: &std::path::Path) -> Result<(), String> {
    let stamp = now();
    bootstrap_packages(connection, root, &stamp)?;
    if default_agent_dismissed(connection)? {
        return Ok(());
    }
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM agents WHERE id=?1)",
            [DEFAULT_AGENT_ID],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !exists {
        let default_agent = install_agent_package(
            connection,
            &root.join("packages/agents/ai-product-manager"),
            &stamp,
        )
        .map_err(|error| format!("could not install default agent: {error:?}"))?;
        let alex_identity = "把模糊需求转化为可执行的产品方案。\n\n职责：需求分析、产品方案、可评审文档。\n\n边界：不虚构缺失事实；没有授权时不执行外部操作。\n\n可靠、直接地协助用户完成产品工作。闲聊不会执行 Skill 或 Tool；工作能力在绑定仓库 Package 后接通。";
        connection.execute(
            "INSERT OR IGNORE INTO employee_profiles (agent_id,department,mission,responsibilities_json,boundaries_json,soul_json,base_prompt,config_version,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8)",
            rusqlite::params![
                default_agent.id,
                "产品部",
                legacy_mission_from_base_prompt(alex_identity),
                json!([]).to_string(),
                json!([]).to_string(),
                json!(["用户价值优先", "区分事实、推测与未知", "结论必须可执行和可验收"]).to_string(),
                alex_identity,
                stamp
            ],
        ).map_err(|error| error.to_string())?;
    }
    let status: Option<String> = connection
        .query_row(
            "SELECT status FROM agents WHERE id=?1",
            [DEFAULT_AGENT_ID],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if status.as_deref() == Some("active") {
        let _ = bind_skill(
            connection,
            DEFAULT_AGENT_ID,
            "local-file-operations",
            "1.0.0",
            &stamp,
        );
        let _ = bind_skill(connection, DEFAULT_AGENT_ID, "web-search", "1.0.0", &stamp);
    }
    Ok(())
}

fn default_agent_dismissed(connection: &Connection) -> Result<bool, String> {
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM runtime_flags WHERE key=?1",
            [DEFAULT_AGENT_DISMISSED_FLAG],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(value.as_deref() == Some("1"))
}

fn dismiss_default_agent(connection: &Connection) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO runtime_flags(key, value, updated_at) VALUES (?1, '1', ?2)
             ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at",
            rusqlite::params![DEFAULT_AGENT_DISMISSED_FLAG, now()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn purge_agent_records(connection: &Connection, agent_id: &str) -> Result<(), String> {
    connection
        .execute(
            "DELETE FROM scoped_permission_grants WHERE subject_id=?1
             OR task_id IN (SELECT id FROM tasks WHERE agent_id=?1)",
            [agent_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM memory_provenance WHERE task_id IN (SELECT id FROM tasks WHERE agent_id=?1)",
            [agent_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM memories WHERE owner_type='agent' AND owner_id=?1",
            [agent_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM model_call_configs WHERE employee_id=?1",
            [agent_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM conversations WHERE agent_id=?1", [agent_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM approvals WHERE agent_id=?1
             OR task_id IN (SELECT id FROM tasks WHERE agent_id=?1)",
            [agent_id],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM evaluations WHERE agent_id=?1", [agent_id])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM tasks WHERE agent_id=?1", [agent_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn bootstrap_packages(
    connection: &mut Connection,
    root: &std::path::Path,
    stamp: &str,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE skills SET status='disabled',updated_at=?1 WHERE id IN (
               'requirement-analysis','prd-generation','structured-summary','write-note',
               'inspect-and-summarize','review-pipeline','review-and-save'
             )",
            [stamp],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE agent_skills SET enabled=0 WHERE skill_id IN (
               'requirement-analysis','prd-generation','structured-summary','write-note',
               'inspect-and-summarize','review-pipeline','review-and-save'
             )",
            [],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "UPDATE tools SET status='disabled',updated_at=?1 WHERE id='document-tool'",
            [stamp],
        )
        .map_err(|error| error.to_string())?;
    let tools = [
        root.join("packages/tools/file-tool"),
        root.join("packages/tools/agent-reach-tool"),
    ];
    for path in tools {
        if path.join("manifest.yaml").is_file() {
            install_tool_package(connection, &path, stamp)
                .map_err(|error| format!("tool install failed at {}: {error:?}", path.display()))?;
        }
    }
    let skills = [
        root.join("packages/skills/local-file-operations"),
        root.join("packages/skills/web-search"),
    ];
    for path in skills {
        if path.join("manifest.yaml").is_file() {
            install_skill_package(connection, &path, stamp)
                .map_err(|error| format!("skill install failed at {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

fn bind_skill(
    connection: &Connection,
    agent_id: &str,
    skill_id: &str,
    skill_version: &str,
    stamp: &str,
) -> Result<(), String> {
    let version: String = connection
        .query_row(
            "SELECT version FROM skills WHERE id=?1 AND status='active'",
            [skill_id],
            |row| row.get(0),
        )
        .map_err(|_| format!("skill {skill_id} is not installed or not active"))?;
    if version != skill_version {
        return Err(format!(
            "skill {skill_id} version mismatch: installed {version}, requested {skill_version}"
        ));
    }
    connection
        .execute(
            "INSERT INTO agent_skills (agent_id, skill_id, enabled, created_at)
             VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(agent_id, skill_id) DO UPDATE SET enabled=1",
            rusqlite::params![agent_id, skill_id, stamp],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn unbind_skill(connection: &Connection, agent_id: &str, skill_id: &str) -> Result<(), String> {
    let updated = connection
        .execute(
            "UPDATE agent_skills SET enabled=0 WHERE agent_id=?1 AND skill_id=?2",
            rusqlite::params![agent_id, skill_id],
        )
        .map_err(|error| error.to_string())?;
    if updated == 0 {
        return Err(format!("skill {skill_id} is not bound to agent {agent_id}"));
    }
    Ok(())
}

fn capabilities(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut repository_root = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    if let Some(root) = repository_root {
        ensure_default_agent(&mut connection, &root)?;
    }
    let skills_installed: i64 = connection
        .query_row(
            "SELECT count(*) FROM skills WHERE status='active'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let tools_installed: i64 = connection
        .query_row(
            "SELECT count(*) FROM tools WHERE status='active'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let tasks_enabled: bool = connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM agent_skills ash
                JOIN agents a ON a.id=ash.agent_id AND a.status='active'
                JOIN skills s ON s.id=ash.skill_id AND s.status='active'
                WHERE ash.enabled=1 AND json_extract(s.manifest_json,'$.schema_version')='2.0.0'
            )",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(json!({
        "schema_version": "1.0",
        "skills_installed": skills_installed,
        "tools_installed": tools_installed,
        "tasks_enabled": tasks_enabled,
        "can_create_packages": false
    }))
}

fn skills_list(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut repository_root = None;
    let mut agent_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--agent-id" => agent_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    if let Some(root) = repository_root {
        ensure_default_agent(&mut connection, &root)?;
    }
    let skills = match agent_id {
        Some(agent_id) => {
            let mut statement = connection
                .prepare(
                    "SELECT s.id, s.name, s.version, s.status, s.path, s.manifest_json
                     FROM agent_skills ash
                     JOIN skills s ON s.id = ash.skill_id
                     WHERE ash.agent_id = ?1 AND ash.enabled = 1 AND s.status = 'active'
                     ORDER BY lower(s.name)",
                )
                .map_err(|e| e.to_string())?;
            statement
                .query_map([agent_id], skill_list_row)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
        None => {
            let mut statement = connection
                .prepare(
                    "SELECT id, name, version, status, path, manifest_json FROM skills WHERE status='active' ORDER BY lower(name)",
                )
                .map_err(|e| e.to_string())?;
            statement
                .query_map([], skill_list_row)
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        }
    };
    Ok(json!({"schema_version":"1.0","skills":skills}))
}

fn skill_list_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<serde_json::Value> {
    let manifest: String = row.get(5)?;
    let parsed: serde_json::Value = serde_json::from_str(&manifest).unwrap_or(json!({}));
    let description = parsed
        .pointer("/skill/description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_owned();
    let category = parsed
        .pointer("/skill/category")
        .and_then(|v| v.as_str())
        .unwrap_or("product")
        .to_owned();
    let path = row.get::<_, String>(4)?;
    let (package_files, documents) = read_skill_package_view(Path::new(&path));
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "name": row.get::<_, String>(1)?,
        "version": row.get::<_, String>(2)?,
        "status": row.get::<_, String>(3)?,
        "path": path,
        "summary": description,
        "category": category,
        "available": true,
        "package_files": package_files,
        "documents": documents
    }))
}

fn read_skill_package_view(root: &Path) -> (Vec<Value>, serde_json::Map<String, Value>) {
    fn visit(
        root: &Path,
        directory: &Path,
        depth: usize,
        files: &mut Vec<Value>,
        documents: &mut serde_json::Map<String, Value>,
        total_document_bytes: &mut usize,
    ) {
        if depth > 4 || files.len() >= 96 {
            return;
        }
        let Ok(entries) = fs::read_dir(directory) else {
            return;
        };
        let mut entries = entries.flatten().collect::<Vec<_>>();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            if files.len() >= 96 {
                break;
            }
            let Ok(metadata) = entry.file_type() else {
                continue;
            };
            if metadata.is_symlink() {
                continue;
            }
            let path = entry.path();
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let relative = relative.to_string_lossy().replace('\\', "/");
            let parent = relative
                .rsplit_once('/')
                .map(|(parent, _)| parent.to_owned());
            let is_directory = metadata.is_dir();
            files.push(json!({
                "path": relative,
                "name": entry.file_name().to_string_lossy(),
                "depth": depth,
                "is_directory": is_directory,
                "parent_path": parent
            }));
            if is_directory {
                visit(
                    root,
                    &path,
                    depth + 1,
                    files,
                    documents,
                    total_document_bytes,
                );
            } else if path.extension().and_then(|value| value.to_str()) == Some("md") {
                let Ok(content) = fs::read_to_string(&path) else {
                    continue;
                };
                if content.len() <= 262_144 && *total_document_bytes + content.len() <= 524_288 {
                    *total_document_bytes += content.len();
                    documents.insert(relative, Value::String(content));
                }
            }
        }
    }

    let Ok(root) = root.canonicalize() else {
        return (Vec::new(), serde_json::Map::new());
    };
    let mut files = Vec::new();
    let mut documents = serde_json::Map::new();
    let mut total_document_bytes = 0;
    visit(
        &root,
        &root,
        1,
        &mut files,
        &mut documents,
        &mut total_document_bytes,
    );
    (files, documents)
}

fn tools_list(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut repository_root = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    if let Some(root) = &repository_root {
        ensure_default_agent(&mut connection, root)?;
    }
    let mut statement = connection
        .prepare(
            "SELECT id, name, type, version, status, manifest_json FROM tools WHERE status='active' ORDER BY lower(name)",
        )
        .map_err(|e| e.to_string())?;
    let mut tools = statement
        .query_map([], |row| {
            let manifest: String = row.get(5)?;
            let parsed: serde_json::Value = serde_json::from_str(&manifest).unwrap_or(json!({}));
            let description = parsed
                .pointer("/tool/description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            let runtime = parsed
                .pointer("/tool/runtime")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "type": row.get::<_, String>(2)?,
                "version": row.get::<_, String>(3)?,
                "status": row.get::<_, String>(4)?,
                "summary": description,
                "category": runtime,
                "available": true,
                "actions": tool_actions_from_manifest(&parsed)
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for tool in &mut tools {
        let id = tool["id"].as_str().unwrap_or_default().to_owned();
        if let Some(documentation) = tool_documentation(repository_root.as_deref(), &id) {
            tool["documentation"] = Value::String(documentation);
        }
        if id == "agent-reach-tool" {
            tool["data_sources"] = Value::Array(agent_reach_data_sources());
        }
    }
    Ok(json!({"schema_version":"1.0","tools":tools}))
}

fn tool_actions_from_manifest(parsed: &Value) -> Vec<Value> {
    parsed
        .pointer("/tool/actions")
        .and_then(Value::as_array)
        .map(|actions| {
            actions
                .iter()
                .filter_map(|action| {
                    let name = action.get("name")?.as_str()?;
                    Some(json!({
                        "name": name,
                        "description": action.get("description").and_then(Value::as_str).unwrap_or(""),
                        "required_permissions": action.get("required_permissions").cloned().unwrap_or_else(|| json!([])),
                        "risk_level": action.get("risk_level").and_then(Value::as_u64).unwrap_or(3),
                        "side_effect": action.get("side_effect").and_then(Value::as_str).unwrap_or("unknown"),
                        "confirmation": action.get("confirmation").and_then(Value::as_str).unwrap_or("always"),
                        "timeout_ms": action.get("timeout_ms").and_then(Value::as_u64).unwrap_or(0),
                        "idempotency": action.get("idempotency").and_then(Value::as_str).unwrap_or("unsafe"),
                        "concurrency_safe": action.get("concurrency_safe").and_then(Value::as_bool).unwrap_or(false),
                        "sensitive_fields": action.get("sensitive_fields").cloned().unwrap_or_else(|| json!([]))
                    }))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn tool_documentation(repository_root: Option<&Path>, tool_id: &str) -> Option<String> {
    let root = repository_root?;
    let path = root.join("packages/tools").join(tool_id).join("TOOL.md");
    fs::read_to_string(path)
        .ok()
        .map(|content| content.trim().to_owned())
        .filter(|content| !content.is_empty())
}

fn agent_reach_data_sources() -> Vec<Value> {
    let checked_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let executable = [
        PathBuf::from("agent-reach"),
        PathBuf::from("/opt/homebrew/bin/agent-reach"),
        PathBuf::from("/usr/local/bin/agent-reach"),
    ];
    let output = executable.iter().find_map(|candidate| {
        Command::new(candidate)
            .args(["doctor", "--json"])
            .output()
            .ok()
            .filter(|output| output.status.success())
    });
    let parsed = output
        .and_then(|output| serde_json::from_slice::<Value>(&output.stdout).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();

    parsed.into_iter().map(|(id, source)| {
        let doctor_status = source["status"].as_str().unwrap_or("warn");
        let active_backend = source["active_backend"].as_str();
        let (credential_type, credential_state, login_hint) = match id.as_str() {
            "twitter" | "xueqiu" => ("cookie", "missing", "请在对应网站登录后，通过 Agent Reach 的显式配置流程授权凭据。"),
            "reddit" | "facebook" | "instagram" | "xiaohongshu" => ("browser_session", "session_unverified", "请在浏览器扩展页启用 OpenCLI，并保持目标网站处于登录状态。"),
            "github" => ("cli_auth", "present_unverified", "GitHub CLI 检测到认证配置，但尚未执行实时认证校验。"),
            "linkedin" => ("mcp_auth", "missing", "需要配置 LinkedIn MCP，或使用无需登录的公开网页读取后端。"),
            "xiaoyuzhou" => ("api_key", "missing", "需要由用户显式配置 Groq API Key。"),
            "exa_search" => ("service_config", "present_unverified", "Exa 配置已存在，但 Doctor 未执行远端连通验证。"),
            _ => ("none", "not_required", "无需登录。"),
        };
        let status = if doctor_status == "ok" { "ready" } else if credential_state == "present_unverified" { "configured_unverified" } else { "needs_attention" };
        json!({
            "id": id,
            "name": source["name"].as_str().unwrap_or("未知数据源"),
            "status": status,
            "doctor_status": doctor_status,
            "active_backend": active_backend,
            "backends": source["backends"].as_array().cloned().unwrap_or_default(),
            "credential_type": credential_type,
            "credential_state": credential_state,
            "last_checked_at": checked_at.to_string(),
            "message": if doctor_status == "ok" { "运行时诊断通过。" } else { "当前诊断未通过；未读取或展示任何凭据原文。" },
            "login_hint": login_hint,
            "exposed_to_employee": id == "exa_search"
        })
    }).collect()
}

fn employees_list(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut repository_root = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    if let Some(root) = repository_root {
        ensure_default_agent(&mut connection, &root)?;
    }
    let mut statement = connection.prepare(
        "SELECT a.id,a.name,a.role,p.department,p.soul_json,
                pe.communication_json,pe.thinking_json,pe.decision_json,pe.habit_json,p.base_prompt,a.status,p.config_version,p.avatar_path
         FROM agents a JOIN employee_profiles p ON p.agent_id=a.id JOIN personas pe ON pe.agent_id=a.id
         ORDER BY CASE a.status WHEN 'active' THEN 0 ELSE 1 END, lower(a.name)"
    ).map_err(|e| e.to_string())?;
    let employees = statement
        .query_map([], |row| Ok(employee_json(row)?))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({"schema_version":"1.0","employees":employees}))
}

fn employee_json(row: &rusqlite::Row<'_>) -> rusqlite::Result<serde_json::Value> {
    let parse = |index| -> rusqlite::Result<serde_json::Value> {
        let raw: String = row.get(index)?;
        serde_json::from_str(&raw)
            .map_err(|e| rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(e)))
    };
    Ok(json!({
        "schema_version":"1.0", "id":row.get::<_,String>(0)?, "name":row.get::<_,String>(1)?,
        "role":row.get::<_,String>(2)?, "department":row.get::<_,String>(3)?, "soul":parse(4)?,
        "persona":{"communication":parse(5)?,"thinking":parse(6)?,"decision":parse(7)?,"habit":parse(8)?},
        "base_prompt":row.get::<_,String>(9)?, "status":row.get::<_,String>(10)?, "config_version":row.get::<_,i64>(11)?,
        "avatar_path":row.get::<_,Option<String>>(12)?
    }))
}

fn required_string<'a>(payload: &'a serde_json::Value, key: &str) -> Result<&'a str, String> {
    payload
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("employee {key} must not be empty"))
}

fn employee_save(arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let (database, _, raw) = employee_arguments(arguments, "--payload")?;
    let payload: serde_json::Value =
        serde_json::from_str(&raw).map_err(|_| "invalid employee payload".to_owned())?;
    if payload.get("schema_version").and_then(|v| v.as_str()) != Some("1.0") {
        return Err("unsupported employee schema_version".to_owned());
    }
    let id = required_string(&payload, "id")?;
    if !id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("employee id must be lowercase kebab-case".to_owned());
    }
    let name = required_string(&payload, "name")?;
    let role = required_string(&payload, "role")?;
    let department = required_string(&payload, "department")?;
    let base_prompt = required_string(&payload, "base_prompt")?;
    let mission = legacy_mission_from_base_prompt(base_prompt);
    let avatar_path = payload.get("avatar_path").and_then(|value| value.as_str());
    let status = payload
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("active");
    if !matches!(status, "active" | "disabled") {
        return Err("invalid employee status".to_owned());
    }
    let soul = payload
        .get("soul")
        .filter(|v| v.is_array())
        .ok_or_else(|| "employee soul must be an array".to_owned())?;
    if soul
        .as_array()
        .map(|items| items.is_empty())
        .unwrap_or(true)
    {
        return Err("employee soul must not be empty".to_owned());
    }
    let soul_json = soul.to_string();
    let persona = payload
        .get("persona")
        .and_then(|v| v.as_object())
        .ok_or("employee persona must be an object")?;
    let persona_json = |key: &str| -> Result<String, String> {
        Ok(persona
            .get(key)
            .filter(|v| v.is_object())
            .ok_or_else(|| format!("persona {key} must be an object"))?
            .to_string())
    };
    let mut connection = Connection::open(database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO agents VALUES (?1,?2,?3,'user-managed',?4,?5,?5) ON CONFLICT(id) DO UPDATE SET name=?2,role=?3,status=?4,updated_at=?5", rusqlite::params![id,name,role,status,stamp]).map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO personas VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT(agent_id) DO UPDATE SET communication_json=?2,thinking_json=?3,decision_json=?4,habit_json=?5,updated_at=?6", rusqlite::params![id,persona_json("communication")?,persona_json("thinking")?,persona_json("decision")?,persona_json("habit")?,stamp]).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO employee_profiles (agent_id,department,mission,responsibilities_json,boundaries_json,soul_json,base_prompt,config_version,created_at,updated_at,avatar_path) VALUES (?1,?2,?3,'[]','[]',?4,?5,1,?6,?6,?7)
         ON CONFLICT(agent_id) DO UPDATE SET department=?2,mission=?3,responsibilities_json='[]',boundaries_json='[]',soul_json=?4,base_prompt=?5,avatar_path=?7,config_version=config_version+1,updated_at=?6",
        rusqlite::params![id, department, mission, soul_json, base_prompt, stamp, avatar_path],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({"schema_version":"1.0","id":id,"saved":true}))
}

fn employee_delete(arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let (database, _, id) = employee_arguments(arguments, "--employee-id")?;
    let mut connection = Connection::open(database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM agents WHERE id=?1)",
            [&id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !exists {
        return Err("employee not found".to_owned());
    }
    let is_default = id == DEFAULT_AGENT_ID;
    if is_default {
        dismiss_default_agent(&connection)?;
        purge_agent_records(&connection, &id)?;
        connection
            .execute("DELETE FROM agents WHERE id=?1", [&id])
            .map_err(|e| e.to_string())?;
        return Ok(json!({"schema_version":"1.0","id":id,"disposition":"deleted"}));
    }
    let referenced: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM conversations WHERE agent_id=?1 UNION SELECT 1 FROM tasks WHERE agent_id=?1)",
            [&id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if referenced {
        connection
            .execute(
                "UPDATE agents SET status='disabled',updated_at=?2 WHERE id=?1",
                rusqlite::params![id, now()],
            )
            .map_err(|e| e.to_string())?;
        Ok(json!({"schema_version":"1.0","id":id,"disposition":"disabled"}))
    } else {
        connection
            .execute("DELETE FROM agents WHERE id=?1", [&id])
            .map_err(|e| e.to_string())?;
        Ok(json!({"schema_version":"1.0","id":id,"disposition":"deleted"}))
    }
}

fn effective_prompt_command(
    arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let (database, _, id) = employee_arguments(arguments, "--employee-id")?;
    let mut connection = Connection::open(database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let (prompt, version) = compile_effective_prompt(&connection, &id)?;
    Ok(json!({"schema_version":"1.0","employee_id":id,"config_version":version,"prompt":prompt}))
}

fn assert_conversation_owner(
    connection: &Connection,
    conversation_id: &str,
    agent_id: &str,
) -> Result<(), String> {
    let owner: Option<String> = connection
        .query_row(
            "SELECT agent_id FROM conversations WHERE id=?1",
            [conversation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if owner.as_deref().is_some_and(|owner| owner != agent_id) {
        return Err("conversation_employee_mismatch".to_owned());
    }
    Ok(())
}

fn chat_delete(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut conversation_id = None;
    let mut agent_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            "--employee-id" => agent_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
    let agent_id = agent_id.ok_or_else(usage)?;
    assert_conversation_owner(&connection, &conversation_id, &agent_id)?;
    let deleted = connection
        .execute("DELETE FROM conversations WHERE id=?1", [&conversation_id])
        .map_err(|e| e.to_string())?;
    Ok(json!({"schema_version":"1.0","conversation_id":conversation_id,"deleted":deleted > 0}))
}

fn chat_retention(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    let mut conversation_id = None;
    let mut agent_id = None;
    let mut operation = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            "--employee-id" => agent_id = arguments.next(),
            "--operation" => operation = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
    let agent_id = agent_id.ok_or_else(usage)?;
    assert_conversation_owner(&connection, &conversation_id, &agent_id)?;
    let status = match operation.as_deref() {
        Some("archive") => "archived",
        Some("restore") => "active",
        _ => return Err("conversation_retention_operation_invalid".into()),
    };
    let changed = connection
        .execute(
            "UPDATE conversations SET status=?2,updated_at=?3 WHERE id=?1",
            rusqlite::params![conversation_id, status, now()],
        )
        .map_err(|e| e.to_string())?;
    Ok(
        json!({"schema_version":"1.0","conversation_id":conversation_id,"operation":operation,"updated":changed>0}),
    )
}

fn conversation_status(
    connection: &Connection,
    conversation_id: &str,
) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT status FROM conversations WHERE id=?1",
            [conversation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn archive_list(mut arguments: impl Iterator<Item = String>) -> Result<Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let mut statement=connection.prepare("SELECT c.id,c.agent_id,a.name,a.role,c.updated_at,(SELECT content FROM messages WHERE conversation_id=c.id ORDER BY sequence DESC LIMIT 1) FROM conversations c JOIN agents a ON a.id=c.agent_id WHERE c.status='archived' ORDER BY c.updated_at DESC,c.id").map_err(|e|e.to_string())?;
    let conversations=statement.query_map([],|r|Ok(json!({"conversation_id":r.get::<_,String>(0)?,"employee_id":r.get::<_,String>(1)?,"employee_name":r.get::<_,String>(2)?,"employee_role":r.get::<_,String>(3)?,"updated_at":r.get::<_,String>(4)?,"preview":r.get::<_,Option<String>>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
    Ok(json!({"schema_version":"1.0","conversations":conversations}))
}

fn chat_history(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut conversation_id = None;
    let mut agent_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            "--employee-id" => agent_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
    let agent_id = agent_id.ok_or_else(usage)?;
    assert_conversation_owner(&connection, &conversation_id, &agent_id)?;
    if conversation_status(&connection, &conversation_id)?.as_deref() == Some("archived") {
        return Ok(json!({"schema_version":"1.0","conversation_id":conversation_id,"messages":[]}));
    }
    let mut statement = connection.prepare(
        "SELECT id,role,content,created_at FROM messages WHERE conversation_id=?1 ORDER BY sequence"
    ).map_err(|error| error.to_string())?;
    let messages = statement
        .query_map([&conversation_id], |row| {
            Ok(json!({
                "id": row.get::<_,String>(0)?, "role": row.get::<_,String>(1)?,
                "content": row.get::<_,String>(2)?, "created_at": row.get::<_,String>(3)?
            }))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","conversation_id":conversation_id,"messages":messages}))
}

fn chat_send(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut conversation_id = None;
    let mut agent_id = None;
    let mut input = None;
    let mut stream_events = false;
    let mut replace_message_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            "--employee-id" => agent_id = arguments.next(),
            "--input" => input = arguments.next(),
            "--stream-events" => stream_events = true,
            "--replace-message-id" => replace_message_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let root = repository_root.ok_or_else(usage)?;
    let database_path = database.ok_or_else(usage)?;
    let mut connection = Connection::open(&database_path).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    ensure_default_agent(&mut connection, &root)?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
    let agent_id = agent_id.ok_or_else(usage)?;
    let input = input.ok_or_else(usage)?.trim().to_owned();
    if input.is_empty() {
        return Err("message must not be empty".to_owned());
    }
    assert_conversation_owner(&connection, &conversation_id, &agent_id)?;
    if conversation_status(&connection, &conversation_id)?.as_deref() == Some("archived") {
        return Err("conversation_archived".to_owned());
    }
    let message_count: i64 = connection
        .query_row(
            "SELECT count(*) FROM messages WHERE conversation_id=?1",
            [&conversation_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if message_count >= 80 && replace_message_id.is_none() {
        return Err(
            "conversation context limit reached; delete this history or start a new conversation"
                .to_owned(),
        );
    }
    let (system_prompt, config_version) = compile_effective_prompt(&connection, &agent_id)?;
    let prompt_sha256 = format!("{:x}", Sha256::digest(system_prompt.as_bytes()));
    let stamp = now();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let user_id = format!("msg_user_{nonce}");
    let call_id = format!("model_call_{nonce}");
    let selected_provider =
        env::var("AI_EMPLOYEE_MODEL_PROVIDER").unwrap_or_else(|_| "deepseek".to_owned());
    let selected_model =
        env::var("AI_EMPLOYEE_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".to_owned());
    if !matches!(selected_provider.as_str(), "deepseek" | "poe") || selected_model.trim().is_empty()
    {
        return Err("invalid model configuration".to_owned());
    }
    let tx = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let user_sequence: i64 = if let Some(message_id) = &replace_message_id {
        prepare_latest_user_revision(&tx, &conversation_id, message_id)?
    } else {
        tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM messages WHERE conversation_id=?1",
            [&conversation_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };
    tx.execute(
        "INSERT OR IGNORE INTO conversations VALUES (?1,?2,'员工对话','active',?3,?3)",
        rusqlite::params![conversation_id, agent_id, stamp],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO messages VALUES (?1,?2,?3,'user',?4,?5)",
        rusqlite::params![user_id, conversation_id, user_sequence, input, stamp],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO model_calls VALUES (?1,?2,?3,NULL,?4,?5,'running',NULL,NULL,NULL,?6,NULL)",
        rusqlite::params![
            call_id,
            conversation_id,
            user_id,
            selected_provider,
            selected_model,
            stamp
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO model_call_configs VALUES (?1,?2,?3,?4,?5)",
        rusqlite::params![call_id, agent_id, config_version, prompt_sha256, stamp],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE conversations SET updated_at=?2 WHERE id=?1",
        rusqlite::params![conversation_id, stamp],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    let waiting_run: Option<String> = connection
        .query_row(
            "SELECT r.id FROM agent_runs r
             JOIN run_snapshots s ON s.run_id=r.id AND s.snapshot_type='context'
             JOIN tasks t ON t.id=r.task_id
             WHERE r.phase='waiting_user' AND t.agent_id=?1
               AND json_extract(s.snapshot_json,'$.conversation_id')=?2
             ORDER BY r.created_at DESC LIMIT 1",
            rusqlite::params![agent_id, conversation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(run_id) = waiting_run {
        return continue_chat_run(
            &mut connection,
            &root,
            &conversation_id,
            &agent_id,
            config_version,
            &call_id,
            &run_id,
            &input,
            user_sequence,
            nonce,
        );
    }

    let tasks_enabled = skill_readiness(&connection, &agent_id)?
        .iter()
        .any(|item| item.readiness == "ready");
    let intent = classify_user_intent(
        &connection,
        &root,
        &conversation_id,
        &agent_id,
        &system_prompt,
        &input,
    )?;
    if intent.is_task && tasks_enabled {
        return route_chat_to_run(
            &mut connection,
            &root,
            &conversation_id,
            &agent_id,
            config_version,
            &call_id,
            &input,
            user_sequence,
            nonce,
            &intent,
        );
    }

    let history = chat_messages(&connection, &conversation_id)?;
    let conversation_system_prompt = format!(
        "{system_prompt}\n\n[Runtime boundary]\nThis response is conversation-only. You have no Tool access and cannot create, edit, search, or save files in this turn. Never claim that work is currently running, being written, or will finish later. If the user requests an unavailable side effect, explain the limitation and provide the result directly in the reply when possible."
    );
    let request = json!({"schema_version":"1.0","system_prompt":conversation_system_prompt,"messages":history,"stream":stream_events});
    let worker_root = root.join("runtime/python-agent");
    let mut child = Command::new("python3")
        .args(["-m", "app.chat_worker"])
        .env("PYTHONPATH", &worker_root)
        .current_dir(&worker_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or("chat worker stdin unavailable")?
        .write_all(request.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or("chat worker stdout unavailable")?;
    let mut payload = serde_json::Value::Null;
    for line in BufReader::new(stdout).lines() {
        let line = line.map_err(|error| error.to_string())?;
        let event: serde_json::Value = serde_json::from_str(&line)
            .map_err(|_| "model provider returned an invalid response".to_owned())?;
        if event.get("type").and_then(|value| value.as_str()) == Some("delta") {
            if stream_events {
                println!("{event}");
                std::io::stdout()
                    .flush()
                    .map_err(|error| error.to_string())?;
            }
        } else {
            payload = event;
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let code = payload
            .get("error_code")
            .and_then(|v| v.as_str())
            .unwrap_or("provider_failed");
        connection
            .execute(
                "UPDATE model_calls SET status='failed',error_code=?2,completed_at=?3 WHERE id=?1",
                rusqlite::params![call_id, code, now()],
            )
            .map_err(|e| e.to_string())?;
        return Err(format!("model provider request failed: {code}"));
    }
    let content = payload
        .get("content")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or("model provider returned empty content")?;
    let note = if intent.intent == "task" && !tasks_enabled {
        format!(
            "{content}\n\n——\n本次识别为工作意图，但 Skill/Tool 尚未接通，已按闲聊回复。安装并绑定仓库 Package 后可自动执行工作。"
        )
    } else {
        content.to_owned()
    };
    let assistant_id = format!("msg_assistant_{nonce}");
    let completed = now();
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO messages VALUES (?1,?2,?3,'assistant',?4,?5)",
        rusqlite::params![
            assistant_id,
            conversation_id,
            user_sequence + 1,
            note,
            completed
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute("UPDATE model_calls SET status='succeeded',assistant_message_id=?2,input_tokens=?3,output_tokens=?4,completed_at=?5 WHERE id=?1", rusqlite::params![call_id, assistant_id, payload.get("input_tokens").and_then(|v| v.as_i64()), payload.get("output_tokens").and_then(|v| v.as_i64()), completed]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({
        "schema_version":"1.0",
        "conversation_id":conversation_id,
        "employee_id":agent_id,
        "config_version":config_version,
        "intent": intent.intent,
        "intent_confidence": intent.confidence,
        "intent_source": intent.source,
        "routed_to": "conversation",
        "message":{"id":assistant_id,"role":"assistant","content":note,"created_at":completed}
    }))
}

fn chat_abort(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut conversation_id = None;
    let mut agent_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            "--employee-id" => agent_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
    let agent_id = agent_id.ok_or_else(usage)?;
    assert_conversation_owner(&connection, &conversation_id, &agent_id)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let active_call: Option<(String, i64)> = transaction
        .query_row(
            "SELECT mc.id,m.sequence FROM model_calls mc
             JOIN messages m ON m.id=mc.user_message_id
             WHERE mc.conversation_id=?1 AND mc.status='running'
             ORDER BY mc.created_at DESC LIMIT 1",
            [&conversation_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let changed = if let Some((call_id, user_sequence)) = active_call {
        let completed = now();
        transaction
            .execute(
                "UPDATE model_calls SET status='failed',error_code='user_cancelled',completed_at=?2 WHERE id=?1",
                rusqlite::params![call_id, completed],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO messages(id,conversation_id,sequence,role,content,created_at)
                 VALUES (?1,?2,?3,'assistant','已停止本轮回复。你可以修改上一条消息后重新发送。',?4)",
                rusqlite::params![format!("msg_cancelled_{call_id}"), conversation_id, user_sequence + 1, completed],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE conversations SET updated_at=?2 WHERE id=?1",
                rusqlite::params![conversation_id, completed],
            )
            .map_err(|error| error.to_string())?;
        true
    } else {
        false
    };
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","status":if changed { "stopped" } else { "already_stopped" }}))
}

#[allow(clippy::too_many_arguments)]
fn continue_chat_run(
    connection: &mut Connection,
    root: &Path,
    conversation_id: &str,
    agent_id: &str,
    config_version: i64,
    call_id: &str,
    run_id: &str,
    input: &str,
    user_sequence: i64,
    nonce: u128,
) -> Result<serde_json::Value, String> {
    let result = continue_with_user_input(
        connection,
        root,
        Path::new("python3"),
        run_id,
        json!({"text": input}),
    )?;
    let phase = result
        .get("phase")
        .and_then(Value::as_str)
        .unwrap_or("terminal");
    let status = result
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("running");
    let content = if phase == "waiting_user" {
        result
            .get("question")
            .and_then(Value::as_str)
            .unwrap_or("还需要补充信息。")
            .to_owned()
    } else if phase == "waiting_approval" {
        WAITING_APPROVAL_MESSAGE.to_owned()
    } else if let Some(answer) = conversational_output(&result) {
        answer.to_owned()
    } else {
        format!("工作执行已收敛（状态：{status}）。")
    };
    let assistant_id = format!("msg_assistant_{nonce}");
    let completed = now();
    let tx = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO messages VALUES (?1,?2,?3,'assistant',?4,?5)",
        rusqlite::params![
            assistant_id,
            conversation_id,
            user_sequence + 1,
            content,
            completed
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE model_calls SET status='succeeded',assistant_message_id=?2,completed_at=?3 WHERE id=?1",
        rusqlite::params![call_id, assistant_id, completed],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(json!({
        "schema_version":"1.0", "conversation_id":conversation_id,
        "employee_id":agent_id, "config_version":config_version,
        "intent":"task", "intent_confidence":1.0, "intent_source":"pending_run",
        "routed_to":"task", "task_id":result.get("task_id"),
        "run_id":run_id, "run_phase":phase,
        "message":{"id":assistant_id,"role":"assistant","content":content,"created_at":completed}
    }))
}

fn prepare_latest_user_revision(
    tx: &Transaction<'_>,
    conversation_id: &str,
    message_id: &str,
) -> Result<i64, String> {
    let latest_user_id: String = tx
        .query_row(
            "SELECT id FROM messages WHERE conversation_id=?1 AND role='user' ORDER BY sequence DESC LIMIT 1",
            [conversation_id],
            |row| row.get(0),
        )
        .map_err(|_| "only the latest user message can be edited".to_owned())?;
    if latest_user_id != message_id {
        return Err("only the latest user message can be edited".to_owned());
    }
    let sequence = tx
        .query_row(
            "SELECT sequence FROM messages WHERE id=?1 AND conversation_id=?2 AND role='user'",
            rusqlite::params![message_id, conversation_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|_| "editable user message was not found".to_owned())?;
    tx.execute(
        "DELETE FROM model_calls WHERE conversation_id=?1 AND user_message_id=?2",
        rusqlite::params![conversation_id, message_id],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM messages WHERE conversation_id=?1 AND sequence>=?2",
        rusqlite::params![conversation_id, sequence],
    )
    .map_err(|e| e.to_string())?;
    Ok(sequence)
}

#[derive(Clone)]
struct IntentResult {
    intent: String,
    confidence: f64,
    source: String,
    is_task: bool,
}

fn classify_user_intent(
    connection: &Connection,
    root: &Path,
    conversation_id: &str,
    agent_id: &str,
    effective_prompt: &str,
    text: &str,
) -> Result<IntentResult, String> {
    let worker_root = root.join("runtime/python-agent");
    let ready = skill_readiness(connection, agent_id)?;
    let mut available_skills = Vec::new();
    for item in ready.into_iter().filter(|item| item.readiness == "ready") {
        let raw: String = connection
            .query_row(
                "SELECT manifest_json FROM skills WHERE id=?1 AND status='active'",
                [&item.skill_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let manifest: Value =
            serde_json::from_str(&raw).map_err(|_| "package_invalid".to_owned())?;
        available_skills.push(json!({
            "id": item.skill_id,
            "name": manifest["skill"]["name"],
            "description": manifest["skill"]["description"]
        }));
    }
    let mut statement = connection
        .prepare(
            "SELECT role,content FROM (
               SELECT sequence,role,content FROM messages
               WHERE conversation_id=?1 ORDER BY sequence DESC LIMIT 12
             ) ORDER BY sequence",
        )
        .map_err(|error| error.to_string())?;
    let conversation_context = statement
        .query_map([conversation_id], |row| {
            Ok(json!({
                "role": row.get::<_, String>(0)?,
                "content": row.get::<_, String>(1)?
            }))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let mut memories = retrieve_memory(connection, "agent", agent_id, 4)?;
    memories.extend(retrieve_memory(connection, "user", "local-user", 4)?);
    let memories: Vec<Value> = memories
        .into_iter()
        .map(|item| {
            json!({
                "type": item.memory_type,
                "content": item.content,
                "confidence": item.confidence,
                "trust": item.trust
            })
        })
        .collect();
    let request = json!({
        "schema_version":"1.0",
        "text":text,
        "available_skills":available_skills,
        "conversation_context":conversation_context,
        "memories":memories,
        "employee_context":{"agent_id":agent_id,"effective_prompt":effective_prompt},
        "use_llm":true
    });
    let mut child = Command::new("python3")
        .args(["-m", "app.intent_worker"])
        .env("PYTHONPATH", &worker_root)
        .current_dir(&worker_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    child
        .stdin
        .take()
        .ok_or("intent worker stdin unavailable")?
        .write_all(request.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let payload: serde_json::Value =
        serde_json::from_slice(&output.stdout).unwrap_or_else(|_| json!({}));
    let intent = payload
        .get("intent")
        .and_then(|v| v.as_str())
        .unwrap_or("chat")
        .to_owned();
    let confidence = payload
        .get("confidence")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.4);
    let source = payload
        .get("source")
        .and_then(|v| v.as_str())
        .unwrap_or("fallback")
        .to_owned();
    let is_task = intent == "task" && confidence >= 0.55 && !available_skills.is_empty();
    Ok(IntentResult {
        intent,
        confidence,
        source,
        is_task,
    })
}

fn route_chat_to_run(
    connection: &mut Connection,
    root: &Path,
    conversation_id: &str,
    agent_id: &str,
    config_version: i64,
    call_id: &str,
    input: &str,
    user_sequence: i64,
    nonce: u128,
    intent: &IntentResult,
) -> Result<serde_json::Value, String> {
    let task_result = execute_agent(
        connection,
        root,
        Path::new("python3"),
        agent_id,
        json!({"text":input}),
        Some(conversation_id),
    );
    let completed = now();
    let (content, status, artifact, task_id_out, run_id, run_phase) = match task_result {
        Ok(value) => {
            let status = value
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("succeeded");
            let artifact = value
                .get("artifact_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let tid = value
                .get("task_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_owned();
            let run_id = value
                .get("run_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            let phase = value
                .get("phase")
                .and_then(Value::as_str)
                .unwrap_or("terminal")
                .to_owned();
            let body = if phase == "waiting_user" {
                value
                    .get("question")
                    .and_then(Value::as_str)
                    .unwrap_or("需要补充信息。")
                    .to_owned()
            } else if phase == "waiting_approval" {
                WAITING_APPROVAL_MESSAGE.to_owned()
            } else if let Some(answer) = conversational_output(&value) {
                answer.to_owned()
            } else if artifact.is_empty() {
                format!("工作执行已收敛（状态：{status}）。")
            } else {
                format!(
                    "已按工作执行（状态：{status}）。\n交付物：`{artifact}`\n可在工作检查器查看步骤与评估。"
                )
            };
            (
                body,
                status.to_owned(),
                artifact.to_owned(),
                tid,
                run_id,
                phase,
            )
        }
        Err(error) => (
            format!("识别到工作意图，但无法启动匹配能力：{error}"),
            "failed".to_owned(),
            String::new(),
            String::new(),
            String::new(),
            "terminal".to_owned(),
        ),
    };
    let assistant_id = format!("msg_assistant_{nonce}");
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO messages VALUES (?1,?2,?3,'assistant',?4,?5)",
        rusqlite::params![
            assistant_id,
            conversation_id,
            user_sequence + 1,
            content,
            completed
        ],
    )
    .map_err(|e| e.to_string())?;
    let model_status = if status == "succeeded" || status == "running" {
        "succeeded"
    } else {
        "failed"
    };
    tx.execute(
        "UPDATE model_calls SET status=?2,assistant_message_id=?3,error_code=?4,completed_at=?5 WHERE id=?1",
        rusqlite::params![
            call_id,
            model_status,
            assistant_id,
            if status == "succeeded" || status == "running" {
                None::<String>
            } else {
                Some("task_route_failed".to_owned())
            },
            completed
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({
        "schema_version":"1.0",
        "conversation_id":conversation_id,
        "employee_id":agent_id,
        "config_version":config_version,
        "intent": intent.intent,
        "intent_confidence": intent.confidence,
        "intent_source": intent.source,
        "routed_to": "task",
        "task_id": task_id_out,
        "run_id": if run_id.is_empty() { Value::Null } else { json!(run_id) },
        "run_phase": run_phase,
        "artifact_path": if artifact.is_empty() { serde_json::Value::Null } else { json!(artifact) },
        "message":{"id":assistant_id,"role":"assistant","content":content,"created_at":completed}
    }))
}

fn conversational_output(result: &Value) -> Option<&str> {
    result
        .pointer("/output/answer")
        .or_else(|| result.pointer("/output/summary"))
        .or_else(|| result.pointer("/output/content"))
        .and_then(Value::as_str)
}

fn chat_messages(
    connection: &Connection,
    conversation_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let mut statement = connection
        .prepare("SELECT role,content FROM messages WHERE conversation_id=?1 ORDER BY sequence")
        .map_err(|e| e.to_string())?;
    statement
        .query_map([conversation_id], |row| {
            Ok(json!({"role":row.get::<_,String>(0)?,"content":row.get::<_,String>(1)?}))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn now() -> String {
    format!(
        "{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    )
}

fn list_tasks(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let database = database.ok_or_else(usage)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT t.id,t.agent_id,t.input,t.status,t.created_at,t.updated_at,
                    COALESCE((SELECT json_group_array(json(action_json)) FROM (
                      SELECT json_object(
                      'step_id', COALESCE(json_extract(a.input_json,'$.step_id'), json_extract(a.input_json,'$.action'), substr(a.id, instr(a.id, ':') + 1)),
                      'action_id', a.id,
                      'status', a.status,
                      'output_as', COALESCE(json_extract(a.input_json,'$.output_as'), ''),
                      'tool_id', a.tool_id,
                      'action', COALESCE(json_extract(a.input_json,'$.action'), ''),
                      'resource', COALESCE(json_extract(a.input_json,'$.arguments.path'), json_extract(a.input_json,'$.arguments.query'), ''),
                      'rationale_summary', COALESCE(json_extract(a.input_json,'$.rationale_summary'), '')
                      ) AS action_json
                      FROM actions a WHERE a.task_id=t.id
                      ORDER BY a.created_at,a.id
                    )), '[]'),
                    (SELECT ar.uri FROM deliverables d
                     JOIN deliverable_evidence de ON de.deliverable_id=d.id AND de.evidence_type='artifact'
                     JOIN artifacts ar ON ar.id=de.evidence_ref
                     WHERE d.id=(SELECT id FROM deliverables WHERE task_id=t.id AND status='verified'
                                 ORDER BY created_at DESC,id DESC LIMIT 1)
                       AND ar.task_id=t.id AND ar.run_id=d.run_id AND ar.verification_status='verified'
                     ORDER BY ar.created_at DESC,ar.id DESC LIMIT 1),
                    (SELECT score FROM evaluations WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1),
                    (SELECT json_extract(metrics_json,'$.delivery_allowed') FROM evaluations
                     WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1),
                    COALESCE((SELECT json_group_array(json(event_json)) FROM (
                      SELECT json_object(
                      'schema_version','1.0', 'event_id',event_id, 'sequence',sequence,
                      'task_id',task_id, 'type',event_type, 'occurred_at',occurred_at,
                      'payload',json(payload_json)
                      ) AS event_json
                      FROM runtime_events WHERE task_id=t.id ORDER BY sequence
                    )), '[]'),
                    EXISTS(SELECT 1 FROM task_cancellation_requests c
                           WHERE c.task_id=t.id AND c.acknowledged_at IS NULL)
                    ,(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT phase FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT waiting_reason FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT stop_reason FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT title FROM deliverables WHERE task_id=t.id AND status='verified' ORDER BY created_at DESC,id DESC LIMIT 1)
                    ,(SELECT status FROM deliverables WHERE task_id=t.id AND status='verified' ORDER BY created_at DESC,id DESC LIMIT 1)
                    ,(SELECT ar.uri FROM deliverables d
                       JOIN deliverable_evidence de ON de.deliverable_id=d.id AND de.evidence_type='artifact'
                       JOIN artifacts ar ON ar.id=de.evidence_ref
                       WHERE d.id=(SELECT id FROM deliverables WHERE task_id=t.id AND status='verified'
                                   ORDER BY created_at DESC,id DESC LIMIT 1)
                         AND ar.task_id=t.id AND ar.run_id=d.run_id AND ar.verification_status='verified'
                       ORDER BY ar.created_at DESC,ar.id DESC LIMIT 1)
                    ,(SELECT json_extract(snapshot_json,'$.conversation_id') FROM run_snapshots
                      WHERE run_id=(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                        AND snapshot_type='context' LIMIT 1)
                    ,(SELECT json_extract(snapshot_json,'$.id') FROM run_snapshots
                      WHERE run_id=(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                        AND snapshot_type='skill' LIMIT 1)
                    ,(SELECT json_extract(snapshot_json,'$.version') FROM run_snapshots
                      WHERE run_id=(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                        AND snapshot_type='skill' LIMIT 1)
                    ,COALESCE((SELECT json_group_array(DISTINCT json_extract(input_json,'$.skill_id'))
                      FROM actions WHERE task_id=t.id AND json_type(input_json,'$.skill_id')='text'),'[]')
                    ,(SELECT COALESCE(
                        json_extract(output_json,'$.answer'),
                        json_extract(output_json,'$.summary'),
                        json_extract(output_json,'$.content'))
                      FROM deliverables WHERE task_id=t.id AND status='verified'
                      ORDER BY created_at DESC LIMIT 1)
             FROM tasks t ORDER BY t.created_at DESC, t.id DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let actions: String = row.get(6)?;
            let events: String = row.get(10)?;
            let score: Option<f64> = row.get(8)?;
            let delivery_allowed: Option<bool> = row.get(9)?;
            Ok(json!({
                "task_id": row.get::<_, String>(0)?,
                "agent_id": row.get::<_, String>(1)?,
                "input": task_input_text(&row.get::<_, String>(2)?),
                "status": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?,
                "updated_at": row.get::<_, String>(5)?,
                "actions": serde_json::from_str::<serde_json::Value>(&actions).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(6, Type::Text, Box::new(error))
                })?,
                "artifact_path": row.get::<_, Option<String>>(7)?,
                "evaluation": score.map(|score| json!({
                    "score": score,
                    "delivery_allowed": delivery_allowed.unwrap_or(false)
                })),
                "events": serde_json::from_str::<serde_json::Value>(&events).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(10, Type::Text, Box::new(error))
                })?,
                "cancellation_requested": row.get::<_, bool>(11)?,
                "run_id": row.get::<_, Option<String>>(12)?,
                "run_phase": row.get::<_, Option<String>>(13)?,
                "waiting_reason": row.get::<_, Option<String>>(14)?,
                "stop_reason": row.get::<_, Option<String>>(15)?,
                "deliverable_title": row.get::<_, Option<String>>(16)?,
                "deliverable_status": row.get::<_, Option<String>>(17)?,
                "verified_artifact_path": row.get::<_, Option<String>>(18)?,
                "conversation_id": row.get::<_, Option<String>>(19)?,
                "skill_id": row.get::<_, Option<String>>(20)?,
                "skill_version": row.get::<_, Option<String>>(21)?
                ,"skill_ids": serde_json::from_str::<Value>(&row.get::<_, String>(22)?)
                    .unwrap_or_else(|_| json!([]))
                ,"deliverable_message": row.get::<_, Option<String>>(23)?
            }))
        })
        .map_err(|error| error.to_string())?;
    let tasks = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","tasks":tasks}))
}

fn recover_runtime(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let database = database.ok_or_else(usage)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let summary =
        reconcile_interrupted(&mut connection, &now()).map_err(|error| error.to_string())?;
    Ok(json!({
        "schema_version":"1.0",
        "safe_failures":summary.safe_failures,
        "result_unknown":summary.result_unknown
    }))
}

fn task_input_text(raw: &str) -> String {
    serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|value| value.get("text").and_then(Value::as_str).map(str::to_owned))
        .unwrap_or_else(|| raw.to_owned())
}

fn cancel_task(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let (database, task_id, _) = task_command_arguments(&mut arguments, false)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let now: String = transaction
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |row| {
            row.get(0)
        })
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO task_cancellation_requests(task_id,requested_at,acknowledged_at)
             SELECT id,?2,NULL FROM tasks WHERE id=?1 AND status IN ('pending','running')
             ON CONFLICT(task_id) DO NOTHING",
            rusqlite::params![task_id, now],
        )
        .map_err(|error| error.to_string())?;
    let is_flow_root: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM business_flows WHERE root_task_id=?1)",
            [&task_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if is_flow_root {
        transaction
            .execute(
                "INSERT INTO task_cancellation_requests(task_id,requested_at,acknowledged_at)
                 SELECT id,?2,NULL FROM tasks
                 WHERE parent_task_id=?1 AND status IN ('pending','running')
                 ON CONFLICT(task_id) DO NOTHING",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE actions SET status='cancelled',updated_at=?2
                 WHERE task_id IN (SELECT id FROM tasks WHERE parent_task_id=?1)
                   AND status IN ('pending','blocked')",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE approvals SET status='rejected',resolved_at=?2
                 WHERE task_id IN (SELECT id FROM tasks WHERE parent_task_id=?1)
                   AND status='pending'",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE tasks SET status='cancelled',updated_at=?2
                 WHERE parent_task_id=?1 AND status IN ('pending','running')
                   AND NOT EXISTS(
                     SELECT 1 FROM actions
                     WHERE actions.task_id=tasks.id AND actions.status IN ('running','result_unknown')
                   )",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE task_cancellation_requests SET acknowledged_at=?2
                 WHERE task_id IN (SELECT id FROM tasks WHERE parent_task_id=?1 AND status='cancelled')
                   AND acknowledged_at IS NULL",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
    }
    let state: (String, bool) = transaction
        .query_row(
            "SELECT status, EXISTS(SELECT 1 FROM task_cancellation_requests WHERE task_id=tasks.id)
             FROM tasks WHERE id=?1",
            [&task_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| format!("task is not cancellable: {error}"))?;
    if !matches!(state.0.as_str(), "pending" | "running") || !state.1 {
        return Err(format!("task is already terminal: {}", state.0));
    }
    let active_actions: i64 = transaction
        .query_row(
            "SELECT count(*) FROM actions
             WHERE (task_id=?1 OR task_id IN (SELECT id FROM tasks WHERE parent_task_id=?1))
               AND status IN ('running','result_unknown')",
            [&task_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if active_actions == 0 {
        transaction
            .execute(
                "UPDATE actions SET status='cancelled',updated_at=?2
             WHERE task_id=?1 AND status IN ('pending','blocked')",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "UPDATE approvals SET status='rejected',resolved_at=?2
             WHERE task_id=?1 AND status='pending'",
                rusqlite::params![task_id, now],
            )
            .map_err(|error| error.to_string())?;
        transaction.execute(
            "UPDATE tasks SET status='cancelled',updated_at=?2 WHERE id=?1 AND status IN ('pending','running')",
            rusqlite::params![task_id, now],
        ).map_err(|error| error.to_string())?;
        transaction.execute(
            "UPDATE agent_runs SET phase='terminal',stop_reason='cancelled',waiting_reason=NULL,revision=revision+1,updated_at=?2
             WHERE task_id=?1 AND phase!='terminal'",
            rusqlite::params![task_id, now],
        ).map_err(|error| error.to_string())?;
        transaction.execute(
            "UPDATE task_cancellation_requests SET acknowledged_at=?2 WHERE task_id=?1 AND acknowledged_at IS NULL",
            rusqlite::params![task_id, now],
        ).map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(
        json!({"schema_version":"1.0","task_id":task_id,"status":if active_actions == 0 {"cancelled"} else {"cancellation_requested"}}),
    )
}

fn list_events(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let (database, task_id, after) = task_command_arguments(&mut arguments, true)?;
    let mut connection = Connection::open(database).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT event_id,sequence,event_type,payload_json,occurred_at FROM runtime_events
         WHERE task_id=?1 AND sequence>?2 ORDER BY sequence",
        )
        .map_err(|error| error.to_string())?;
    let events = statement.query_map(rusqlite::params![task_id, after], |row| {
        let payload: String = row.get(3)?;
        Ok(json!({
            "schema_version":"1.0", "event_id":row.get::<_,String>(0)?,
            "sequence":row.get::<_,i64>(1)?, "task_id":task_id,
            "type":row.get::<_,String>(2)?, "occurred_at":row.get::<_,String>(4)?,
            "payload":serde_json::from_str::<serde_json::Value>(&payload).map_err(|error| rusqlite::Error::FromSqlConversionFailure(3, Type::Text, Box::new(error)))?
        }))
    }).map_err(|error| error.to_string())?
      .collect::<Result<Vec<_>,_>>().map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","task_id":task_id,"after":after,"events":events}))
}

fn task_command_arguments(
    arguments: &mut impl Iterator<Item = String>,
    allow_after: bool,
) -> Result<(PathBuf, String, i64), String> {
    let mut database = None;
    let mut task_id = None;
    let mut after = 0;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--task-id" => task_id = arguments.next(),
            "--after" if allow_after => {
                after = arguments
                    .next()
                    .ok_or_else(usage)?
                    .parse()
                    .map_err(|_| usage())?
            }
            _ => return Err(usage()),
        }
    }
    Ok((
        database.ok_or_else(usage)?,
        task_id.ok_or_else(usage)?,
        after,
    ))
}

fn usage() -> String {
    "usage: ai-employee-runtime employees-list|employee-save|employee-delete|effective-prompt|capabilities|capability-readiness|skills-list|tools-list|install-tool|install-skill|bind-skill|unbind-skill|knowledge-import|knowledge-list|knowledge-search|chat-history|chat-send|chat-abort|chat-delete|chat-retention|archive-list|run-task|run-skill|run-status|continue-run|resolve-action-result|list-tasks|usage-summary|cancel-task|events|task-thread-create|task-thread-list|task-thread-get|task-thread-message|task-thread-timeline|task-thread-retention|task-proposal-generate|task-proposal-regenerate|task-proposal-current|task-proposal-confirm|scenario-list|scenario-propose|scenario-get|scenario-validate|scenario-save|scenario-disable|business-flow-plan|business-flow-start|business-flow-list|business-flow-status|business-flow-continue".to_owned()
}

fn usage_summary(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    usage_summary_from_connection(&connection)
}

fn usage_md_component(value: &str) -> &str {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() { "0" } else { trimmed }
}

fn usage_day_label(iso_date: &str, is_today: bool) -> String {
    if is_today {
        return "今天".to_owned();
    }
    let mut parts = iso_date.split('-');
    let _year = parts.next();
    let month = parts.next().unwrap_or("1");
    let day = parts.next().unwrap_or("1");
    format!("{}/{}", usage_md_component(month), usage_md_component(day))
}

fn usage_summary_from_connection(connection: &Connection) -> Result<serde_json::Value, String> {
    let unsupported_model: Option<String> = connection
        .query_row(
            "SELECT provider || '/' || model FROM model_calls
             WHERE status='succeeded'
               AND date(CAST(created_at AS INTEGER) / 1000, 'unixepoch', 'localtime') >= date('now', 'localtime', '-6 days')
               AND NOT (provider='deepseek' AND model='deepseek-v4-flash')
             ORDER BY created_at DESC LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(model) = unsupported_model {
        return Err(format!("unsupported_usage_pricing_model:{model}"));
    }
    let mut day_totals: std::collections::HashMap<String, (i64, i64, i64)> =
        std::collections::HashMap::new();
    let mut statement = connection
        .prepare(
            "SELECT date(CAST(created_at AS INTEGER) / 1000, 'unixepoch', 'localtime') AS day,
                    COALESCE(SUM(input_tokens), 0),
                    COALESCE(SUM(output_tokens), 0),
                    COUNT(*)
             FROM model_calls
             WHERE status = 'succeeded'
               AND date(CAST(created_at AS INTEGER) / 1000, 'unixepoch', 'localtime')
                   >= date('now', 'localtime', '-6 days')
             GROUP BY day",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        let (day, input, output, calls) = row.map_err(|error| error.to_string())?;
        day_totals.insert(day, (input, output, calls));
    }

    let mut points = Vec::with_capacity(7);
    let mut input_tokens = 0_i64;
    let mut output_tokens = 0_i64;
    let mut model_calls = 0_i64;
    for offset in (0..7).rev() {
        let day: String = connection
            .query_row(
                "SELECT date('now', 'localtime', ?1)",
                [format!("-{offset} days")],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let (day_input, day_output, day_calls) = day_totals.get(&day).copied().unwrap_or((0, 0, 0));
        input_tokens += day_input;
        output_tokens += day_output;
        model_calls += day_calls;
        points.push(json!({
            "id": day,
            "label": usage_day_label(&day, offset == 0),
            "input_tokens": day_input,
            "output_tokens": day_output
        }));
    }

    let estimated_cost_cny = (input_tokens as f64) * USAGE_INPUT_CACHE_MISS_CNY_PER_MTOK
        / 1_000_000.0
        + (output_tokens as f64) * USAGE_OUTPUT_CNY_PER_MTOK / 1_000_000.0;

    Ok(json!({
        "schema_version": "1.0",
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_cost_cny": estimated_cost_cny,
        "pricing_model": "deepseek-v4-flash",
        "pricing_basis": "input_cache_miss",
        "pricing_version": USAGE_PRICING_VERSION,
        "pricing_source": USAGE_PRICING_SOURCE,
        "model_calls": model_calls,
        "points": points
    }))
}

fn run_skill(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut python = PathBuf::from("python3");
    let mut agent_id = None;
    let mut skill_id = None;
    let mut input_json = None;
    let mut conversation_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            "--agent-id" => agent_id = arguments.next(),
            "--skill-id" => skill_id = arguments.next(),
            "--input-json" => input_json = arguments.next(),
            "--conversation-id" => conversation_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let repository_root = repository_root.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    bootstrap_packages(&mut connection, &repository_root, &now())?;
    let input: serde_json::Value = serde_json::from_str(&input_json.ok_or_else(usage)?)
        .map_err(|error| format!("input_schema_invalid: {error}"))?;
    execute_skill(RunSkillConfig {
        connection: &mut connection,
        repository_root: &repository_root,
        python: &python,
        agent_id: &agent_id.ok_or_else(usage)?,
        skill_id: &skill_id.ok_or_else(usage)?,
        input,
        conversation_id: conversation_id.as_deref(),
        capability_mode: false,
        existing_task_id: None,
    })
}

fn run_status(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut run_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--run-id" => run_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let run_id = run_id.ok_or_else(usage)?;
    connection.query_row(
        "SELECT r.task_id,t.status,r.phase,r.revision,r.waiting_reason,r.stop_reason,r.model_turns_used,r.tool_calls_used
         FROM agent_runs r JOIN tasks t ON t.id=r.task_id WHERE r.id=?1",
        [&run_id],
        |row| Ok(json!({
            "schema_version":"1.0.0","run_id":run_id,"task_id":row.get::<_,String>(0)?,
            "status":row.get::<_,String>(1)?,"phase":row.get::<_,String>(2)?,
            "revision":row.get::<_,i64>(3)?,"waiting_reason":row.get::<_,Option<String>>(4)?,
            "stop_reason":row.get::<_,Option<String>>(5)?,"model_turns_used":row.get::<_,i64>(6)?,
            "tool_calls_used":row.get::<_,i64>(7)?
        })),
    ).map_err(|_| "run_not_found".to_owned())
}

fn continue_run(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut python = PathBuf::from("python3");
    let mut run_id = None;
    let mut authorized_root = None;
    let mut approve = None;
    let mut input_json = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            "--run-id" => run_id = arguments.next(),
            "--authorized-root" => authorized_root = arguments.next().map(PathBuf::from),
            "--approve" => approve = Some(true),
            "--reject" => approve = Some(false),
            "--input-json" => input_json = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let repository_root = repository_root.ok_or_else(usage)?;
    let run_id = run_id.ok_or_else(usage)?;
    if let Some(input) = input_json {
        let result = continue_with_user_input(
            &mut connection,
            &repository_root,
            &python,
            &run_id,
            serde_json::from_str(&input).map_err(|_| "input_schema_invalid".to_owned())?,
        )?;
        advance_parent_flow_if_any(&mut connection, &result)?;
        return Ok(result);
    }
    let result = resume_run(ContinueRunConfig {
        connection: &mut connection,
        repository_root: &repository_root,
        python: &python,
        run_id: &run_id,
        authorized_root: &authorized_root.ok_or_else(usage)?,
        approve: approve.ok_or_else(usage)?,
    })?;
    append_run_result_to_conversation(&mut connection, &run_id, &result)?;
    advance_parent_flow_if_any(&mut connection, &result)?;
    Ok(result)
}

fn advance_parent_flow_if_any(connection: &mut Connection, result: &Value) -> Result<(), String> {
    if result.get("status").and_then(Value::as_str) != Some("succeeded") {
        return Ok(());
    }
    let Some(task_id) = result.get("task_id").and_then(Value::as_str) else {
        return Ok(());
    };
    let Some(deliverable_id) = result.get("deliverable_id").and_then(Value::as_str) else {
        return Ok(());
    };
    let parent: Option<(String, String)> = connection
        .query_row(
            "SELECT work.business_flow_id,work.id FROM work_orders work WHERE work.child_task_id=?1",
            [task_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some((flow_id, work_order_id)) = parent {
        advance_after_child_success(connection, &flow_id, &work_order_id, deliverable_id, &now())?;
    }
    Ok(())
}

fn append_run_result_to_conversation(
    connection: &mut Connection,
    run_id: &str,
    result: &Value,
) -> Result<(), String> {
    if result.get("status").and_then(Value::as_str) != Some("succeeded")
        || result.get("phase").and_then(Value::as_str) != Some("terminal")
    {
        return Ok(());
    }
    let Some(mut content) = conversational_output(result).map(str::to_owned) else {
        return Ok(());
    };
    if let Some(sources) = result.pointer("/output/sources").and_then(Value::as_array) {
        let sources: Vec<(String, &str)> = sources
            .iter()
            .enumerate()
            .filter_map(|(index, source)| {
                if let Some(url) = source.as_str() {
                    return Some((format!("来源 {}", index + 1), url));
                }
                let title = source.get("title").and_then(Value::as_str)?.trim();
                let url = source.get("url").and_then(Value::as_str)?;
                Some((
                    if title.is_empty() {
                        format!("来源 {}", index + 1)
                    } else {
                        title.to_owned()
                    },
                    url,
                ))
            })
            .collect();
        if !sources.is_empty() {
            content.push_str("\n\n## 来源\n");
            content.push_str(
                &sources
                    .iter()
                    .map(|(title, source)| format!("- [{}]({source})", markdown_link_title(title)))
                    .collect::<Vec<_>>()
                    .join("\n"),
            );
        }
    }
    let snapshot: Option<String> = connection
        .query_row(
            "SELECT snapshot_json FROM run_snapshots
             WHERE run_id=?1 AND snapshot_type='context'",
            [run_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let conversation_id = snapshot
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .and_then(|value| value.get("conversation_id").cloned())
        .and_then(|value| value.as_str().map(str::to_owned));
    let Some(conversation_id) = conversation_id else {
        return Ok(());
    };
    let stamp = now();
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let waiting_message_id: Option<String> = transaction
        .query_row(
            "SELECT id FROM messages
             WHERE conversation_id=?1 AND role='assistant' AND content=?2
               AND sequence > (
                 SELECT COALESCE(MAX(sequence),0) FROM messages
                 WHERE conversation_id=?1 AND role='user'
               )
             ORDER BY sequence DESC LIMIT 1",
            rusqlite::params![conversation_id, WAITING_APPROVAL_MESSAGE],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(message_id) = waiting_message_id {
        transaction
            .execute(
                "UPDATE messages SET content=?2,created_at=?3 WHERE id=?1",
                rusqlite::params![message_id, content, stamp],
            )
            .map_err(|error| error.to_string())?;
    } else {
        let sequence: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM messages WHERE conversation_id=?1",
                [&conversation_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO messages VALUES (?1,?2,?3,'assistant',?4,?5)",
                rusqlite::params![
                    format!("msg_assistant_{run_id}"),
                    conversation_id,
                    sequence,
                    content,
                    stamp
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "UPDATE conversations SET updated_at=?2 WHERE id=?1",
            rusqlite::params![conversation_id, stamp],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn markdown_link_title(title: &str) -> String {
    title.replace('[', "\\[").replace(']', "\\]")
}

fn resolve_action_result(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut action_id = None;
    let mut status = None;
    let mut evidence = None;
    let mut repository_root = None;
    let mut python = PathBuf::from("python3");
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--action-id" => action_id = arguments.next(),
            "--status" => status = arguments.next(),
            "--evidence-json" => evidence = arguments.next(),
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let evidence: Value = serde_json::from_str(&evidence.ok_or_else(usage)?)
        .map_err(|_| "invalid_evidence".to_owned())?;
    let resolved = resolve_unknown_action(
        &mut connection,
        &action_id.ok_or_else(usage)?,
        &status.ok_or_else(usage)?,
        evidence.clone(),
    )?;
    if resolved["status"] == "succeeded" {
        if let Some(root) = repository_root {
            let run_id = resolved["run_id"].as_str().ok_or("run_not_found")?;
            let result =
                continue_after_verified_action(&mut connection, &root, &python, run_id, evidence)?;
            advance_parent_flow_if_any(&mut connection, &result)?;
            return Ok(result);
        }
    }
    Ok(resolved)
}

fn capability_readiness(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut agent_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--agent-id" => agent_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let root = repository_root.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    bootstrap_packages(&mut connection, &root, &now())?;
    let agent_id = agent_id.ok_or_else(usage)?;
    let status: String = connection
        .query_row(
            "SELECT status FROM agents WHERE id=?1",
            [&agent_id],
            |row| row.get(0),
        )
        .map_err(|_| "agent_unavailable".to_owned())?;
    let mut statement = connection
        .prepare(
            "SELECT s.id,s.version,s.status,a.enabled,s.manifest_json FROM skills s
         LEFT JOIN agent_skills a ON a.skill_id=s.id AND a.agent_id=?1 ORDER BY s.id",
        )
        .map_err(|error| error.to_string())?;
    let skills = statement.query_map([&agent_id], |row| {
        let id: String = row.get(0)?;
        let skill_status: String = row.get(2)?;
        let enabled: Option<i64> = row.get(3)?;
        let manifest_raw: String = row.get(4)?;
        let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).unwrap_or(json!({}));
        let mut reasons = Vec::new();
        if status != "active" { reasons.push("agent_inactive"); }
        if enabled != Some(1) { reasons.push("skill_unbound"); }
        if skill_status != "active" { reasons.push("skill_disabled"); }
        if manifest["schema_version"] != "2.0.0" { reasons.push("runtime_incompatible"); }
        let readiness = if reasons.is_empty() { "ready" } else if reasons.contains(&"skill_unbound") { "disabled" } else if reasons.contains(&"runtime_incompatible") { "incompatible" } else { "missing_dependency" };
        Ok(json!({"skill_id":id,"version":row.get::<_,String>(1)?,"readiness":readiness,"reason_codes":reasons}))
    }).map_err(|error| error.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|error| error.to_string())?;
    Ok(
        json!({"schema_version":"1.0.0","agent_id":agent_id,"tasks_enabled":skills.iter().any(|skill| skill["readiness"]=="ready"),"skills":skills}),
    )
}

fn run_task(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut python = PathBuf::from("python3");
    let mut input_json = None;
    let mut agent_id = None;
    let mut skill_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            "--input-json" => input_json = arguments.next(),
            "--agent-id" => agent_id = arguments.next(),
            "--skill-id" => skill_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let root = repository_root.ok_or_else(usage)?;
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    bootstrap_packages(&mut connection, &root, &now())?;
    execute_skill(RunSkillConfig {
        connection: &mut connection,
        repository_root: &root,
        python: &python,
        agent_id: &agent_id.ok_or_else(usage)?,
        skill_id: &skill_id.ok_or_else(usage)?,
        input: serde_json::from_str(&input_json.ok_or_else(usage)?)
            .map_err(|_| "input_schema_invalid".to_owned())?,
        conversation_id: None,
        capability_mode: false,
        existing_task_id: None,
    })
}

fn install_tool_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let (database, package_path) = package_command_arguments(&mut arguments)?;
    let mut connection = Connection::open(database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    install_tool_package(&connection, &package_path, &stamp)
        .map_err(|error| format!("install-tool failed: {error:?}"))?;
    Ok(json!({
        "schema_version": "1.0",
        "installed": true,
        "package_path": package_path.to_string_lossy()
    }))
}

fn install_skill_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let (database, package_path) = package_command_arguments(&mut arguments)?;
    let mut connection = Connection::open(database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    install_skill_package(&connection, &package_path, &stamp)?;
    Ok(json!({
        "schema_version": "1.0",
        "installed": true,
        "package_path": package_path.to_string_lossy()
    }))
}

fn bind_skill_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut agent_id = None;
    let mut skill_id = None;
    let mut skill_version = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--agent-id" => agent_id = arguments.next(),
            "--skill-id" => skill_id = arguments.next(),
            "--skill-version" => skill_version = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let stamp = now();
    let agent_id = agent_id.ok_or_else(usage)?;
    let skill_id = skill_id.ok_or_else(usage)?;
    let skill_version = skill_version.ok_or_else(usage)?;
    bind_skill(&connection, &agent_id, &skill_id, &skill_version, &stamp)?;
    Ok(json!({
        "schema_version": "1.0",
        "bound": true,
        "agent_id": agent_id,
        "skill_id": skill_id,
        "skill_version": skill_version
    }))
}

fn unbind_skill_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut agent_id = None;
    let mut skill_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--agent-id" => agent_id = arguments.next(),
            "--skill-id" => skill_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let agent_id = agent_id.ok_or_else(usage)?;
    let skill_id = skill_id.ok_or_else(usage)?;
    unbind_skill(&connection, &agent_id, &skill_id)?;
    Ok(json!({
        "schema_version": "1.0",
        "unbound": true,
        "agent_id": agent_id,
        "skill_id": skill_id
    }))
}

fn package_command_arguments(
    arguments: &mut impl Iterator<Item = String>,
) -> Result<(PathBuf, PathBuf), String> {
    let mut database = None;
    let mut package_path = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--package-path" => package_path = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    Ok((database.ok_or_else(usage)?, package_path.ok_or_else(usage)?))
}

fn knowledge_import_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut id = None;
    let mut uri = None;
    let mut source_type = Some("seed_document".to_owned());
    let mut title = None;
    let mut content = None;
    let mut content_file = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--id" => id = arguments.next(),
            "--uri" => uri = arguments.next(),
            "--source-type" => source_type = arguments.next(),
            "--title" => title = arguments.next(),
            "--content" => content = arguments.next(),
            "--content-file" => content_file = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let body = if let Some(path) = content_file {
        std::fs::read_to_string(path).map_err(|e| e.to_string())?
    } else {
        content.ok_or_else(usage)?
    };
    let stamp = now();
    let imported = import_source(
        &mut connection,
        &id.ok_or_else(usage)?,
        &uri.ok_or_else(usage)?,
        &source_type.ok_or_else(usage)?,
        &title.ok_or_else(usage)?,
        &body,
        &stamp,
    )?;
    Ok(json!({
        "schema_version": "1.0",
        "imported": imported,
        "embedding_ref": serde_json::Value::Null
    }))
}

fn knowledge_list_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT s.id,s.uri,s.source_type,s.title,s.content_hash,s.index_status,s.updated_at,
                    COALESCE((SELECT group_concat(content, char(10) || char(10)) FROM (
                      SELECT content FROM knowledge_chunks WHERE source_id=s.id ORDER BY chunk_index
                    )), '')
             FROM knowledge_sources s ORDER BY lower(s.title),s.id",
        )
        .map_err(|error| error.to_string())?;
    let sources = statement
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "uri": row.get::<_, String>(1)?,
                "source_type": row.get::<_, String>(2)?,
                "title": row.get::<_, String>(3)?,
                "content_hash": row.get::<_, String>(4)?,
                "index_status": row.get::<_, String>(5)?,
                "updated_at": row.get::<_, String>(6)?,
                "content": row.get::<_, String>(7)?,
            }))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","sources":sources}))
}

fn knowledge_search_command(
    mut arguments: impl Iterator<Item = String>,
) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut query = None;
    let mut limit = 5usize;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--query" => query = arguments.next(),
            "--limit" => {
                limit = arguments
                    .next()
                    .ok_or_else(usage)?
                    .parse()
                    .map_err(|_| usage())?
            }
            _ => return Err(usage()),
        }
    }
    let database = database.ok_or_else(usage)?;
    let mut connection = Connection::open(&database).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let hits = knowledge_search(&connection, &query.ok_or_else(usage)?, limit)?;
    Ok(json!({
        "schema_version": "1.0",
        "query_mode": "keyword",
        "embedding_ref": serde_json::Value::Null,
        "hits": hits.into_iter().map(|hit| json!({
            "source_id": hit.source_id,
            "source_uri": hit.source_uri,
            "title": hit.title,
            "chunk_index": hit.chunk_index,
            "content": hit.content,
            "content_hash": hit.content_hash,
            "score": hit.score
        })).collect::<Vec<_>>()
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicU64, Ordering};

    const VALID_TWO_ASSIGNMENT_PROPOSAL: &str = r#"{"schema_version":"1.0.0","intent":"multi_agent_task","title":"Research and write","objective":"Research and write a summary","missing_inputs":[],"deliverable":{"type":"structured_result","description":"Research summary","target_path":null},"assignments":[{"node_id":"research","role":"owner","employee_selector":{"preferred_id":"data-researcher","capabilities":["web-search"]},"goal":"Research the current topic","depends_on":[],"acceptance_criteria":[{"criterion_id":"sources","description":"Includes sources","evidence_type":"structured_output","required":true}]},{"node_id":"write","role":"finalizer","employee_selector":{"preferred_id":"ai-product-manager","capabilities":["local-file-operations"]},"goal":"Write the final summary","depends_on":["research"],"acceptance_criteria":[{"criterion_id":"summary","description":"Produces the final summary","evidence_type":"artifact","required":true}]}],"acceptance_criteria":[{"criterion_id":"complete","description":"Research and summary are complete","evidence_type":"evaluation","required":true}],"requested_resources":[],"budget_hint":{"input_tokens":0,"output_tokens":0,"tool_rounds":0,"wall_clock_ms":0}}"#;
    const VALID_SINGLE_ASSIGNMENT_PROPOSAL: &str = r#"{"schema_version":"1.0.0","intent":"single_agent_task","title":"Write","objective":"Write the requested summary","missing_inputs":[],"deliverable":{"type":"structured_result","description":"Written summary","target_path":null},"assignments":[{"node_id":"write","role":"owner","employee_selector":{"preferred_id":"ai-product-manager","capabilities":["local-file-operations"]},"goal":"Write the requested summary","depends_on":[],"acceptance_criteria":[{"criterion_id":"summary","description":"Includes a summary","evidence_type":"structured_output","required":true}]}],"acceptance_criteria":[{"criterion_id":"summary","description":"Includes a summary","evidence_type":"structured_output","required":true}],"requested_resources":[],"budget_hint":{"input_tokens":0,"output_tokens":0,"tool_rounds":0,"wall_clock_ms":0}}"#;
    static PROPOSAL_FIXTURE_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct ProposalGenerationFixture {
        database: PathBuf,
        thread_id: String,
        repository_root: PathBuf,
        worker_path: PathBuf,
        old_proposal_id: Option<String>,
    }

    impl ProposalGenerationFixture {
        fn arguments_with_failing_worker(&self, stderr: &str) -> impl Iterator<Item = String> {
            let escaped_stderr = stderr.replace('\'', "'\\''");
            fs::write(
                &self.worker_path,
                format!("#!/bin/sh\nprintf '%s\\n' '{escaped_stderr}' >&2\nexit 2\n"),
            )
            .unwrap();
            fs::set_permissions(&self.worker_path, fs::Permissions::from_mode(0o700)).unwrap();
            self.arguments()
        }

        fn arguments_with_success_worker(&self) -> impl Iterator<Item = String> {
            let escaped_proposal = VALID_TWO_ASSIGNMENT_PROPOSAL.replace('\'', "'\\''");
            fs::write(
                &self.worker_path,
                format!("#!/bin/sh\nprintf '%s\\n' '{escaped_proposal}'\nexit 0\n"),
            )
            .unwrap();
            fs::set_permissions(&self.worker_path, fs::Permissions::from_mode(0o700)).unwrap();
            self.arguments()
        }

        fn write_successful_decision_worker(&self) {
            fs::write(
                &self.worker_path,
                "#!/bin/sh\nprintf '%s\\n' '{\"schema_version\":\"1.0.0\",\"type\":\"complete\",\"output\":{\"summary\":\"ok\"},\"deliverable_candidates\":[],\"evidence_refs\":[]}'\n",
            )
            .unwrap();
            fs::set_permissions(&self.worker_path, fs::Permissions::from_mode(0o700)).unwrap();
        }

        fn arguments_for_confirm_with_success_worker(&self) -> impl Iterator<Item = String> {
            self.write_successful_decision_worker();
            let proposal_id = self
                .old_proposal_id
                .as_deref()
                .expect("fixture has an old proposal");
            let proposal_hash: String = Connection::open(&self.database)
                .unwrap()
                .query_row(
                    "SELECT proposal_sha256 FROM task_proposals WHERE id=?1",
                    [proposal_id],
                    |row| row.get(0),
                )
                .unwrap();
            vec![
                "--database".to_owned(),
                self.database.display().to_string(),
                "--repository-root".to_owned(),
                self.repository_root.display().to_string(),
                "--proposal-id".to_owned(),
                proposal_id.to_owned(),
                "--proposal-hash".to_owned(),
                proposal_hash,
                "--python".to_owned(),
                self.worker_path.display().to_string(),
            ]
            .into_iter()
        }

        fn arguments(&self) -> impl Iterator<Item = String> {
            vec![
                "--database".to_owned(),
                self.database.display().to_string(),
                "--repository-root".to_owned(),
                self.repository_root.display().to_string(),
                "--thread-id".to_owned(),
                self.thread_id.clone(),
                "--python".to_owned(),
                self.worker_path.display().to_string(),
            ]
            .into_iter()
        }
    }

    impl Drop for ProposalGenerationFixture {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.worker_path);
            let _ = fs::remove_file(&self.database);
        }
    }

    fn proposal_generation_fixture() -> ProposalGenerationFixture {
        let fixture_id = format!(
            "{}-{}",
            unique_suffix(),
            PROPOSAL_FIXTURE_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        let database =
            env::temp_dir().join(format!("ai-employee-proposal-generation-{fixture_id}.db"));
        let repository_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let worker_path =
            env::temp_dir().join(format!("ai-employee-proposal-worker-{fixture_id}.sh"));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        ensure_default_agent(&mut connection, &repository_root).unwrap();
        let stamp = now();
        connection
            .execute(
                "INSERT INTO agents VALUES ('data-researcher','Data Researcher','researcher','user','active',?1,?1)",
                [&stamp],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO employee_profiles (agent_id,department,mission,responsibilities_json,boundaries_json,soul_json,base_prompt,config_version,created_at,updated_at) VALUES ('data-researcher','Research','Research','[]','[]','[]','Research',1,?1,?1)",
                [&stamp],
            )
            .unwrap();
        bind_skill(
            &connection,
            "data-researcher",
            "web-search",
            "1.0.0",
            &stamp,
        )
        .unwrap();
        let thread_id = "thread_proposal_generation".to_owned();
        connection.execute("INSERT INTO task_threads(id,title,status,current_revision,created_at,updated_at) VALUES (?1,'Research and write','drafting',1,?2,?2)", rusqlite::params![thread_id,stamp]).unwrap();
        connection.execute("INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,created_at) VALUES ('message_generation_goal',?1,1,'user','goal','Research and write a summary',?2),('message_generation_clarification',?1,2,'user','clarification','Use public sources',?2)", rusqlite::params![thread_id,stamp]).unwrap();
        drop(connection);
        ProposalGenerationFixture {
            database,
            thread_id,
            repository_root,
            worker_path,
            old_proposal_id: None,
        }
    }

    fn proposal_generation_fixture_with_validated_proposal() -> ProposalGenerationFixture {
        let mut fixture = proposal_generation_fixture();
        let connection = Connection::open(&fixture.database).unwrap();
        let proposal_id = "proposal_generation_old".to_owned();
        let hash = format!(
            "{:x}",
            Sha256::digest(VALID_TWO_ASSIGNMENT_PROPOSAL.as_bytes())
        );
        let stamp = now();
        connection.execute("INSERT INTO task_proposals(id,thread_id,revision,status,proposal_json,proposal_sha256,expires_at,created_at,updated_at) VALUES (?1,?2,1,'validated',?3,?4,?5,?6,?6)", rusqlite::params![proposal_id,fixture.thread_id,VALID_TWO_ASSIGNMENT_PROPOSAL,hash,future_expiry(),stamp]).unwrap();
        connection
            .execute(
                "UPDATE task_threads SET status='awaiting_confirmation' WHERE id=?1",
                [&fixture.thread_id],
            )
            .unwrap();
        drop(connection);
        fixture.old_proposal_id = Some(proposal_id);
        fixture
    }

    fn proposal_generation_fixture_with_single_validated_proposal() -> ProposalGenerationFixture {
        let mut fixture = proposal_generation_fixture();
        let connection = Connection::open(&fixture.database).unwrap();
        let proposal_id = "proposal_generation_single".to_owned();
        let proposal: Value = serde_json::from_str(VALID_SINGLE_ASSIGNMENT_PROPOSAL).unwrap();
        let canonical = serde_json::to_string(&proposal).unwrap();
        let hash = format!("{:x}", Sha256::digest(canonical.as_bytes()));
        let stamp = now();
        connection.execute("INSERT INTO task_proposals(id,thread_id,revision,status,proposal_json,proposal_sha256,expires_at,created_at,updated_at) VALUES (?1,?2,1,'validated',?3,?4,?5,?6,?6)", rusqlite::params![proposal_id,fixture.thread_id,canonical,hash,future_expiry(),stamp]).unwrap();
        connection
            .execute(
                "UPDATE task_threads SET status='awaiting_confirmation' WHERE id=?1",
                [&fixture.thread_id],
            )
            .unwrap();
        drop(connection);
        fixture.old_proposal_id = Some(proposal_id);
        fixture
    }

    fn proposal_generation_fixture_with_matching_validated_proposal() -> ProposalGenerationFixture {
        let mut fixture = proposal_generation_fixture();
        let connection = Connection::open(&fixture.database).unwrap();
        let proposal_id = "proposal_generation_matching".to_owned();
        let proposal: Value = serde_json::from_str(VALID_TWO_ASSIGNMENT_PROPOSAL).unwrap();
        let canonical = serde_json::to_string(&proposal).unwrap();
        let hash = format!("{:x}", Sha256::digest(canonical.as_bytes()));
        let stamp = now();
        connection.execute("INSERT INTO task_proposals(id,thread_id,revision,status,proposal_json,proposal_sha256,expires_at,created_at,updated_at) VALUES (?1,?2,1,'validated',?3,?4,?5,?6,?6)", rusqlite::params![proposal_id,fixture.thread_id,canonical,hash,future_expiry(),stamp]).unwrap();
        connection
            .execute(
                "UPDATE task_threads SET status='awaiting_confirmation' WHERE id=?1",
                [&fixture.thread_id],
            )
            .unwrap();
        drop(connection);
        fixture.old_proposal_id = Some(proposal_id);
        fixture
    }

    fn proposal_status(database: &Path, proposal_id: &Option<String>) -> String {
        Connection::open(database)
            .unwrap()
            .query_row(
                "SELECT status FROM task_proposals WHERE id=?1",
                [proposal_id.as_deref().expect("fixture has an old proposal")],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn message_kind_count(database: &Path, thread_id: &str, kind: &str) -> i64 {
        Connection::open(database)
            .unwrap()
            .query_row(
                "SELECT count(*) FROM task_thread_messages WHERE thread_id=?1 AND kind=?2",
                rusqlite::params![thread_id, kind],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn goal_count(database: &Path, thread_id: &str) -> i64 {
        message_kind_count(database, thread_id, "goal")
    }

    fn clarification_count(database: &Path, thread_id: &str) -> i64 {
        message_kind_count(database, thread_id, "clarification")
    }

    #[test]
    fn task_proposal_failure_persists_only_a_safe_error_code() {
        let fixture = proposal_generation_fixture();
        let error = task_proposal_generate(fixture.arguments_with_failing_worker(
            r#"{"schema_version":"1.0","error_code":"network","detail":"sk-secret /Users/private"}"#,
        ))
        .unwrap_err();
        assert_eq!(error, "task_proposal_provider_network");

        let connection = Connection::open(&fixture.database).unwrap();
        let content: String = connection
            .query_row(
                "SELECT content FROM task_thread_messages WHERE thread_id=?1 AND kind='error' ORDER BY sequence DESC LIMIT 1",
                [&fixture.thread_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(content, "task_proposal_provider_network");
        assert!(!content.contains("sk-secret"));
        assert!(!content.contains("/Users/private"));
    }

    #[test]
    fn regenerate_rejects_old_proposal_and_increments_revision_once() {
        let fixture = proposal_generation_fixture_with_validated_proposal();
        let response = task_proposal_regenerate(fixture.arguments_with_success_worker()).unwrap();
        assert_eq!(response["revision"], 2);
        assert_eq!(
            proposal_status(&fixture.database, &fixture.old_proposal_id),
            "rejected"
        );
        assert_eq!(goal_count(&fixture.database, &fixture.thread_id), 1);
        assert_eq!(
            clarification_count(&fixture.database, &fixture.thread_id),
            1
        );
    }

    #[test]
    fn regenerate_legacy_draft_without_proposal_keeps_revision() {
        let fixture = proposal_generation_fixture();
        let response = task_proposal_regenerate(fixture.arguments_with_success_worker()).unwrap();
        assert_eq!(response["revision"], 1);
        assert_eq!(goal_count(&fixture.database, &fixture.thread_id), 1);
    }

    #[test]
    fn regenerate_reuses_the_old_row_when_the_canonical_hash_is_unchanged() {
        let fixture = proposal_generation_fixture_with_matching_validated_proposal();
        let old_proposal_id = fixture.old_proposal_id.as_deref().unwrap();

        let response = task_proposal_regenerate(fixture.arguments_with_success_worker()).unwrap();

        assert_eq!(response["proposal_id"], old_proposal_id);
        assert_eq!(response["revision"], 2);
        assert_eq!(
            proposal_status(&fixture.database, &fixture.old_proposal_id),
            "validated"
        );
        let proposal_count: i64 = Connection::open(&fixture.database)
            .unwrap()
            .query_row("SELECT count(*) FROM task_proposals", [], |row| row.get(0))
            .unwrap();
        assert_eq!(proposal_count, 1);
        assert_eq!(
            task_proposal_current(proposal_current_arguments(
                &fixture.database,
                &fixture.thread_id
            ))
            .unwrap()["proposal_id"],
            old_proposal_id
        );
    }

    #[test]
    fn task_proposal_save_rejects_revision_drift_after_the_worker() {
        let fixture = proposal_generation_fixture();
        let _ = fixture.arguments_with_success_worker();
        let mut connection = Connection::open(&fixture.database).unwrap();

        let error = generate_task_proposal_with_hook(
            &mut connection,
            &fixture.repository_root,
            &fixture.worker_path,
            &fixture.thread_id,
            None,
            ProposalGenerationMode::Initial,
            || {
                task_thread_message(
                    vec![
                        "--database".to_owned(),
                        fixture.database.display().to_string(),
                        "--thread-id".to_owned(),
                        fixture.thread_id.clone(),
                        "--input".to_owned(),
                        "Use the newer clarification".to_owned(),
                    ]
                    .into_iter(),
                )?;
                Ok(())
            },
        )
        .unwrap_err();

        assert_eq!(error, "task_proposal_revision_conflict");
        let thread: (String, i64) = connection
            .query_row(
                "SELECT status,current_revision FROM task_threads WHERE id=?1",
                [&fixture.thread_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(thread, ("drafting".to_owned(), 2));
        let proposal_count: i64 = connection
            .query_row("SELECT count(*) FROM task_proposals", [], |row| row.get(0))
            .unwrap();
        assert_eq!(proposal_count, 0);
    }

    #[test]
    fn confirm_claim_prevents_regenerate_from_rejecting_the_proposal() {
        let fixture = proposal_generation_fixture_with_single_validated_proposal();
        let response = task_proposal_confirm_with_hook(
            fixture.arguments_for_confirm_with_success_worker(),
            |thread_id, proposal_id| {
                assert_eq!(
                    proposal_status(&fixture.database, &Some(proposal_id.to_owned())),
                    "confirmed"
                );
                let error = task_proposal_regenerate(fixture.arguments_with_failing_worker(
                    r#"{"schema_version":"1.0","error_code":"network"}"#,
                ))
                .unwrap_err();
                assert_eq!(error, "task_proposal_provider_network");
                assert_eq!(thread_id, fixture.thread_id);
                assert_eq!(
                    proposal_status(&fixture.database, &Some(proposal_id.to_owned())),
                    "confirmed"
                );
                fixture.write_successful_decision_worker();
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(response["execution"]["status"], "succeeded");
        assert_eq!(
            proposal_status(&fixture.database, &fixture.old_proposal_id),
            "materialized"
        );
        assert_eq!(
            message_kind_count(&fixture.database, &fixture.thread_id, "confirmation"),
            1
        );
    }

    #[test]
    fn confirm_invalid_intent_assignment_does_not_claim_the_proposal() {
        let fixture = proposal_generation_fixture_with_matching_validated_proposal();
        let proposal_id = fixture.old_proposal_id.as_deref().unwrap();
        let connection = Connection::open(&fixture.database).unwrap();
        let mut proposal: Value = serde_json::from_str(VALID_TWO_ASSIGNMENT_PROPOSAL).unwrap();
        proposal["intent"] = json!("single_agent_task");
        let canonical = serde_json::to_string(&proposal).unwrap();
        let hash = format!("{:x}", Sha256::digest(canonical.as_bytes()));
        connection
            .execute(
                "UPDATE task_proposals SET proposal_json=?2,proposal_sha256=?3 WHERE id=?1",
                rusqlite::params![proposal_id, canonical, hash],
            )
            .unwrap();
        drop(connection);

        let error =
            task_proposal_confirm(fixture.arguments_for_confirm_with_success_worker()).unwrap_err();

        assert_eq!(error, "task_proposal_intent_assignment_mismatch");
        assert_eq!(
            proposal_status(&fixture.database, &fixture.old_proposal_id),
            "validated"
        );
    }

    #[test]
    fn confirm_invalid_scenario_does_not_claim_the_proposal() {
        let fixture = proposal_generation_fixture_with_matching_validated_proposal();
        let proposal_id = fixture.old_proposal_id.as_deref().unwrap();
        let connection = Connection::open(&fixture.database).unwrap();
        let mut proposal: Value = serde_json::from_str(VALID_TWO_ASSIGNMENT_PROPOSAL).unwrap();
        proposal["assignments"][1]["role"] = json!("contributor");
        let canonical = serde_json::to_string(&proposal).unwrap();
        let hash = format!("{:x}", Sha256::digest(canonical.as_bytes()));
        connection
            .execute(
                "UPDATE task_proposals SET proposal_json=?2,proposal_sha256=?3 WHERE id=?1",
                rusqlite::params![proposal_id, canonical, hash],
            )
            .unwrap();
        drop(connection);

        let error =
            task_proposal_confirm(fixture.arguments_for_confirm_with_success_worker()).unwrap_err();

        assert_eq!(error, "task_proposal_finalizer_required");
        assert_eq!(
            proposal_status(&fixture.database, &fixture.old_proposal_id),
            "validated"
        );
    }

    fn future_expiry() -> String {
        (SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 900)
            .to_string()
    }

    fn proposal_current_arguments(
        database: &Path,
        thread_id: &str,
    ) -> impl Iterator<Item = String> {
        vec![
            "--database".to_owned(),
            database.display().to_string(),
            "--thread-id".to_owned(),
            thread_id.to_owned(),
        ]
        .into_iter()
    }

    fn proposal_recovery_fixture(status: &str, expires_at: String) -> (PathBuf, String, String) {
        let database = env::temp_dir().join(format!(
            "ai-employee-proposal-current-{}-{}.db",
            unique_suffix(),
            PROPOSAL_FIXTURE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        let repository_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let stamp = now();
        bootstrap_packages(&mut connection, &repository_root, &stamp).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('data-researcher','Data Researcher','researcher','user','active',?1,?1)",
                [&stamp],
            )
            .unwrap();
        bind_skill(
            &connection,
            "data-researcher",
            "web-search",
            "1.0.0",
            &stamp,
        )
        .unwrap();

        let thread_id = "thread_proposal_recovery".to_owned();
        let proposal_id = "proposal_recovery".to_owned();
        let proposal = r#"{"schema_version":"1.0.0","intent":"single_agent_task","title":"Research","objective":"Research the current topic","missing_inputs":[],"deliverable":{"type":"structured_result","description":"Research summary","target_path":null},"assignments":[{"node_id":"research","role":"owner","employee_selector":{"preferred_id":"data-researcher","capabilities":["web-search"]},"goal":"Research the current topic","depends_on":[],"acceptance_criteria":[{"criterion_id":"sources","description":"Includes sources","evidence_type":"structured_output","required":true}]}],"acceptance_criteria":[{"criterion_id":"sources","description":"Includes sources","evidence_type":"structured_output","required":true}],"requested_resources":[],"budget_hint":{"input_tokens":0,"output_tokens":0,"tool_rounds":0,"wall_clock_ms":0}}"#;
        let hash = format!("{:x}", Sha256::digest(proposal.as_bytes()));
        connection.execute("INSERT INTO task_threads(id,title,status,current_revision,created_at,updated_at) VALUES (?1,'Research','awaiting_confirmation',1,?2,?2)", rusqlite::params![thread_id,stamp]).unwrap();
        connection.execute("INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,created_at) VALUES ('message_goal',?1,1,'user','goal','Research the current topic',?2),('message_clarification',?1,2,'user','clarification','Use public sources',?2)", rusqlite::params![thread_id,stamp]).unwrap();
        connection.execute("INSERT INTO task_proposals(id,thread_id,revision,status,proposal_json,proposal_sha256,expires_at,created_at,updated_at) VALUES (?1,?2,1,?3,?4,?5,?6,?7,?7)", rusqlite::params![proposal_id,thread_id,status,proposal,hash,expires_at,stamp]).unwrap();
        drop(connection);
        (database, thread_id, proposal_id)
    }

    #[test]
    fn task_proposal_current_restores_without_writes_or_model_calls() {
        let (database, thread_id, proposal_id) =
            proposal_recovery_fixture("validated", future_expiry());
        let arguments = || {
            vec![
                "--database".to_owned(),
                database.display().to_string(),
                "--thread-id".to_owned(),
                thread_id.clone(),
            ]
            .into_iter()
        };

        let first = task_proposal_current(arguments()).unwrap();
        let second = task_proposal_current(arguments()).unwrap();

        assert_eq!(first, second);
        assert_eq!(first["proposal_id"], proposal_id);
        assert_eq!(
            first["resolved_assignments"][0]["agent_id"],
            "data-researcher"
        );
        let connection = Connection::open(&database).unwrap();
        let proposals: i64 = connection
            .query_row("SELECT count(*) FROM task_proposals", [], |row| row.get(0))
            .unwrap();
        let messages: i64 = connection
            .query_row("SELECT count(*) FROM task_thread_messages", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(proposals, 1);
        assert_eq!(messages, 2);
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_proposal_current_rejects_expired_without_mutating_status() {
        let (database, thread_id, _) = proposal_recovery_fixture("validated", "1".to_owned());
        let error =
            task_proposal_current(proposal_current_arguments(&database, &thread_id)).unwrap_err();
        assert_eq!(error, "task_proposal_expired");
        let status: String = Connection::open(&database)
            .unwrap()
            .query_row("SELECT status FROM task_proposals LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(status, "validated");
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_proposal_current_rejects_stale_employee_resolution() {
        let (database, thread_id, _) = proposal_recovery_fixture("validated", future_expiry());
        Connection::open(&database)
            .unwrap()
            .execute(
                "UPDATE agents SET status='disabled' WHERE id='data-researcher'",
                [],
            )
            .unwrap();
        let error =
            task_proposal_current(proposal_current_arguments(&database, &thread_id)).unwrap_err();
        assert_eq!(error, "task_proposal_stale");
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_proposal_current_rejects_unknown_schema_version() {
        let (database, thread_id, _) = proposal_recovery_fixture("validated", future_expiry());
        Connection::open(&database)
            .unwrap()
            .execute(
                "UPDATE task_proposals SET proposal_json=replace(proposal_json, '\"schema_version\":\"1.0.0\"', '\"schema_version\":\"9.0.0\"')",
                [],
            )
            .unwrap();
        let error =
            task_proposal_current(proposal_current_arguments(&database, &thread_id)).unwrap_err();
        assert_eq!(error, "task_proposal_schema_invalid");
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_room_normalizes_second_and_millisecond_timestamps() {
        assert_eq!(timeline_sort_time("1786521339"), 1_786_521_339_000);
        assert_eq!(timeline_sort_time("1786521339000"), 1_786_521_339_000);
    }

    #[test]
    fn conversation_access_rejects_a_different_employee() {
        let database = env::temp_dir().join(format!("ai-employee-conversation-owner-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute_batch(
                "INSERT INTO agents VALUES ('alex','Alex','ai_product_manager','user','active','t','t');
                 INSERT INTO agents VALUES ('writer','Writer','writer','user','active','t','t');
                 INSERT INTO conversations VALUES ('conversation_alex_primary','alex','chat','active','t','t');",
            )
            .unwrap();
        drop(connection);

        let arguments = |employee_id: &str| {
            vec![
                "--database".to_owned(),
                database.display().to_string(),
                "--conversation-id".to_owned(),
                "conversation_alex_primary".to_owned(),
                "--employee-id".to_owned(),
                employee_id.to_owned(),
            ]
            .into_iter()
        };
        assert!(chat_history(arguments("alex")).is_ok());
        assert_eq!(
            chat_history(arguments("writer")).unwrap_err(),
            "conversation_employee_mismatch"
        );
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn conversation_archive_hides_history_and_can_restore() {
        let database =
            env::temp_dir().join(format!("ai-employee-conversation-archive-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        connection.execute_batch(
            "INSERT INTO agents VALUES ('alex','Alex','ai_product_manager','user','active','t','t');
             INSERT INTO conversations VALUES ('conversation_alex_primary','alex','chat','active','t','t');
             INSERT INTO messages (id,conversation_id,sequence,role,content,created_at) VALUES ('m1','conversation_alex_primary',1,'user','hello','t');"
        ).unwrap();
        drop(connection);
        let retention = |operation: &str| {
            vec![
                "--database".to_owned(),
                database.display().to_string(),
                "--conversation-id".to_owned(),
                "conversation_alex_primary".to_owned(),
                "--employee-id".to_owned(),
                "alex".to_owned(),
                "--operation".to_owned(),
                operation.to_owned(),
            ]
            .into_iter()
        };
        let history = || {
            vec![
                "--database".to_owned(),
                database.display().to_string(),
                "--conversation-id".to_owned(),
                "conversation_alex_primary".to_owned(),
                "--employee-id".to_owned(),
                "alex".to_owned(),
            ]
            .into_iter()
        };
        chat_retention(retention("archive")).unwrap();
        assert_eq!(
            chat_history(history()).unwrap()["messages"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
        let listed =
            archive_list(vec!["--database".to_owned(), database.display().to_string()].into_iter())
                .unwrap();
        assert_eq!(listed["conversations"].as_array().unwrap().len(), 1);
        chat_retention(retention("restore")).unwrap();
        assert_eq!(
            chat_history(history()).unwrap()["messages"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_input_text_extracts_user_text_without_leaking_transport_json() {
        assert_eq!(
            task_input_text(r#"{"text":"查询下chatgpt最新版本吧"}"#),
            "查询下chatgpt最新版本吧"
        );
        assert_eq!(task_input_text("plain task"), "plain task");
    }

    #[test]
    fn revision_rejects_older_user_message_and_removes_only_latest_turn() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT, sequence INTEGER, role TEXT, content TEXT, created_at TEXT);
                 CREATE TABLE model_calls(id TEXT PRIMARY KEY, conversation_id TEXT, user_message_id TEXT);",
            )
            .unwrap();
        for (id, sequence, role) in [
            ("u1", 1, "user"),
            ("a1", 2, "assistant"),
            ("u2", 3, "user"),
            ("a2", 4, "assistant"),
        ] {
            connection
                .execute(
                    "INSERT INTO messages VALUES (?1,'c1',?2,?3,'content','time')",
                    rusqlite::params![id, sequence, role],
                )
                .unwrap();
        }
        connection
            .execute("INSERT INTO model_calls VALUES ('call1','c1','u1')", [])
            .unwrap();
        connection
            .execute("INSERT INTO model_calls VALUES ('call2','c1','u2')", [])
            .unwrap();

        let rejected = connection.transaction().unwrap();
        assert_eq!(
            prepare_latest_user_revision(&rejected, "c1", "u1").unwrap_err(),
            "only the latest user message can be edited"
        );
        rejected.rollback().unwrap();

        let revision = connection.transaction().unwrap();
        assert_eq!(
            prepare_latest_user_revision(&revision, "c1", "u2").unwrap(),
            3
        );
        revision.commit().unwrap();
        let remaining: Vec<String> = connection
            .prepare("SELECT id FROM messages ORDER BY sequence")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(remaining, ["u1", "a1"]);
        let calls: i64 = connection
            .query_row("SELECT count(*) FROM model_calls", [], |row| row.get(0))
            .unwrap();
        assert_eq!(calls, 1);
    }

    #[test]
    fn completed_run_replaces_waiting_message_and_formats_source_links() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE messages(id TEXT PRIMARY KEY, conversation_id TEXT, sequence INTEGER, role TEXT, content TEXT, created_at TEXT);
                 CREATE TABLE run_snapshots(run_id TEXT, snapshot_type TEXT, snapshot_json TEXT);
                 CREATE TABLE conversations(id TEXT PRIMARY KEY, updated_at TEXT);
                 INSERT INTO conversations VALUES ('c1','before');
                 INSERT INTO messages VALUES ('waiting','c1',2,'assistant','执行已暂停，等待你批准所需权限。','before');
                 INSERT INTO run_snapshots VALUES ('run1','context','{\"conversation_id\":\"c1\"}');",
            )
            .unwrap();

        append_run_result_to_conversation(
            &mut connection,
            "run1",
            &json!({
                "status": "succeeded",
                "phase": "terminal",
                "output": {
                    "answer": "## 主要动态\n- **发布更新**：内容",
                    "sources": [{"title":"Example 发布说明","url":"https://example.com/long/path"}]
                }
            }),
        )
        .unwrap();

        let messages: Vec<(String, String)> = connection
            .prepare("SELECT id,content FROM messages ORDER BY sequence")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].0, "waiting");
        assert!(messages[0].1.contains("## 主要动态"));
        assert!(
            messages[0]
                .1
                .contains("[Example 发布说明](https://example.com/long/path)")
        );
        assert!(!messages[0].1.contains(WAITING_APPROVAL_MESSAGE));
    }

    #[test]
    fn polling_task_history_does_not_recover_a_live_execution() {
        let database = env::temp_dir().join(format!("ai-employee-list-tasks-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        connection.execute("INSERT INTO agents VALUES ('alex','Alex','ai_product_manager','package','active','t','t')", []).unwrap();
        connection
            .execute(
                "INSERT INTO tools VALUES ('tool','Tool','native','1.0.0','{}','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task','alex','input','running','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO actions VALUES ('action','task','tool','{}',NULL,'running','t','t')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO tool_executions VALUES ('call','action','key',1,'running','none',NULL,'t',NULL,'trace')", []).unwrap();
        drop(connection);

        list_tasks(vec!["--database".to_owned(), database.display().to_string()].into_iter())
            .unwrap();
        let connection = Connection::open(&database).unwrap();
        let status: String = connection
            .query_row(
                "SELECT status FROM tool_executions WHERE call_id='call'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "running");
        drop(connection);

        recover_runtime(vec!["--database".to_owned(), database.display().to_string()].into_iter())
            .unwrap();
        let connection = Connection::open(&database).unwrap();
        let status: String = connection
            .query_row(
                "SELECT status FROM tool_executions WHERE call_id='call'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "failed");
        drop(connection);
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_history_uses_one_verified_deliverable_and_stable_event_action_order() {
        let database = env::temp_dir().join(format!("ai-employee-task-view-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','role','package','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task','alex','input','succeeded','1','9')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO tools VALUES ('tool','Tool','native','1.0.0','{}','active','t','t')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO actions VALUES ('action-b','task','tool','{}','{\"path\":\"/tmp/unverified\"}','succeeded','2','2')", []).unwrap();
        connection.execute("INSERT INTO actions VALUES ('action-a','task','tool','{}','{}','succeeded','1','1')", []).unwrap();
        connection.execute("INSERT INTO agent_runs(id,task_id,schema_version,phase,revision,model_turns_used,tool_calls_used,max_model_turns,max_tool_calls,deadline,waiting_reason,stop_reason,created_at,updated_at) VALUES ('run','task','1.0.0','terminal',1,1,1,4,4,'later',NULL,'complete','1','9')", []).unwrap();
        connection.execute("INSERT INTO deliverables VALUES ('verified','task','run','structured_result','Verified title','summary','verified','{\"answer\":\"verified body\"}','2','2')", []).unwrap();
        connection.execute("INSERT INTO deliverables VALUES ('candidate','task','run','structured_result','Candidate title','summary','candidate','{\"answer\":\"candidate body\"}','3',NULL)", []).unwrap();
        connection.execute("INSERT INTO artifacts VALUES ('linked','task','run','file','/tmp/linked','text/plain',1,?1,NULL,'internal','verified','2')", ["a".repeat(64)]).unwrap();
        connection.execute("INSERT INTO artifacts VALUES ('unrelated','task','run','file','/tmp/unrelated','text/plain',1,?1,NULL,'internal','verified','4')", ["b".repeat(64)]).unwrap();
        connection
            .execute(
                "INSERT INTO deliverable_evidence VALUES ('verified','artifact','linked','2')",
                [],
            )
            .unwrap();

        let result =
            list_tasks(vec!["--database".to_owned(), database.display().to_string()].into_iter())
                .unwrap();
        let task = &result["tasks"][0];
        assert_eq!(task["deliverable_title"], "Verified title");
        assert_eq!(task["deliverable_status"], "verified");
        assert_eq!(task["deliverable_message"], "verified body");
        assert_eq!(task["artifact_path"], "/tmp/linked");
        assert_eq!(task["verified_artifact_path"], "/tmp/linked");
        assert_eq!(task["actions"][0]["action_id"], "action-a");
        assert_eq!(task["actions"][1]["action_id"], "action-b");
        assert_eq!(task["events"][0]["payload"]["agent_id"], "alex");
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn knowledge_list_reads_canonical_sources_and_chunk_order() {
        let database = env::temp_dir().join(format!("ai-employee-knowledge-list-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        import_source(
            &mut connection,
            "source",
            "file:///notes/a.md",
            "local_file",
            "A",
            "first\n\nsecond",
            "t",
        )
        .unwrap();
        let result = knowledge_list_command(
            vec!["--database".to_owned(), database.display().to_string()].into_iter(),
        )
        .unwrap();
        assert_eq!(result["sources"][0]["id"], "source");
        assert_eq!(result["sources"][0]["index_status"], "indexed");
        assert!(
            result["sources"][0]["content"]
                .as_str()
                .unwrap()
                .contains("first")
        );
        fs::remove_file(database).unwrap();
    }

    fn millis_for_local_day_offset(connection: &Connection, offset: i64) -> String {
        let day_modifier = if offset == 0 {
            "0 days".to_owned()
        } else {
            format!("-{offset} days")
        };
        connection
            .query_row(
                "SELECT CAST(
                    strftime('%s', date('now', 'localtime', ?1) || ' 12:00:00')
                    + (strftime('%s', 'now') - strftime('%s', 'now', 'localtime'))
                 AS INTEGER) * 1000",
                [day_modifier],
                |row| row.get::<_, i64>(0),
            )
            .unwrap()
            .to_string()
    }

    fn seed_succeeded_model_call(
        connection: &Connection,
        call_id: &str,
        user_message_id: &str,
        sequence: i64,
        input_tokens: i64,
        output_tokens: i64,
        created_at: &str,
    ) {
        connection
            .execute(
                "INSERT INTO messages VALUES (?1,'c1',?2,'user','hello',?3)",
                rusqlite::params![user_message_id, sequence, created_at],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO model_calls (id,conversation_id,user_message_id,assistant_message_id,provider,model,status,input_tokens,output_tokens,error_code,created_at,completed_at)
                 VALUES (?1,'c1',?2,NULL,'deepseek','deepseek-v4-flash','succeeded',?3,?4,NULL,?5,?5)",
                rusqlite::params![call_id, user_message_id, input_tokens, output_tokens, created_at],
            )
            .unwrap();
    }

    #[test]
    fn usage_summary_empty_database_returns_seven_zero_points() {
        let database = env::temp_dir().join(format!("ai-employee-usage-empty-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        drop(connection);

        let summary = usage_summary(
            vec!["--database".to_owned(), database.display().to_string()].into_iter(),
        )
        .unwrap();
        assert_eq!(summary["schema_version"], "1.0");
        assert_eq!(summary["input_tokens"], 0);
        assert_eq!(summary["output_tokens"], 0);
        assert_eq!(summary["model_calls"], 0);
        assert_eq!(summary["estimated_cost_cny"], 0.0);
        assert_eq!(summary["pricing_model"], "deepseek-v4-flash");
        assert_eq!(summary["pricing_basis"], "input_cache_miss");
        assert_eq!(summary["pricing_version"], "deepseek-v4-flash-cny-v1");
        assert_eq!(
            summary["pricing_source"],
            "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/"
        );
        let points = summary["points"].as_array().unwrap();
        assert_eq!(points.len(), 7);
        assert_eq!(points.last().unwrap()["label"], "今天");
        assert!(
            points
                .iter()
                .all(|point| { point["input_tokens"] == 0 && point["output_tokens"] == 0 })
        );
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn usage_summary_aggregates_succeeded_calls_and_estimates_cost() {
        let database = env::temp_dir().join(format!("ai-employee-usage-data-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','ai_product_manager','package','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO conversations VALUES ('c1','alex','chat','active','t','t')",
                [],
            )
            .unwrap();

        let today = millis_for_local_day_offset(&connection, 0);
        let yesterday = millis_for_local_day_offset(&connection, 1);
        let eight_days_ago = millis_for_local_day_offset(&connection, 8);

        seed_succeeded_model_call(
            &connection,
            "call-today",
            "u-today",
            1,
            1_000_000,
            500_000,
            &today,
        );
        seed_succeeded_model_call(
            &connection,
            "call-yesterday",
            "u-yesterday",
            2,
            1_000_000,
            0,
            &yesterday,
        );
        seed_succeeded_model_call(
            &connection,
            "call-old",
            "u-old",
            3,
            9_000_000,
            9_000_000,
            &eight_days_ago,
        );
        connection
            .execute(
                "INSERT INTO messages VALUES ('u-failed','c1',99,'user','fail','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO model_calls (id,conversation_id,user_message_id,assistant_message_id,provider,model,status,input_tokens,output_tokens,error_code,created_at,completed_at)
                 VALUES ('call-failed','c1','u-failed',NULL,'deepseek','deepseek-v4-flash','failed',100,100,NULL,?1,?1)",
                [&today],
            )
            .unwrap();
        drop(connection);

        let summary = usage_summary(
            vec!["--database".to_owned(), database.display().to_string()].into_iter(),
        )
        .unwrap();
        assert_eq!(summary["input_tokens"], 2_000_000);
        assert_eq!(summary["output_tokens"], 500_000);
        assert_eq!(summary["model_calls"], 2);
        // DeepSeek V4 Flash：2M 输入（缓存未命中）* ¥1/M + 0.5M 输出 * ¥2/M = ¥3。
        assert!((summary["estimated_cost_cny"].as_f64().unwrap() - 3.0).abs() < 1e-9);

        let points = summary["points"].as_array().unwrap();
        assert_eq!(points.len(), 7);
        assert_eq!(points[6]["label"], "今天");
        assert_eq!(points[6]["input_tokens"], 1_000_000);
        assert_eq!(points[6]["output_tokens"], 500_000);
        assert_eq!(points[5]["input_tokens"], 1_000_000);
        assert_eq!(points[5]["output_tokens"], 0);
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn usage_summary_fails_closed_for_an_unpriced_model() {
        let database = env::temp_dir().join(format!("ai-employee-usage-model-{}.db", now()));
        let mut connection = Connection::open(&database).unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','role','package','active','t','t')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO conversations VALUES ('c1','alex','chat','active','t','t')",
                [],
            )
            .unwrap();
        let today = millis_for_local_day_offset(&connection, 0);
        connection
            .execute(
                "INSERT INTO messages VALUES ('u1','c1',1,'user','hello',?1)",
                [&today],
            )
            .unwrap();
        connection.execute("INSERT INTO model_calls VALUES ('call','c1','u1',NULL,'other','model-x','succeeded',100,100,NULL,?1,?1)", [&today]).unwrap();
        drop(connection);

        let error = usage_summary(
            vec!["--database".to_owned(), database.display().to_string()].into_iter(),
        )
        .unwrap_err();
        assert_eq!(error, "unsupported_usage_pricing_model:other/model-x");
        fs::remove_file(database).unwrap();
    }

    #[test]
    fn task_thread_retention_archives_restores_and_soft_deletes() {
        let database = env::temp_dir().join(format!("ai-employee-thread-retention-{}.db", now()));
        let database_path = database.display().to_string();
        let created = task_thread_create(
            vec![
                "--database".to_owned(),
                database_path.clone(),
                "--title".to_owned(),
                "研究任务".to_owned(),
                "--objective".to_owned(),
                "整理资料".to_owned(),
            ]
            .into_iter(),
        )
        .unwrap();
        let thread_id = created["id"].as_str().unwrap().to_owned();

        task_thread_retention(
            vec![
                "--database".to_owned(),
                database_path.clone(),
                "--thread-id".to_owned(),
                thread_id.clone(),
                "--operation".to_owned(),
                "archive".to_owned(),
            ]
            .into_iter(),
        )
        .unwrap();
        assert!(
            task_thread_list(vec!["--database".to_owned(), database_path.clone()].into_iter())
                .unwrap()
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            task_thread_list(
                vec![
                    "--database".to_owned(),
                    database_path.clone(),
                    "--archived".to_owned()
                ]
                .into_iter()
            )
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
            1
        );

        task_thread_retention(
            vec![
                "--database".to_owned(),
                database_path.clone(),
                "--thread-id".to_owned(),
                thread_id.clone(),
                "--operation".to_owned(),
                "restore".to_owned(),
            ]
            .into_iter(),
        )
        .unwrap();
        assert_eq!(
            task_thread_list(vec!["--database".to_owned(), database_path.clone()].into_iter())
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );

        task_thread_retention(
            vec![
                "--database".to_owned(),
                database_path.clone(),
                "--thread-id".to_owned(),
                thread_id.clone(),
                "--operation".to_owned(),
                "delete".to_owned(),
            ]
            .into_iter(),
        )
        .unwrap();
        assert!(
            task_thread_get(
                vec![
                    "--database".to_owned(),
                    database_path.clone(),
                    "--thread-id".to_owned(),
                    thread_id
                ]
                .into_iter()
            )
            .is_err()
        );
        fs::remove_file(database).unwrap();
    }
}
