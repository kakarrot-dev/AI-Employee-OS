use rusqlite::{Connection, params};
use serde_json::{Map, Value};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpanKind {
    Task,
    Context,
    Model,
    Tool,
}

#[derive(Debug, PartialEq)]
pub struct Span {
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub kind: SpanKind,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub attributes: Value,
}

#[derive(Default)]
pub struct TraceCollector {
    spans: Vec<Span>,
}

impl TraceCollector {
    pub fn start(&mut self, mut span: Span) -> Result<(), String> {
        if self.spans.iter().any(|item| item.span_id == span.span_id) {
            return Err("duplicate span_id".to_owned());
        }
        if span.parent_span_id.as_ref().is_some_and(|parent| {
            !self
                .spans
                .iter()
                .any(|item| item.span_id == *parent && item.trace_id == span.trace_id)
        }) {
            return Err("parent span is missing from trace".to_owned());
        }
        span.attributes = sanitize(span.attributes);
        self.spans.push(span);
        Ok(())
    }

    pub fn spans(&self, trace_id: &str) -> Vec<&Span> {
        self.spans
            .iter()
            .filter(|span| span.trace_id == trace_id)
            .collect()
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct ExecutionLocation {
    pub trace_id: String,
    pub task_id: String,
    pub action_id: String,
    pub call_id: String,
}

pub fn locate_execution(
    connection: &Connection,
    trace_id: &str,
) -> Result<Vec<ExecutionLocation>, String> {
    let mut statement = connection
        .prepare(
            "SELECT e.trace_id, a.task_id, e.action_id, e.call_id
             FROM tool_executions e JOIN actions a ON a.id=e.action_id
             WHERE e.trace_id=?1 ORDER BY e.started_at, e.call_id",
        )
        .map_err(|error| error.to_string())?;
    statement
        .query_map(params![trace_id], |row| {
            Ok(ExecutionLocation {
                trace_id: row.get(0)?,
                task_id: row.get(1)?,
                action_id: row.get(2)?,
                call_id: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn sanitize(value: Value) -> Value {
    match value {
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| {
                    let lower = key.to_lowercase();
                    let value = if ["secret", "token", "api_key", "authorization"]
                        .iter()
                        .any(|marker| lower.contains(marker))
                    {
                        Value::String("[REDACTED]".to_owned())
                    } else {
                        sanitize(value)
                    };
                    (key, value)
                })
                .collect::<Map<_, _>>(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().take(50).map(sanitize).collect()),
        Value::String(value)
            if value.starts_with("Bearer ")
                || value.starts_with("sk-")
                || value.starts_with("poe-") =>
        {
            Value::String("[REDACTED]".to_owned())
        }
        Value::String(value) if value.chars().count() > 512 => {
            Value::String(format!("{}…", value.chars().take(512).collect::<String>()))
        }
        value => value,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trace_requires_valid_parent_and_redacts_secret_attributes() {
        let mut collector = TraceCollector::default();
        collector
            .start(Span {
                trace_id: "trace".into(),
                span_id: "root".into(),
                parent_span_id: None,
                kind: SpanKind::Task,
                started_at: "t".into(),
                finished_at: None,
                attributes: serde_json::json!({"api_key":"do-not-store","count":1}),
            })
            .unwrap();
        assert_eq!(
            collector.spans("trace")[0].attributes["api_key"],
            "[REDACTED]"
        );
        assert!(
            collector
                .start(Span {
                    trace_id: "trace".into(),
                    span_id: "orphan".into(),
                    parent_span_id: Some("missing".into()),
                    kind: SpanKind::Tool,
                    started_at: "t".into(),
                    finished_at: None,
                    attributes: serde_json::json!({})
                })
                .is_err()
        );
    }
}
