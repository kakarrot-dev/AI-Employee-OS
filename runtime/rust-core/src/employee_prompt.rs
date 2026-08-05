use rusqlite::Connection;
use serde_json::Value;

/// 从 Identity/Soul/Persona 编译 Effective Prompt。
/// `mission` / `responsibilities` / `boundaries` 不参与编译。
pub fn compile_effective_prompt(
    connection: &Connection,
    agent_id: &str,
) -> Result<(String, i64), String> {
    let value: (String, String, String, String, String, String, i64) = connection
        .query_row(
            "SELECT a.name,a.role,p.department,p.soul_json,p.base_prompt,
                    json_object('communication',json(pe.communication_json),'thinking',json(pe.thinking_json),'decision',json(pe.decision_json),'habit',json(pe.habit_json)),
                    p.config_version
             FROM agents a
             JOIN employee_profiles p ON p.agent_id=a.id
             JOIN personas pe ON pe.agent_id=a.id
             WHERE a.id=?1 AND a.status='active'",
            [agent_id],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                ))
            },
        )
        .map_err(|e| format!("employee unavailable: {e}"))?;

    let soul = format_soul(&value.3)?;
    let prompt = format!(
        "<identity>\n姓名：{}\n岗位：{}\n部门：{}\n\n{}\n</identity>\n<soul>\n{}\n</soul>\n<persona>{}</persona>\n闲聊不会执行 Skill 或 Tool；工作需先在仓库安装并绑定 Package。",
        value.0, value.1, value.2, value.4, soul, value.5
    );
    Ok((prompt, value.6))
}

/// 遗留列 mission：由身份提示词截断派生，满足 NOT NULL 与旧长度约束。
pub fn legacy_mission_from_base_prompt(base_prompt: &str) -> String {
    let trimmed = base_prompt.trim();
    let mut mission = String::new();
    for ch in trimmed.chars() {
        if mission.chars().count() >= 500 {
            break;
        }
        mission.push(ch);
    }
    if mission.is_empty() {
        "see base_prompt".to_owned()
    } else {
        mission
    }
}

fn format_soul(soul_json: &str) -> Result<String, String> {
    let value: Value =
        serde_json::from_str(soul_json).map_err(|e| format!("invalid soul_json: {e}"))?;
    let items = value
        .as_array()
        .ok_or_else(|| "soul_json must be an array".to_owned())?;
    let sections: Vec<&str> = items
        .iter()
        .filter_map(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .collect();
    if sections.is_empty() {
        return Err("soul must not be empty".to_owned());
    }
    Ok(sections.join("\n\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;
    use rusqlite::params;

    fn seed(connection: &Connection) {
        let stamp = "2026-01-01T00:00:00.000Z";
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','AI 产品经理','pkg','active',?1,?1)",
                [stamp],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO personas VALUES ('alex','{\"style\":\"structured\"}','{\"approach\":\"user_value_first\"}','{\"priorities\":[\"user_value\"]}','{\"output_format\":\"markdown\"}',?1,?1)",
                [stamp],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO employee_profiles (agent_id,department,mission,responsibilities_json,boundaries_json,soul_json,base_prompt,config_version,created_at,updated_at)
                 VALUES ('alex','产品部','旧使命文案',?1,?2,?3,?4,3,?5,?5)",
                params![
                    r#"["旧职责"]"#,
                    r#"["旧边界"]"#,
                    r#"["用户价值优先","结论可验收"]"#,
                    "身份提示词正文：负责需求分析。",
                    stamp,
                ],
            )
            .unwrap();
    }

    #[test]
    fn effective_prompt_uses_identity_and_soul_not_legacy_columns() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        seed(&connection);

        let (prompt, version) = compile_effective_prompt(&connection, "alex").unwrap();
        assert_eq!(version, 3);
        assert!(prompt.contains("身份提示词正文：负责需求分析。"));
        assert!(prompt.contains("用户价值优先"));
        assert!(prompt.contains("结论可验收"));
        assert!(prompt.contains("姓名：Alex"));
        assert!(prompt.contains("user_value_first"));
        assert!(!prompt.contains("旧使命文案"));
        assert!(!prompt.contains("旧职责"));
        assert!(!prompt.contains("旧边界"));
        assert!(!prompt.contains("<instructions>"));
        assert!(prompt.contains("工作需先在仓库安装并绑定 Package"));
    }

    #[test]
    fn legacy_mission_truncates_long_base_prompt() {
        let long = "测".repeat(600);
        let mission = legacy_mission_from_base_prompt(&long);
        assert_eq!(mission.chars().count(), 500);
    }
}
