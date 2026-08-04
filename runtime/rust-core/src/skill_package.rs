use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

pub fn install_skill_package(
    connection: &Connection,
    path: &Path,
    now: &str,
) -> Result<(), String> {
    let raw = fs::read_to_string(path.join("manifest.yaml")).map_err(|e| e.to_string())?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&raw).map_err(|e| e.to_string())?;
    let manifest = serde_json::to_value(yaml).map_err(|e| e.to_string())?;
    if manifest["schema_version"] != "1.0.0" {
        return Err("unsupported schema_version".into());
    }
    let skill = &manifest["skill"];
    let id = text(skill, "id")?;
    let name = text(skill, "name")?;
    let version = text(skill, "version")?;
    validate_dag(&skill["workflow"]["steps"])?;
    for dependency in skill["required_tools"]
        .as_array()
        .ok_or("required_tools must be array")?
    {
        let tool_id = text(dependency, "id")?;
        let snapshot: Option<String> = connection
            .query_row(
                "SELECT manifest_json FROM tools WHERE id=?1 AND status='active'",
                [tool_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let tool: Value =
            serde_json::from_str(&snapshot.ok_or_else(|| format!("missing tool {tool_id}"))?)
                .map_err(|e| e.to_string())?;
        let installed_version = text(&tool["tool"], "version")?;
        let version_range = text(dependency, "version")?;
        if version_range == ">=1.0.0 <2.0.0" && !installed_version.starts_with("1.") {
            return Err(format!(
                "incompatible tool version {tool_id}@{installed_version}"
            ));
        }
        let declared_permissions: HashSet<&str> = dependency["permissions"]
            .as_array()
            .ok_or("permissions must be array")?
            .iter()
            .filter_map(Value::as_str)
            .collect();
        let actions: HashSet<&str> = tool["tool"]["actions"]
            .as_array()
            .ok_or("tool actions missing")?
            .iter()
            .filter_map(|a| a["name"].as_str())
            .collect();
        for action in dependency["actions"]
            .as_array()
            .ok_or("actions must be array")?
            .iter()
            .filter_map(Value::as_str)
        {
            if !actions.contains(action) {
                return Err(format!("missing action {tool_id}.{action}"));
            }
            let tool_action = tool["tool"]["actions"]
                .as_array()
                .unwrap()
                .iter()
                .find(|item| item["name"] == action)
                .unwrap();
            let required_permissions: HashSet<&str> = tool_action["required_permissions"]
                .as_array()
                .ok_or("required_permissions missing")?
                .iter()
                .filter_map(Value::as_str)
                .collect();
            if !required_permissions.is_subset(&declared_permissions) {
                return Err(format!("permissions do not cover {tool_id}.{action}"));
            }
        }
    }
    connection.execute(
        "INSERT INTO skills VALUES (?1,?2,?3,?4,?5,'active',?6,?6)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,
         manifest_json=excluded.manifest_json,path=excluded.path,status='active',updated_at=excluded.updated_at",
        params![id,name,version,manifest.to_string(),path.to_string_lossy(),now]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| format!("missing {key}"))
}
fn validate_dag(steps: &Value) -> Result<(), String> {
    let steps = steps.as_array().ok_or("steps must be array")?;
    let mut deps: HashMap<&str, HashSet<&str>> = HashMap::new();
    for s in steps {
        deps.insert(
            text(s, "id")?,
            s["depends_on"]
                .as_array()
                .ok_or("depends_on")?
                .iter()
                .filter_map(Value::as_str)
                .collect(),
        );
    }
    let known: HashSet<&str> = deps.keys().copied().collect();
    if deps.values().any(|d| !d.is_subset(&known)) {
        return Err("unknown dependency".into());
    }
    let mut done = HashSet::new();
    loop {
        let before = done.len();
        for (id, d) in &deps {
            if d.is_subset(&done) {
                done.insert(*id);
            }
        }
        if done.len() == deps.len() {
            return Ok(());
        }
        if done.len() == before {
            return Err("cyclic workflow".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{storage::migrate, tool_package::install_tool_package};
    #[test]
    fn installs_real_skills_after_tool_validation() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages");
        install_tool_package(
            &c,
            &root.join("tools/document-tool"),
            "2026-08-04T00:00:00Z",
        )
        .unwrap();
        for s in ["requirement-analysis", "prd-generation"] {
            install_skill_package(&c, &root.join("skills").join(s), "2026-08-04T00:00:00Z")
                .unwrap();
        }
        let n: i64 = c
            .query_row("SELECT count(*) FROM skills", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 2);
    }
}
