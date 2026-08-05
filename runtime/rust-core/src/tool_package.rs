use std::{fs, path::Path};

use rusqlite::{Connection, params};
use serde_json::Value;

#[derive(Debug)]
pub enum ToolPackageError {
    Io(std::io::Error),
    Yaml(serde_yaml::Error),
    Json(serde_json::Error),
    Database(rusqlite::Error),
    InvalidManifest(String),
}

impl From<std::io::Error> for ToolPackageError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}
impl From<rusqlite::Error> for ToolPackageError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value)
    }
}

pub fn install_tool_package(
    connection: &Connection,
    package_path: &Path,
    now: &str,
) -> Result<(), ToolPackageError> {
    let raw = fs::read_to_string(package_path.join("manifest.yaml"))?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&raw).map_err(ToolPackageError::Yaml)?;
    let manifest = serde_json::to_value(yaml).map_err(ToolPackageError::Json)?;
    validate_manifest(&manifest)?;
    let tool = &manifest["tool"];
    connection.execute(
        "INSERT INTO tools (id, name, type, version, manifest_json, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, type = excluded.type, version = excluded.version,
           manifest_json = excluded.manifest_json, status = excluded.status,
           updated_at = excluded.updated_at",
        params![
            string(tool, "id")?,
            string(tool, "name")?,
            string(tool, "type")?,
            string(tool, "version")?,
            manifest.to_string(),
            now
        ],
    )?;
    Ok(())
}

fn string<'a>(value: &'a Value, field: &str) -> Result<&'a str, ToolPackageError> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| ToolPackageError::InvalidManifest(format!("missing {field}")))
}

fn validate_manifest(manifest: &Value) -> Result<(), ToolPackageError> {
    if manifest.get("schema_version").and_then(Value::as_str) != Some("1.0.0") {
        return Err(ToolPackageError::InvalidManifest(
            "unsupported schema_version".to_owned(),
        ));
    }
    let tool = manifest
        .get("tool")
        .ok_or_else(|| ToolPackageError::InvalidManifest("missing tool".to_owned()))?;
    for field in ["id", "name", "version", "type", "runtime", "entrypoint"] {
        string(tool, field)?;
    }
    if string(tool, "type")? != "native" || string(tool, "runtime")? != "rust-native-v1" {
        return Err(ToolPackageError::InvalidManifest(
            "unregistered runtime".to_owned(),
        ));
    }
    let actions = tool
        .get("actions")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty())
        .ok_or_else(|| ToolPackageError::InvalidManifest("actions must not be empty".to_owned()))?;
    for action in actions {
        string(action, "name")?;
        for field in ["input_schema", "output_schema"] {
            if !action.get(field).is_some_and(Value::is_object) {
                return Err(ToolPackageError::InvalidManifest(format!(
                    "missing {field}"
                )));
            }
        }
        let risk = action
            .get("risk_level")
            .and_then(Value::as_u64)
            .ok_or_else(|| ToolPackageError::InvalidManifest("missing risk_level".to_owned()))?;
        let confirmation = string(action, "confirmation")?;
        if risk > 3 || (risk >= 2 && confirmation == "never") {
            return Err(ToolPackageError::InvalidManifest(
                "invalid risk policy".to_owned(),
            ));
        }
        let attempts = action
            .pointer("/retry_policy/max_attempts")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let idempotency = string(action, "idempotency")?;
        let side_effect = string(action, "side_effect")?;
        if attempts == 0
            || (attempts > 1 && (idempotency == "unsafe" || side_effect == "irreversible"))
        {
            return Err(ToolPackageError::InvalidManifest(
                "invalid retry policy".to_owned(),
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;

    #[test]
    fn installs_real_file_and_document_packages() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/tools");
        for package in ["file-tool", "document-tool"] {
            install_tool_package(&connection, &root.join(package), "2026-08-04T00:00:00Z").unwrap();
        }
        let count: i64 = connection
            .query_row("SELECT count(*) FROM tools", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
}
