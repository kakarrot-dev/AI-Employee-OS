use std::{
    env, fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, ExitCode, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

const WAITING_APPROVAL_MESSAGE: &str = "执行已暂停，等待你批准所需权限。";

use ai_employee_runtime::agent::install_agent_package;
use ai_employee_runtime::employee_prompt::{
    compile_effective_prompt, legacy_mission_from_base_prompt,
};
use ai_employee_runtime::knowledge::{import_source, search as knowledge_search};
use ai_employee_runtime::memory::retrieve as retrieve_memory;
use ai_employee_runtime::recovery::reconcile_interrupted;
use ai_employee_runtime::run::{
    ContinueRunConfig, RunSkillConfig, continue_after_verified_action, continue_run as resume_run,
    continue_with_user_input, resolve_unknown_action, run_skill as execute_skill,
};
use ai_employee_runtime::skill_package::install_skill_package;
use ai_employee_runtime::skill_resolver::readiness as skill_readiness;
use ai_employee_runtime::storage::migrate;
use ai_employee_runtime::tool_package::install_tool_package;
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, types::Type};
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
        Some("chat-delete") => chat_delete(arguments),
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
        _ => Err(usage()),
    }
}

/// DeepSeek V4 Flash 官方人民币单价（CNY / million tokens）。
/// model_calls 尚未记录缓存命中拆分，因此输入统一按缓存未命中价保守估算。
/// Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
const USAGE_INPUT_CACHE_MISS_CNY_PER_MTOK: f64 = 1.0;
const USAGE_OUTPUT_CNY_PER_MTOK: f64 = 2.0;

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
            |row| row.get(0),
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
        "SELECT a.id,a.name,a.role,p.department,p.mission,p.responsibilities_json,p.boundaries_json,p.soul_json,
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
        "role":row.get::<_,String>(2)?, "department":row.get::<_,String>(3)?, "mission":row.get::<_,String>(4)?,
        "responsibilities":parse(5)?, "boundaries":parse(6)?, "soul":parse(7)?,
        "persona":{"communication":parse(8)?,"thinking":parse(9)?,"decision":parse(10)?,"habit":parse(11)?},
        "base_prompt":row.get::<_,String>(12)?, "status":row.get::<_,String>(13)?, "config_version":row.get::<_,i64>(14)?,
        "avatar_path":row.get::<_,Option<String>>(15)?
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

fn chat_delete(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut conversation_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|e| e.to_string())?;
    migrate(&mut connection).map_err(|e| e.to_string())?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
    let deleted = connection
        .execute("DELETE FROM conversations WHERE id=?1", [&conversation_id])
        .map_err(|e| e.to_string())?;
    Ok(json!({"schema_version":"1.0","conversation_id":conversation_id,"deleted":deleted > 0}))
}

fn chat_history(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut database = None;
    let mut conversation_id = None;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let mut connection =
        Connection::open(database.ok_or_else(usage)?).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    let conversation_id = conversation_id.ok_or_else(usage)?;
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
    tx.execute("INSERT INTO model_calls VALUES (?1,?2,?3,NULL,'deepseek','deepseek-v4-flash','running',NULL,NULL,NULL,?4,NULL)", rusqlite::params![call_id, conversation_id, user_id, stamp]).map_err(|e| e.to_string())?;
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
    let request = json!({"schema_version":"1.0","system_prompt":system_prompt,"messages":history,"stream":stream_events});
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
            .map_err(|_| "DeepSeek returned an invalid response".to_owned())?;
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
        return Err(format!("DeepSeek request failed: {code}"));
    }
    let content = payload
        .get("content")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or("DeepSeek returned empty content")?;
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
    skill_id: Option<String>,
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
    let skill_id = payload
        .get("skill_id")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let is_task = intent == "task" && confidence >= 0.55 && skill_id.is_some();
    Ok(IntentResult {
        intent,
        confidence,
        source,
        is_task,
        skill_id,
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
    let task_result = intent
        .skill_id
        .as_deref()
        .ok_or_else(|| "capability_not_found".to_owned())
        .and_then(|skill_id| {
            execute_skill(RunSkillConfig {
                connection,
                repository_root: root,
                python: Path::new("python3"),
                agent_id,
                skill_id,
                input: json!({"text":input}),
                conversation_id: Some(conversation_id),
            })
        });
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
                    COALESCE(json_group_array(json_object(
                      'step_id', COALESCE(json_extract(a.input_json,'$.step_id'), json_extract(a.input_json,'$.action'), substr(a.id, instr(a.id, ':') + 1)),
                      'action_id', a.id,
                      'status', a.status,
                      'output_as', COALESCE(json_extract(a.input_json,'$.output_as'), '')
                    )) FILTER (WHERE a.id IS NOT NULL), '[]'),
                    (SELECT json_extract(output_json,'$.path') FROM actions
                     WHERE task_id=t.id AND json_type(output_json,'$.path')='text'
                     ORDER BY created_at DESC LIMIT 1),
                    (SELECT score FROM evaluations WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1),
                    (SELECT json_extract(metrics_json,'$.delivery_allowed') FROM evaluations
                     WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1),
                    COALESCE((SELECT json_group_array(json_object(
                      'schema_version','1.0', 'event_id',event_id, 'sequence',sequence,
                      'task_id',task_id, 'type',event_type, 'occurred_at',occurred_at
                    )) FROM runtime_events WHERE task_id=t.id ORDER BY sequence), '[]'),
                    EXISTS(SELECT 1 FROM task_cancellation_requests c
                           WHERE c.task_id=t.id AND c.acknowledged_at IS NULL)
                    ,(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT phase FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT waiting_reason FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT stop_reason FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT title FROM deliverables WHERE task_id=t.id AND status='verified' ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT status FROM deliverables WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT uri FROM artifacts WHERE task_id=t.id AND verification_status='verified' ORDER BY created_at DESC LIMIT 1)
                    ,(SELECT json_extract(snapshot_json,'$.conversation_id') FROM run_snapshots
                      WHERE run_id=(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                        AND snapshot_type='context' LIMIT 1)
                    ,(SELECT json_extract(snapshot_json,'$.id') FROM run_snapshots
                      WHERE run_id=(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                        AND snapshot_type='skill' LIMIT 1)
                    ,(SELECT json_extract(snapshot_json,'$.version') FROM run_snapshots
                      WHERE run_id=(SELECT id FROM agent_runs WHERE task_id=t.id ORDER BY created_at DESC LIMIT 1)
                        AND snapshot_type='skill' LIMIT 1)
             FROM tasks t LEFT JOIN actions a ON a.task_id=t.id
             GROUP BY t.id ORDER BY t.created_at DESC, t.id DESC",
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
            "SELECT count(*) FROM actions WHERE task_id=?1 AND status IN ('running','result_unknown')",
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
    "usage: ai-employee-runtime employees-list|employee-save|employee-delete|effective-prompt|capabilities|capability-readiness|skills-list|tools-list|install-tool|install-skill|bind-skill|unbind-skill|knowledge-import|knowledge-search|chat-history|chat-send|chat-delete|run-task|run-skill|run-status|continue-run|resolve-action-result|list-tasks|usage-summary|cancel-task|events".to_owned()
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
        "pricing_source": "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
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
        return continue_with_user_input(
            &mut connection,
            &repository_root,
            &python,
            &run_id,
            serde_json::from_str(&input).map_err(|_| "input_schema_invalid".to_owned())?,
        );
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
    Ok(result)
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
            return continue_after_verified_action(
                &mut connection,
                &root,
                &python,
                run_id,
                evidence,
            );
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
                "INSERT INTO tasks VALUES ('task','alex','input','running','t','t')",
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
}
