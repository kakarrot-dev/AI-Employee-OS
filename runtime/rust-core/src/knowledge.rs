use rusqlite::{Connection, OptionalExtension, params};
use sha2::{Digest, Sha256};

#[derive(Debug, PartialEq)]
pub struct SearchHit {
    pub source_id: String,
    pub title: String,
    pub chunk_index: i64,
    pub content: String,
    pub score: f64,
}

pub fn import_source(
    connection: &mut Connection,
    id: &str,
    uri: &str,
    source_type: &str,
    title: &str,
    content: &str,
    now: &str,
) -> Result<bool, String> {
    let hash = sha256(content);
    let existing: Option<(String, String)> = connection
        .query_row(
            "SELECT id, content_hash FROM knowledge_sources WHERE uri=?1",
            [uri],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if let Some((existing_id, _)) = &existing
        && existing_id != id
    {
        return Err(format!(
            "knowledge source URI {uri} already belongs to source {existing_id}"
        ));
    }
    if existing.as_ref().map(|(_, hash)| hash.as_str()) == Some(&hash) {
        return Ok(false);
    }
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO knowledge_sources VALUES (?1,?2,?3,?4,?5,'indexed',?6,?6) ON CONFLICT(uri) DO UPDATE SET title=excluded.title,content_hash=excluded.content_hash,index_status='indexed',updated_at=excluded.updated_at",params![id,uri,source_type,title,hash,now]).map_err(|e|e.to_string())?;
    tx.execute("DELETE FROM knowledge_chunks WHERE source_id=?1", [id])
        .map_err(|e| e.to_string())?;
    for (index, chunk) in chunks(content, 1200).into_iter().enumerate() {
        tx.execute(
            "INSERT INTO knowledge_chunks VALUES (?1,?2,?3,?4,?5,NULL,?6)",
            params![
                format!("{id}:{index}"),
                id,
                index as i64,
                chunk,
                sha256(chunk),
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(true)
}
pub fn search(
    connection: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|s| s.to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if terms.is_empty() || limit == 0 {
        return Ok(vec![]);
    }
    let mut stmt=connection.prepare("SELECT c.source_id,s.title,c.chunk_index,c.content FROM knowledge_chunks c JOIN knowledge_sources s ON s.id=c.source_id WHERE s.index_status='indexed'").map_err(|e|e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut hits = vec![];
    for row in rows {
        let (source_id, title, chunk_index, content) = row.map_err(|e| e.to_string())?;
        let lower = content.to_lowercase();
        let matched = terms.iter().filter(|t| lower.contains(t.as_str())).count();
        if matched > 0 {
            hits.push(SearchHit {
                source_id,
                title,
                chunk_index,
                content,
                score: matched as f64 / terms.len() as f64,
            });
        }
    }
    hits.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(a.source_id.cmp(&b.source_id))
            .then(a.chunk_index.cmp(&b.chunk_index))
    });
    hits.truncate(limit);
    Ok(hits)
}
fn sha256(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn chunks(content: &str, max: usize) -> Vec<&str> {
    if content.is_empty() {
        return vec![];
    }
    let mut out = vec![];
    let mut start = 0;
    for (i, _) in content.char_indices() {
        if i - start >= max {
            out.push(&content[start..i]);
            start = i;
        }
    }
    out.push(&content[start..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;
    #[test]
    fn imports_idempotently_and_returns_sourced_hits() {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        assert!(
            import_source(
                &mut c,
                "s1",
                "seed://interviews",
                "seed_document",
                "访谈",
                "企业用户需要权限隔离和可追溯引用",
                "2026-08-04T00:00:00Z"
            )
            .unwrap()
        );
        assert!(
            !import_source(
                &mut c,
                "s1",
                "seed://interviews",
                "seed_document",
                "访谈",
                "企业用户需要权限隔离和可追溯引用",
                "2026-08-04T00:00:01Z"
            )
            .unwrap()
        );
        let h = search(&c, "权限 引用", 5).unwrap();
        assert_eq!(h.len(), 1);
        assert_eq!(h[0].source_id, "s1");
        assert_eq!(h[0].score, 1.0);
    }
}
