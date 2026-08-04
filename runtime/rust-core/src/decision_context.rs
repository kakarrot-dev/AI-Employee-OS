use std::collections::HashSet;

use serde::Serialize;
use sha2::{Digest, Sha256};

const SECTION_ORDER: [&str; 6] = [
    "identity",
    "persona",
    "skill",
    "memory",
    "knowledge",
    "tool",
];

#[derive(Clone, Debug, Serialize)]
pub struct PromptRef {
    pub id: String,
    pub version: String,
    pub sha256: String,
    pub content: String,
}

impl PromptRef {
    pub fn new(id: &str, version: &str, content: &str) -> Result<Self, String> {
        if id.is_empty()
            || id.chars().count() > 128
            || content.is_empty()
            || content.chars().count() > 3_000
            || !is_semver(version)
        {
            return Err("prompt identity, semver version, and content are required".into());
        }
        Ok(Self {
            id: id.into(),
            version: version.into(),
            sha256: hash(content),
            content: content.into(),
        })
    }
}

#[derive(Clone, Debug)]
pub struct ContextItem {
    pub id: String,
    pub content: String,
    pub content_hash: String,
    pub source_uri: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ContextSection {
    pub kind: String,
    pub trust: String,
    pub items: Vec<ContextItem>,
    pub max_items: usize,
}

#[derive(Debug, Serialize)]
pub struct DecisionContext {
    pub schema_version: &'static str,
    pub prompt: PromptRef,
    pub task: TaskContext,
    pub budget: ContextBudget,
    pub sections: Vec<SerializedSection>,
}

#[derive(Debug, Serialize)]
pub struct TaskContext {
    pub id: String,
    pub input: String,
}

#[derive(Debug, Serialize)]
pub struct ContextBudget {
    pub max_chars: usize,
    pub used_chars: usize,
}

#[derive(Debug, Serialize)]
pub struct SerializedSection {
    pub kind: String,
    pub trust: String,
    pub items: Vec<SerializedItem>,
}

#[derive(Debug, Serialize)]
pub struct SerializedItem {
    pub id: String,
    pub content: String,
    pub content_hash: String,
    pub source_uri: Option<String>,
}

pub fn assemble(
    task_id: &str,
    task_input: &str,
    prompt: PromptRef,
    mut sections: Vec<ContextSection>,
    max_chars: usize,
) -> Result<DecisionContext, String> {
    if task_id.is_empty()
        || task_id.chars().count() > 128
        || task_input.is_empty()
        || task_input.chars().count() > 2_000
    {
        return Err("task identity and input are invalid".into());
    }
    let mut seen = HashSet::new();
    for section in &sections {
        if !SECTION_ORDER.contains(&section.kind.as_str()) || !seen.insert(section.kind.as_str()) {
            return Err("context sections must be unique and typed".into());
        }
        if !matches!(section.trust.as_str(), "trusted" | "untrusted_data") {
            return Err("unknown context trust level".into());
        }
        if section.kind == "knowledge" && section.trust != "untrusted_data" {
            return Err("knowledge must be treated as untrusted data".into());
        }
    }
    sections.sort_by_key(|section| {
        SECTION_ORDER
            .iter()
            .position(|kind| *kind == section.kind)
            .unwrap()
    });
    let mut serialized_sections = Vec::with_capacity(sections.len());
    for section in sections {
        if section.items.len() > section.max_items {
            return Err(format!("{} section exceeds max_items", section.kind));
        }
        let mut items = Vec::with_capacity(section.items.len());
        for item in section.items {
            let uri_too_long = item
                .source_uri
                .as_ref()
                .is_some_and(|uri| uri.chars().count() > 512);
            if item.id.is_empty()
                || item.id.chars().count() > 128
                || item.content.is_empty()
                || item.content.chars().count() > 4_000
                || item.content_hash != content_hash(&item.content)
                || uri_too_long
                || (section.kind == "knowledge" && item.source_uri.is_none())
            {
                return Err("context item identity, content, or source is invalid".into());
            }
            items.push(SerializedItem {
                id: item.id,
                content_hash: item.content_hash,
                content: item.content,
                source_uri: item.source_uri,
            });
        }
        serialized_sections.push(SerializedSection {
            kind: section.kind,
            trust: section.trust,
            items,
        });
    }
    let used_chars = measured_chars(task_id, task_input, &prompt, &serialized_sections);
    if used_chars > max_chars {
        return Err(format!(
            "decision context exceeds budget: {used_chars}>{max_chars}"
        ));
    }
    Ok(DecisionContext {
        schema_version: "1.0",
        prompt,
        task: TaskContext {
            id: task_id.into(),
            input: task_input.into(),
        },
        budget: ContextBudget {
            max_chars,
            used_chars,
        },
        sections: serialized_sections,
    })
}

fn measured_chars(
    task_id: &str,
    task_input: &str,
    prompt: &PromptRef,
    sections: &[SerializedSection],
) -> usize {
    let mut total = "1.0".chars().count()
        + task_id.chars().count()
        + task_input.chars().count()
        + prompt.id.chars().count()
        + prompt.version.chars().count()
        + prompt.sha256.chars().count()
        + prompt.content.chars().count();
    for section in sections {
        total += section.kind.chars().count() + section.trust.chars().count();
        for item in &section.items {
            total += item.id.chars().count()
                + item.content.chars().count()
                + item.content_hash.chars().count()
                + item
                    .source_uri
                    .as_ref()
                    .map_or(0, |uri| uri.chars().count());
        }
    }
    total
}

fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

pub fn content_hash(value: &str) -> String {
    hash(value)
}

fn is_semver(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    parts.len() == 3 && parts.iter().all(|part| part.parse::<u64>().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_is_ordered_bounded_and_sourced() {
        let prompt = PromptRef::new("prd", "1.0.0", "instruction").unwrap();
        let context = assemble(
            "task_1",
            "prd",
            prompt,
            vec![
                ContextSection {
                    kind: "knowledge".into(),
                    trust: "untrusted_data".into(),
                    items: vec![ContextItem {
                        id: "source:0".into(),
                        content: "权限".into(),
                        content_hash: content_hash("权限"),
                        source_uri: Some("seed://interviews".into()),
                    }],
                    max_items: 1,
                },
                ContextSection {
                    kind: "memory".into(),
                    trust: "trusted".into(),
                    items: vec![ContextItem {
                        id: "memory_1".into(),
                        content: "商业价值".into(),
                        content_hash: content_hash("商业价值"),
                        source_uri: None,
                    }],
                    max_items: 1,
                },
            ],
            1_000,
        )
        .unwrap();
        assert_eq!(context.sections[0].kind, "memory");
        assert_eq!(
            context.sections[1].items[0].source_uri.as_deref(),
            Some("seed://interviews")
        );
        assert!(context.budget.used_chars <= context.budget.max_chars);
    }

    #[test]
    fn trusted_knowledge_fails_closed() {
        let result = assemble(
            "task",
            "input",
            PromptRef::new("prd", "1.0.0", "instruction").unwrap(),
            vec![ContextSection {
                kind: "knowledge".into(),
                trust: "trusted".into(),
                items: vec![],
                max_items: 1,
            }],
            10,
        );
        assert!(result.is_err());
    }

    #[test]
    fn over_budget_context_fails_instead_of_dropping_items() {
        let result = assemble(
            "task",
            "input",
            PromptRef::new("prd", "1.0.0", "instruction").unwrap(),
            vec![ContextSection {
                kind: "memory".into(),
                trust: "untrusted_data".into(),
                items: vec![ContextItem {
                    id: "memory".into(),
                    content: "x".repeat(200),
                    content_hash: content_hash(&"x".repeat(200)),
                    source_uri: None,
                }],
                max_items: 1,
            }],
            100,
        );
        assert!(result.unwrap_err().contains("exceeds budget"));
    }
}
