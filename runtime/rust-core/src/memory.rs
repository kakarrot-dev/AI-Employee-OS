use rusqlite::{Connection, OptionalExtension, params};

pub struct MemoryCandidate<'a> {
    pub id: &'a str,
    pub owner_type: &'a str,
    pub owner_id: &'a str,
    pub memory_type: &'a str,
    pub content: &'a str,
    pub importance: f64,
    pub confidence: f64,
    pub stable: bool,
    pub future_value: bool,
    pub conflicts_with_id: Option<&'a str>,
    pub task_id: &'a str,
    pub trace_id: &'a str,
    pub extractor_version: &'a str,
}

#[derive(Debug, Eq, PartialEq)]
pub enum CandidateOutcome {
    Stored,
    Duplicate(String),
}

#[derive(Debug, PartialEq)]
pub struct MemoryHit {
    pub id: String,
    pub memory_type: String,
    pub content: String,
    pub importance: f64,
    pub confidence: f64,
    pub trust: String,
}

pub fn retrieve(
    connection: &Connection,
    owner_type: &str,
    owner_id: &str,
    limit: usize,
) -> Result<Vec<MemoryHit>, String> {
    if limit == 0 || !matches!(owner_type, "user" | "agent" | "company") {
        return Ok(vec![]);
    }
    let mut statement = connection
        .prepare(
            "SELECT m.id,m.memory_type,m.content,m.importance,m.confidence,
                    COALESCE(p.trust,'untrusted_data')
             FROM memories m LEFT JOIN memory_provenance p ON p.memory_id=m.id
             WHERE m.owner_type=?1 AND m.owner_id=?2 AND (
               (m.owner_type='agent' AND EXISTS(
                 SELECT 1 FROM agents a WHERE a.id=m.owner_id AND a.status='active'
               )) OR
               (m.owner_type IN ('user','company') AND EXISTS(
                 SELECT 1 FROM subjects s
                 WHERE s.type=m.owner_type AND s.id=m.owner_id AND s.status='active'
               ))
             )
             ORDER BY m.importance DESC,m.confidence DESC,m.updated_at DESC,m.id ASC LIMIT ?3",
        )
        .map_err(|error| error.to_string())?;
    statement
        .query_map(params![owner_type, owner_id, limit as i64], |row| {
            Ok(MemoryHit {
                id: row.get(0)?,
                memory_type: row.get(1)?,
                content: row.get(2)?,
                importance: row.get(3)?,
                confidence: row.get(4)?,
                trust: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn store_candidate(
    connection: &Connection,
    candidate: MemoryCandidate<'_>,
    now: &str,
) -> Result<CandidateOutcome, String> {
    if !matches!(
        candidate.memory_type,
        "preference" | "experience" | "decision"
    ) {
        return Err("memory type is not eligible for automatic extraction".into());
    }
    if !candidate.stable || !candidate.future_value || candidate.confidence < 0.7 {
        return Err("candidate does not meet stability, value, or confidence gate".into());
    }
    if contains_sensitive_material(candidate.content) {
        return Err("candidate contains sensitive material".into());
    }
    if candidate.conflicts_with_id.is_some() {
        return Err("memory conflict requires explicit resolution".into());
    }
    if candidate.task_id.is_empty()
        || candidate.trace_id.is_empty()
        || candidate.extractor_version.is_empty()
    {
        return Err("memory candidate provenance is required".into());
    }
    let task_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?1)",
            [candidate.task_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !task_exists {
        return Err("memory candidate task provenance does not exist".into());
    }
    let duplicate: Option<String> = connection
        .query_row(
            "SELECT id FROM memories WHERE owner_type=?1 AND owner_id=?2 AND memory_type=?3 AND content=?4 LIMIT 1",
            params![candidate.owner_type,candidate.owner_id,candidate.memory_type,candidate.content],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some(id) = duplicate {
        return Ok(CandidateOutcome::Duplicate(id));
    }
    let conflict: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM memories
             WHERE owner_type=?1 AND owner_id=?2 AND memory_type=?3 AND content<>?4)",
            params![
                candidate.owner_type,
                candidate.owner_id,
                candidate.memory_type,
                candidate.content
            ],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if conflict {
        return Err("memory conflict requires explicit resolution".into());
    }
    ensure_active_owner(connection, candidate.owner_type, candidate.owner_id)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO memories VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
            params![
                candidate.id,
                candidate.owner_type,
                candidate.owner_id,
                candidate.memory_type,
                candidate.content,
                candidate.importance,
                candidate.confidence,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO memory_provenance VALUES (?1,?2,?3,?4,'untrusted_data',?5)",
            params![
                candidate.id,
                candidate.task_id,
                candidate.trace_id,
                candidate.extractor_version,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(CandidateOutcome::Stored)
}

fn contains_sensitive_material(content: &str) -> bool {
    let normalized: String = content
        .chars()
        .filter(|character| {
            !matches!(
                *character,
                '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{feff}'
            )
        })
        .flat_map(char::to_lowercase)
        .collect();
    [
        "api_key",
        "api key",
        "access_token",
        "bearer ",
        "private key",
        "sk-",
        "sk_",
        "cookie=",
        "password=",
        "password:",
        "ghp_",
        "github_pat_",
        "akia",
        "xoxb-",
        "xoxp-",
        "-----begin",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

pub(crate) fn save_untrusted_memory(
    connection: &Connection,
    id: &str,
    owner_type: &str,
    owner_id: &str,
    memory_type: &str,
    content: &str,
    importance: f64,
    confidence: f64,
    now: &str,
) -> Result<(), String> {
    ensure_active_owner(connection, owner_type, owner_id)?;
    connection
        .execute(
            "INSERT INTO memories VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)",
            params![
                id,
                owner_type,
                owner_id,
                memory_type,
                content,
                importance,
                confidence,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_active_owner(
    connection: &Connection,
    owner_type: &str,
    owner_id: &str,
) -> Result<(), String> {
    let exists: bool = if owner_type == "agent" {
        connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM agents WHERE id=?1 AND status='active')",
            [owner_id],
            |r| r.get(0),
        )
    } else if matches!(owner_type, "user" | "company") {
        connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM subjects WHERE type=?1 AND id=?2 AND status='active')",
            params![owner_type, owner_id],
            |r| r.get(0),
        )
    } else {
        return Err("unknown owner_type".into());
    }
    .map_err(|e| e.to_string())?;
    if !exists {
        return Err("memory owner does not exist or is disabled".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;
    #[test]
    fn validates_polymorphic_owner() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c.execute(
            "INSERT INTO subjects VALUES ('local-user','user','Local User','active',?1,?1)",
            ["2026-08-04T00:00:00Z"],
        )
        .unwrap();
        c.execute(
            "INSERT INTO agents VALUES ('agent_1','Alex','PM','/agent','active',?1,?1)",
            ["2026-08-04T00:00:00Z"],
        )
        .unwrap();
        c.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task_1','agent_1','test','running',?1,?1)",
            ["2026-08-04T00:00:00Z"],
        )
        .unwrap();
        save_untrusted_memory(
            &c,
            "m1",
            "user",
            "local-user",
            "preference",
            "PRD 必须说明商业价值",
            0.9,
            0.9,
            "2026-08-04T00:00:00Z",
        )
        .unwrap();
        assert_eq!(
            retrieve(&c, "user", "local-user", 1).unwrap()[0].trust,
            "untrusted_data"
        );
        assert!(
            save_untrusted_memory(
                &c,
                "m2",
                "company",
                "missing",
                "decision",
                "x",
                0.5,
                0.5,
                "2026-08-04T00:00:00Z"
            )
            .is_err()
        );
    }

    #[test]
    fn candidate_gate_stores_deduplicates_and_rejects_sensitive_content() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c.execute(
            "INSERT INTO subjects VALUES ('local-user','user','Local User','active',?1,?1)",
            ["2026-08-04T00:00:00Z"],
        )
        .unwrap();
        c.execute(
            "INSERT INTO agents VALUES ('agent_1','Alex','PM','/agent','active',?1,?1)",
            ["2026-08-04T00:00:00Z"],
        )
        .unwrap();
        c.execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at) VALUES ('task_1','agent_1','test','running',?1,?1)",
            ["2026-08-04T00:00:00Z"],
        )
        .unwrap();
        let candidate = || MemoryCandidate {
            id: "m1",
            owner_type: "user",
            owner_id: "local-user",
            memory_type: "preference",
            content: "PRD 必须说明商业价值",
            importance: 0.9,
            confidence: 0.9,
            stable: true,
            future_value: true,
            conflicts_with_id: None,
            task_id: "task_1",
            trace_id: "trace_1",
            extractor_version: "memory-rules/1.0.0",
        };
        assert_eq!(
            store_candidate(&c, candidate(), "2026-08-04T00:00:00Z").unwrap(),
            CandidateOutcome::Stored
        );
        assert_eq!(
            store_candidate(&c, candidate(), "2026-08-04T00:00:01Z").unwrap(),
            CandidateOutcome::Duplicate("m1".into())
        );
        let secret = MemoryCandidate {
            content: "API_KEY=sk-secret",
            ..candidate()
        };
        assert!(store_candidate(&c, secret, "2026-08-04T00:00:02Z").is_err());
        let conflict = MemoryCandidate {
            content: "PRD 不需要商业价值",
            conflicts_with_id: None,
            ..candidate()
        };
        assert!(store_candidate(&c, conflict, "2026-08-04T00:00:03Z").is_err());
        let hits = retrieve(&c, "user", "local-user", 1).unwrap();
        assert_eq!(hits[0].id, "m1");
        assert_eq!(hits[0].memory_type, "preference");
        assert_eq!(hits[0].trust, "untrusted_data");
        for content in [
            "password=hunter2",
            "ghp_abcdefghijklmnopqrstuvwxyz",
            "AKIAIOSFODNN7EXAMPLE",
            "A\u{200b}PI_KEY=secret",
        ] {
            let secret = MemoryCandidate {
                content,
                ..candidate()
            };
            assert!(store_candidate(&c, secret, "2026-08-04T00:00:04Z").is_err());
        }
        c.execute(
            "UPDATE subjects SET status='disabled' WHERE id='local-user'",
            [],
        )
        .unwrap();
        assert!(retrieve(&c, "user", "local-user", 1).unwrap().is_empty());
    }
}
