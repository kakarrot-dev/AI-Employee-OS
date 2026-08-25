use rusqlite::{Connection, params};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq)]
pub struct SkillReadiness {
    pub skill_id: String,
    pub readiness: &'static str,
    pub reasons: Vec<String>,
}

pub fn readiness(connection: &Connection, agent_id: &str) -> Result<Vec<SkillReadiness>, String> {
    readiness_with_tool_probe(
        connection,
        agent_id,
        crate::runtime_dependency::tool_available,
    )
}

pub fn readiness_with_tool_probe(
    connection: &Connection,
    agent_id: &str,
    tool_available: impl Fn(&str) -> bool,
) -> Result<Vec<SkillReadiness>, String> {
    let agent_status: String = connection
        .query_row("SELECT status FROM agents WHERE id=?1", [agent_id], |row| {
            row.get(0)
        })
        .map_err(|_| "agent_unavailable".to_owned())?;
    let mut statement=connection.prepare("SELECT s.id,s.status,s.manifest_json,a.enabled FROM skills s LEFT JOIN agent_skills a ON a.skill_id=s.id AND a.agent_id=?1 ORDER BY s.id").map_err(|e|e.to_string())?;
    statement
        .query_map([agent_id], |row| {
            let id: String = row.get(0)?;
            let status: String = row.get(1)?;
            let raw: String = row.get(2)?;
            let enabled: Option<i64> = row.get(3)?;
            let manifest: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
            let mut reasons = Vec::new();
            if agent_status != "active" {
                reasons.push("agent_inactive".to_owned());
            }
            if enabled != Some(1) {
                reasons.push("skill_unbound".to_owned());
            }
            if status != "active" {
                reasons.push("skill_disabled".to_owned());
            }
            if manifest["schema_version"] != "2.0.0" {
                reasons.push("runtime_incompatible".to_owned());
            }
            if agent_status == "active"
                && enabled == Some(1)
                && status == "active"
                && manifest["schema_version"] == "2.0.0"
            {
                for tool in manifest["skill"]["tools"].as_array().into_iter().flatten() {
                    let tool_id = tool["id"].as_str().unwrap_or_default();
                    let installed: bool = connection
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM tools WHERE id=?1 AND status='active')",
                            [tool_id],
                            |r| r.get(0),
                        )
                        .unwrap_or(false);
                    if !installed {
                        reasons.push(format!("tool_missing:{tool_id}"));
                    } else if !tool_available(tool_id) {
                        reasons.push(format!("tool_unavailable:{tool_id}"));
                    }
                }
            }
            let readiness = if reasons.is_empty() {
                "ready"
            } else if reasons
                .iter()
                .any(|r| r == "skill_unbound" || r == "skill_disabled")
            {
                "disabled"
            } else if reasons.iter().any(|r| r == "runtime_incompatible") {
                "incompatible"
            } else {
                "missing_dependency"
            };
            Ok(SkillReadiness {
                skill_id: id,
                readiness,
                reasons,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn resolve(connection: &Connection, agent_id: &str, input: &str) -> Result<String, String> {
    let ready = readiness(connection, agent_id)?;
    let mut matches = Vec::new();
    for item in ready.into_iter().filter(|item| item.readiness == "ready") {
        let raw: String = connection
            .query_row(
                "SELECT manifest_json FROM skills WHERE id=?1",
                params![item.skill_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let manifest: Value =
            serde_json::from_str(&raw).map_err(|_| "package_invalid".to_owned())?;
        let hit = manifest["skill"]["routing"]["triggers"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .any(|trigger| input.to_lowercase().contains(&trigger.to_lowercase()));
        if hit {
            matches.push(item.skill_id);
        }
    }
    match matches.as_slice() {
        [one] => Ok(one.clone()),
        [] => Err("capability_not_found".to_owned()),
        _ => Err("skill_selection_ambiguous".to_owned()),
    }
}

pub fn ready_skill_ids(connection: &Connection, agent_id: &str) -> Result<Vec<String>, String> {
    ready_skill_ids_with_tool_probe(
        connection,
        agent_id,
        crate::runtime_dependency::tool_available,
    )
}

pub fn ready_skill_ids_with_tool_probe(
    connection: &Connection,
    agent_id: &str,
    tool_available: impl Fn(&str) -> bool,
) -> Result<Vec<String>, String> {
    Ok(
        readiness_with_tool_probe(connection, agent_id, tool_available)?
            .into_iter()
            .filter(|item| item.readiness == "ready")
            .map(|item| item.skill_id)
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn capability_fixture() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::storage::migrate(&mut connection).unwrap();
        connection
            .execute_batch(
                "INSERT INTO agents VALUES ('researcher','Researcher','Researcher','test','active','t','t');
                 INSERT INTO tools VALUES ('agent-reach-tool','Agent Reach','native','1.0.0','{}','active','t','t');
                 INSERT INTO skills VALUES (
                   'web-search','Web Search','1.0.0',
                   '{\"schema_version\":\"2.0.0\",\"skill\":{\"tools\":[{\"id\":\"agent-reach-tool\"}]}}',
                   'test','active','t','t'
                 );
                 INSERT INTO agent_skills VALUES ('researcher','web-search',1,'t');",
            )
            .unwrap();
        connection
    }

    #[test]
    fn no_candidate_is_explicit() {
        let mut c = Connection::open_in_memory().unwrap();
        crate::storage::migrate(&mut c).unwrap();
        assert_eq!(readiness(&c, "missing").unwrap_err(), "agent_unavailable");
    }

    #[test]
    fn runtime_tool_dependency_controls_skill_readiness() {
        let connection = capability_fixture();

        let unavailable = readiness_with_tool_probe(&connection, "researcher", |_| false).unwrap();
        assert_eq!(unavailable[0].readiness, "missing_dependency");
        assert_eq!(
            unavailable[0].reasons,
            vec!["tool_unavailable:agent-reach-tool"]
        );

        let ready = readiness_with_tool_probe(&connection, "researcher", |_| true).unwrap();
        assert_eq!(ready[0].readiness, "ready");
        assert!(ready[0].reasons.is_empty());
    }
}
