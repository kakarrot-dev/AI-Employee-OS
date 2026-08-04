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
}

#[derive(Debug, Eq, PartialEq)]
pub enum CandidateOutcome {
    Stored,
    Duplicate(String),
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
    save_memory(
        connection,
        candidate.id,
        candidate.owner_type,
        candidate.owner_id,
        candidate.memory_type,
        candidate.content,
        candidate.importance,
        candidate.confidence,
        now,
    )?;
    Ok(CandidateOutcome::Stored)
}

fn contains_sensitive_material(content: &str) -> bool {
    let normalized = content.to_ascii_lowercase();
    [
        "api_key",
        "api key",
        "access_token",
        "bearer ",
        "private key",
        "sk-",
        "sk_",
        "cookie=",
    ]
    .iter()
    .any(|marker| normalized.contains(marker))
}

pub fn save_memory(
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
        save_memory(
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
        assert!(
            save_memory(
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
            conflicts_with_id: Some("m1"),
            ..candidate()
        };
        assert!(store_candidate(&c, conflict, "2026-08-04T00:00:03Z").is_err());
    }
}
