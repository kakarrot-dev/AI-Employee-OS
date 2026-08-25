use std::{
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::PathBuf,
};

use rusqlite::{Connection, OptionalExtension};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn payload_root(connection: &Connection) -> Result<PathBuf, String> {
    let database: Option<String> = connection
        .query_row(
            "SELECT file FROM pragma_database_list WHERE name='main'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let root = database
        .filter(|path| !path.is_empty())
        .and_then(|path| PathBuf::from(path).parent().map(PathBuf::from))
        .unwrap_or_else(|| std::env::temp_dir().join("ai-employee-runtime-tests"))
        .join("protected-tool-payloads");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    Ok(root)
}

fn file_name(key: &str, value: &Value) -> Result<String, String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    let mut digest = Sha256::new();
    digest.update(key.as_bytes());
    digest.update([0]);
    digest.update(&bytes);
    Ok(format!("{:x}.json", digest.finalize()))
}

pub fn store(connection: &Connection, key: &str, value: &Value) -> Result<String, String> {
    let name = file_name(key, value)?;
    let path = payload_root(connection)?.join(&name);
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(&path)
        .map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    Ok(name)
}

pub fn load(connection: &Connection, reference: &str) -> Result<Value, String> {
    if reference.contains('/') || reference.contains('\\') || !reference.ends_with(".json") {
        return Err("protected_payload_ref_invalid".to_owned());
    }
    let path = payload_root(connection)?.join(reference);
    let bytes = fs::read(path).map_err(|_| "protected_payload_unavailable".to_owned())?;
    serde_json::from_slice(&bytes).map_err(|_| "protected_payload_invalid".to_owned())
}

pub fn remove(connection: &Connection, reference: &str) {
    if reference.contains('/') || reference.contains('\\') || !reference.ends_with(".json") {
        return;
    }
    if let Ok(root) = payload_root(connection) {
        let _ = fs::remove_file(root.join(reference));
    }
}

pub fn redact(value: &Value, sensitive_fields: &[String], prefix: &str) -> (Value, bool) {
    let mut redacted = value.clone();
    let mut changed = false;
    for field in sensitive_fields {
        let Some(relative) = field.strip_prefix(prefix) else {
            continue;
        };
        let path = relative.trim_start_matches('.');
        if path.is_empty() {
            continue;
        }
        let mut current = &mut redacted;
        let segments = path.split('.').collect::<Vec<_>>();
        for (index, segment) in segments.iter().enumerate() {
            if index + 1 == segments.len() {
                if let Some(object) = current.as_object_mut() {
                    if let Some(original) = object.get(*segment) {
                        let digest =
                            format!("{:x}", Sha256::digest(original.to_string().as_bytes()));
                        object.insert(
                            (*segment).to_owned(),
                            json!({"redacted":true,"sha256":digest}),
                        );
                        changed = true;
                    }
                }
            } else if let Some(next) = current.get_mut(*segment) {
                current = next;
            } else {
                break;
            }
        }
    }
    (redacted, changed)
}
