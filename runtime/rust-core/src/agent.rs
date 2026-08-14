use std::{fs, path::Path};

use rusqlite::{Connection, params};
use serde::Deserialize;

const SUPPORTED_SCHEMA_VERSION: &str = "1.0.0";

#[derive(Debug)]
pub enum AgentError {
    Io(std::io::Error),
    Manifest(serde_yaml::Error),
    Persona(serde_yaml::Error),
    Json(serde_json::Error),
    Database(rusqlite::Error),
    UnsupportedSchemaVersion(String),
    InvalidId(String),
    InvalidStatus(String),
}

impl From<std::io::Error> for AgentError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<rusqlite::Error> for AgentError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value)
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AgentPackageManifest {
    schema_version: String,
    agent: AgentManifest,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AgentManifest {
    id: String,
    version: String,
    name: String,
    role: String,
    description: String,
    status: String,
    persona: String,
    skills: Vec<PackageDependency>,
    tools: Vec<PackageDependency>,
    memory_enabled: bool,
    evaluation_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PackageDependency {
    id: String,
    version: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PersonaManifest {
    communication: serde_yaml::Value,
    thinking: serde_yaml::Value,
    decision: serde_yaml::Value,
    habit: serde_yaml::Value,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub role: String,
    pub package_path: String,
    pub status: String,
}

pub fn install_agent_package(
    connection: &mut Connection,
    package_path: &Path,
    now: &str,
) -> Result<AgentRecord, AgentError> {
    let raw_manifest = fs::read_to_string(package_path.join("manifest.yaml"))?;
    let package: AgentPackageManifest =
        serde_yaml::from_str(&raw_manifest).map_err(AgentError::Manifest)?;
    if package.schema_version != SUPPORTED_SCHEMA_VERSION {
        return Err(AgentError::UnsupportedSchemaVersion(package.schema_version));
    }
    validate_agent_id(&package.agent.id)?;
    if !matches!(package.agent.status.as_str(), "active" | "disabled") {
        return Err(AgentError::InvalidStatus(package.agent.status));
    }

    let raw_persona = fs::read_to_string(package_path.join(&package.agent.persona))?;
    let persona: PersonaManifest =
        serde_yaml::from_str(&raw_persona).map_err(AgentError::Persona)?;
    let communication_json = yaml_value_to_json(&persona.communication)?;
    let thinking_json = yaml_value_to_json(&persona.thinking)?;
    let decision_json = yaml_value_to_json(&persona.decision)?;
    let habit_json = yaml_value_to_json(&persona.habit)?;

    // Touch all frozen package declarations during validation; installation of the
    // referenced packages is handled by their own loaders in later phases.
    validate_dependencies(&package.agent.skills)?;
    validate_dependencies(&package.agent.tools)?;
    let _package_metadata = (
        &package.agent.version,
        &package.agent.description,
        package.agent.memory_enabled,
        package.agent.evaluation_enabled,
    );

    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO agents (id, name, role, package_path, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           role = excluded.role,
           package_path = excluded.package_path,
           updated_at = excluded.updated_at",
        params![
            package.agent.id,
            package.agent.name,
            package.agent.role,
            package_path.to_string_lossy(),
            package.agent.status,
            now
        ],
    )?;
    transaction.execute(
        "INSERT INTO personas (
           agent_id, communication_json, thinking_json, decision_json, habit_json, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(agent_id) DO UPDATE SET
           communication_json = excluded.communication_json,
           thinking_json = excluded.thinking_json,
           decision_json = excluded.decision_json,
           habit_json = excluded.habit_json,
           updated_at = excluded.updated_at",
        params![
            package.agent.id,
            communication_json,
            thinking_json,
            decision_json,
            habit_json,
            now
        ],
    )?;
    transaction.commit()?;

    get_agent(connection, &package.agent.id).map_err(AgentError::Database)
}

fn validate_agent_id(id: &str) -> Result<(), AgentError> {
    if id.trim().is_empty() || id.starts_with("system:") {
        return Err(AgentError::InvalidId(id.to_owned()));
    }
    Ok(())
}

fn yaml_value_to_json(value: &serde_yaml::Value) -> Result<String, AgentError> {
    serde_json::to_string(value).map_err(AgentError::Json)
}

fn validate_dependencies(dependencies: &[PackageDependency]) -> Result<(), AgentError> {
    for dependency in dependencies {
        if dependency.id.trim().is_empty() || dependency.version.trim().is_empty() {
            return Err(AgentError::InvalidStatus(
                "package dependency id and version must not be empty".to_owned(),
            ));
        }
    }
    Ok(())
}

pub fn get_agent(connection: &Connection, id: &str) -> rusqlite::Result<AgentRecord> {
    connection.query_row(
        "SELECT id, name, role, package_path, status FROM agents WHERE id = ?1",
        [id],
        |row| {
            Ok(AgentRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                package_path: row.get(3)?,
                status: row.get(4)?,
            })
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;

    #[test]
    fn installs_alex_and_persona_from_the_real_package() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let package_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/agents/ai-product-manager");

        let agent =
            install_agent_package(&mut connection, &package_path, "2026-08-04T00:00:00Z").unwrap();

        assert_eq!(agent.id, "ai-product-manager");
        assert_eq!(agent.name, "Alex");
        assert_eq!(agent.status, "active");
        let persona_count: i64 = connection
            .query_row("SELECT count(*) FROM personas", [], |row| row.get(0))
            .unwrap();
        assert_eq!(persona_count, 1);
    }

    #[test]
    fn reinstall_preserves_existing_agent_status() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let package_path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/agents/ai-product-manager");

        install_agent_package(&mut connection, &package_path, "2026-08-04T00:00:00Z").unwrap();
        connection
            .execute(
                "UPDATE agents SET status = 'disabled' WHERE id = 'ai-product-manager'",
                [],
            )
            .unwrap();

        let agent =
            install_agent_package(&mut connection, &package_path, "2026-08-04T00:00:01Z").unwrap();
        assert_eq!(agent.status, "disabled");
    }

    #[test]
    fn rejects_the_reserved_system_agent_namespace() {
        assert!(matches!(
            validate_agent_id("system:historical-employee"),
            Err(AgentError::InvalidId(id)) if id == "system:historical-employee"
        ));
    }
}
