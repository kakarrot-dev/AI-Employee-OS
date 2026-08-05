use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, ExitCode, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

use ai_employee_runtime::agent::install_agent_package;
use ai_employee_runtime::employee_prompt::{
    compile_effective_prompt, legacy_mission_from_base_prompt,
};
use ai_employee_runtime::golden_path::{GoldenPathConfig, run as run_golden_path};
use ai_employee_runtime::knowledge::{import_source, search as knowledge_search};
use ai_employee_runtime::skill_package::install_skill_package;
use ai_employee_runtime::storage::migrate;
use ai_employee_runtime::tool_package::install_tool_package;
use rusqlite::{Connection, TransactionBehavior, types::Type};
use serde_json::json;
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
        Some("list-tasks") => list_tasks(arguments),
        Some("cancel-task") => cancel_task(arguments),
        Some("events") => list_events(arguments),
        _ => Err(usage()),
    }
}

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

fn ensure_alex(connection: &mut Connection, root: &std::path::Path) -> Result<(), String> {
    let stamp = now();
    bootstrap_packages(connection, root, &stamp)?;
    let installed: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM agents WHERE id='ai-product-manager')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !installed {
        install_agent_package(
            connection,
            &root.join("packages/agents/ai-product-manager"),
            &stamp,
        )
        .map_err(|error| format!("could not install Alex: {error:?}"))?;
    }
    let alex_identity = "把模糊需求转化为可执行的产品方案。\n\n职责：需求分析、产品方案、可评审文档。\n\n边界：不虚构缺失事实；没有授权时不执行外部操作。\n\n可靠、直接地协助用户完成产品工作。闲聊不会执行 Skill 或 Tool；工作能力在绑定仓库 Package 后接通。";
    connection.execute(
        "INSERT OR IGNORE INTO employee_profiles (agent_id,department,mission,responsibilities_json,boundaries_json,soul_json,base_prompt,config_version,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,1,?8,?8)",
        rusqlite::params![
            "ai-product-manager",
            "产品部",
            legacy_mission_from_base_prompt(alex_identity),
            json!([]).to_string(),
            json!([]).to_string(),
            json!(["用户价值优先", "区分事实、推测与未知", "结论必须可执行和可验收"]).to_string(),
            alex_identity,
            stamp
        ],
    ).map_err(|error| error.to_string())?;
    // Skill 未随仓库/Bundle 提供时不阻断员工列表与对话；有包再绑定。
    let _ = bind_skill(
        connection,
        "ai-product-manager",
        "prd-generation",
        "1.0.0",
        &stamp,
    );
    let _ = bind_skill(
        connection,
        "ai-product-manager",
        "requirement-analysis",
        "1.0.0",
        &stamp,
    );
    Ok(())
}

fn bootstrap_packages(
    connection: &mut Connection,
    root: &std::path::Path,
    stamp: &str,
) -> Result<(), String> {
    let tools = [
        root.join("packages/tools/file-tool"),
        root.join("packages/tools/document-tool"),
    ];
    for path in tools {
        if path.join("manifest.yaml").is_file() {
            install_tool_package(connection, &path, stamp)
                .map_err(|error| format!("tool install failed at {}: {error:?}", path.display()))?;
        }
    }
    let skills = [
        root.join("packages/skills/requirement-analysis"),
        root.join("packages/skills/prd-generation"),
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
        ensure_alex(&mut connection, &root)?;
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
                JOIN skills s ON s.id = ash.skill_id AND s.status='active'
                WHERE ash.agent_id='ai-product-manager' AND ash.enabled=1
            ) AND EXISTS(SELECT 1 FROM tools WHERE status='active')",
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
        ensure_alex(&mut connection, &root)?;
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
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "name": row.get::<_, String>(1)?,
        "version": row.get::<_, String>(2)?,
        "status": row.get::<_, String>(3)?,
        "path": row.get::<_, String>(4)?,
        "summary": description,
        "category": category,
        "available": true
    }))
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
    if let Some(root) = repository_root {
        ensure_alex(&mut connection, &root)?;
    }
    let mut statement = connection
        .prepare(
            "SELECT id, name, type, version, status, manifest_json FROM tools WHERE status='active' ORDER BY lower(name)",
        )
        .map_err(|e| e.to_string())?;
    let tools = statement
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
                "available": true
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(json!({"schema_version":"1.0","tools":tools}))
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
        ensure_alex(&mut connection, &root)?;
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
    let referenced: bool = connection.query_row("SELECT EXISTS(SELECT 1 FROM conversations WHERE agent_id=?1 UNION SELECT 1 FROM tasks WHERE agent_id=?1)", [&id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if referenced || id == "ai-product-manager" {
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
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--conversation-id" => conversation_id = arguments.next(),
            "--employee-id" => agent_id = arguments.next(),
            "--input" => input = arguments.next(),
            _ => return Err(usage()),
        }
    }
    let root = repository_root.ok_or_else(usage)?;
    let database_path = database.ok_or_else(usage)?;
    let mut connection = Connection::open(&database_path).map_err(|error| error.to_string())?;
    migrate(&mut connection).map_err(|error| error.to_string())?;
    ensure_alex(&mut connection, &root)?;
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
    if message_count >= 80 {
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
    let user_sequence: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM messages WHERE conversation_id=?1",
            [&conversation_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let tx = connection
        .transaction()
        .map_err(|error| error.to_string())?;
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

    let tasks_enabled = tasks_enabled(&connection)?;
    let intent = classify_user_intent(&root, &input)?;
    if intent.is_task && tasks_enabled {
        return complete_chat_as_task(
            &mut connection,
            &root,
            &database_path,
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
    let request = json!({"schema_version":"1.0","system_prompt":system_prompt,"messages":history});
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
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "DeepSeek returned an invalid response".to_owned())?;
    if !output.status.success() {
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

#[derive(Clone)]
struct IntentResult {
    intent: String,
    confidence: f64,
    source: String,
    is_task: bool,
}

fn tasks_enabled(connection: &Connection) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM agent_skills ash
                JOIN skills s ON s.id = ash.skill_id AND s.status='active'
                WHERE ash.agent_id='ai-product-manager' AND ash.enabled=1
            ) AND EXISTS(SELECT 1 FROM tools WHERE status='active')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
}

fn classify_user_intent(root: &Path, text: &str) -> Result<IntentResult, String> {
    let worker_root = root.join("runtime/python-agent");
    let request = json!({"schema_version":"1.0","text":text,"use_llm":true});
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
    let is_task = intent == "task" && confidence >= 0.55;
    Ok(IntentResult {
        intent,
        confidence,
        source,
        is_task,
    })
}

fn complete_chat_as_task(
    connection: &mut Connection,
    root: &Path,
    database: &Path,
    conversation_id: &str,
    agent_id: &str,
    config_version: i64,
    call_id: &str,
    input: &str,
    user_sequence: i64,
    nonce: u128,
    intent: &IntentResult,
) -> Result<serde_json::Value, String> {
    let output_dir = root.join("outputs");
    fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    let task_id = format!("task_chat_{nonce}");
    let task_result = run_golden_path(&GoldenPathConfig {
        repository_root: root.to_path_buf(),
        database: database.to_path_buf(),
        output_dir,
        python: PathBuf::from("python3"),
        task_input: input.to_owned(),
        task_id: Some(task_id.clone()),
        approve_write: true,
    });
    let completed = now();
    let (content, status, artifact, task_id_out) = match task_result {
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
                .unwrap_or(&task_id)
                .to_owned();
            let body = if artifact.is_empty() {
                format!("已按工作执行（状态：{status}）。可在右侧工作检查器查看进度。")
            } else {
                format!(
                    "已按工作执行（状态：{status}）。\n交付物：`{artifact}`\n可在工作检查器查看步骤与评估。"
                )
            };
            (body, status.to_owned(), artifact.to_owned(), tid)
        }
        Err(error) => (
            format!("识别到工作意图并尝试执行，但失败：{error}"),
            "failed".to_owned(),
            String::new(),
            task_id,
        ),
    };
    let assistant_id = format!("msg_assistant_{nonce}");
    // Re-open connection may be needed if golden_path held the db; we still have &mut connection
    // but golden_path opened its own connection on the same file — OK for SQLite.
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
    let model_status = if status == "succeeded" {
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
            if status == "succeeded" {
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
        "artifact_path": if artifact.is_empty() { serde_json::Value::Null } else { json!(artifact) },
        "message":{"id":assistant_id,"role":"assistant","content":content,"created_at":completed}
    }))
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
                      'step_id', COALESCE(json_extract(a.input_json,'$.step_id'), substr(a.id, instr(a.id, ':') + 1)),
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
                "input": row.get::<_, String>(2)?,
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
                "cancellation_requested": row.get::<_, bool>(11)?
            }))
        })
        .map_err(|error| error.to_string())?;
    let tasks = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","tasks":tasks}))
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
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(json!({"schema_version":"1.0","task_id":task_id,"status":"cancellation_requested"}))
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
    "usage: ai-employee-runtime employees-list|employee-save|employee-delete|effective-prompt|capabilities|skills-list|tools-list|install-tool|install-skill|bind-skill|unbind-skill|knowledge-import|knowledge-search|chat-history|chat-send|chat-delete|run-task|list-tasks|cancel-task|events".to_owned()
}

fn run_task(mut arguments: impl Iterator<Item = String>) -> Result<serde_json::Value, String> {
    let mut repository_root = None;
    let mut database = None;
    let mut output_dir = None;
    let mut python = PathBuf::from("python3");
    let mut task_input = None;
    let mut task_id = None;
    let mut approve_write = false;
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--repository-root" => repository_root = arguments.next().map(PathBuf::from),
            "--database" => database = arguments.next().map(PathBuf::from),
            "--output-dir" => output_dir = arguments.next().map(PathBuf::from),
            "--python" => python = arguments.next().map(PathBuf::from).ok_or_else(usage)?,
            "--input" => task_input = arguments.next(),
            "--task-id" => task_id = arguments.next(),
            "--approve-write" => approve_write = true,
            _ => return Err(usage()),
        }
    }
    run_golden_path(&GoldenPathConfig {
        repository_root: repository_root.ok_or_else(usage)?,
        database: database.ok_or_else(usage)?,
        output_dir: output_dir.ok_or_else(usage)?,
        python,
        task_input: task_input.ok_or_else(usage)?,
        task_id,
        approve_write,
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
