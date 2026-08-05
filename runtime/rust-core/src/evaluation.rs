use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Deserialize;
use serde_json::json;

pub const DELIVERY_THRESHOLD: f64 = 0.8;

#[derive(Debug, Deserialize)]
pub struct PrdRubric {
    pub evidence_traceable: bool,
    pub user_value_clear: bool,
    pub measurable_goal: bool,
    pub scope_clear: bool,
    pub recovery_flow: bool,
    pub permission_boundary: bool,
    pub testable_acceptance: bool,
    pub unknowns_not_fabricated: bool,
}

#[derive(Debug, PartialEq)]
pub struct EvaluationOutcome {
    pub score: f64,
    pub delivery_allowed: bool,
    pub failed_items: Vec<&'static str>,
}

pub fn evaluate_prd(rubric: &PrdRubric) -> EvaluationOutcome {
    let checks = [
        ("evidence_traceable", rubric.evidence_traceable),
        ("user_value_clear", rubric.user_value_clear),
        ("measurable_goal", rubric.measurable_goal),
        ("scope_clear", rubric.scope_clear),
        ("recovery_flow", rubric.recovery_flow),
        ("permission_boundary", rubric.permission_boundary),
        ("testable_acceptance", rubric.testable_acceptance),
        ("unknowns_not_fabricated", rubric.unknowns_not_fabricated),
    ];
    let passed = checks.iter().filter(|(_, passed)| *passed).count();
    let score = passed as f64 / checks.len() as f64;
    EvaluationOutcome {
        score,
        delivery_allowed: score >= DELIVERY_THRESHOLD,
        failed_items: checks
            .iter()
            .filter_map(|(name, passed)| (!passed).then_some(*name))
            .collect(),
    }
}

pub fn evaluate_prd_content(content: &str) -> EvaluationOutcome {
    let contains = |needles: &[&str]| needles.iter().all(|needle| content.contains(needle));
    evaluate_prd(&PrdRubric {
        evidence_traceable: contains(&["## 1.", "来源"]),
        user_value_clear: contains(&["## 2.", "用户价值"]),
        measurable_goal: contains(&["## 3."])
            && ["%", "天", "小时", "分钟", "秒", "个"]
                .iter()
                .any(|unit| content.contains(unit)),
        scope_clear: contains(&["## 4.", "范围", "非范围"]),
        recovery_flow: contains(&["## 5.", "正常"]) && contains(&["## 7.", "异常", "恢复"]),
        permission_boundary: contains(&["## 6.", "权限", "数据边界"]),
        testable_acceptance: contains(&["## 8.", "Given", "When", "Then"]),
        unknowns_not_fabricated: contains(&["## 9.", "待确认"]),
    })
}

pub fn persist_evaluation(
    connection: &mut Connection,
    id: &str,
    task_id: &str,
    agent_id: &str,
    outcome: &EvaluationOutcome,
    now: &str,
) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    persist_evaluation_in(&transaction, id, task_id, agent_id, outcome, now)?;
    transaction.commit().map_err(|error| error.to_string())
}

pub fn persist_evaluation_in(
    transaction: &Transaction<'_>,
    id: &str,
    task_id: &str,
    agent_id: &str,
    outcome: &EvaluationOutcome,
    now: &str,
) -> Result<(), String> {
    let owner: Option<String> = transaction
        .query_row("SELECT agent_id FROM tasks WHERE id=?1", [task_id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?;
    if owner.as_deref() != Some(agent_id) {
        return Err("task and evaluation agent do not match".to_owned());
    }
    transaction
        .execute(
            "INSERT INTO evaluations VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                id,
                task_id,
                agent_id,
                outcome.score,
                json!({
                    "delivery_allowed": outcome.delivery_allowed,
                    "failed_items": outcome.failed_items
                })
                .to_string(),
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO metrics VALUES (?1,?2,?3,'prd_quality_score',?4,?5)",
            params![
                format!("metric_{id}"),
                task_id,
                agent_id,
                outcome.score,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn record_feedback(
    connection: &Connection,
    id: &str,
    task_id: &str,
    rating: u8,
    comment: Option<&str>,
    now: &str,
) -> Result<(), String> {
    if !(1..=5).contains(&rating) {
        return Err("feedback rating must be between 1 and 5".to_owned());
    }
    let comment = comment.map(str::trim).filter(|value| !value.is_empty());
    if comment.is_some_and(|value| value.len() > 2000) {
        return Err("feedback comment exceeds 2000 bytes".to_owned());
    }
    connection
        .execute(
            "INSERT INTO feedbacks VALUES (?1,?2,?3,?4,?5)",
            params![id, task_id, i64::from(rating), comment, now],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::migrate;

    #[derive(Deserialize)]
    struct EvalCase {
        category: String,
    }

    fn complete() -> PrdRubric {
        PrdRubric {
            evidence_traceable: true,
            user_value_clear: true,
            measurable_goal: true,
            scope_clear: true,
            recovery_flow: true,
            permission_boundary: true,
            testable_acceptance: true,
            unknowns_not_fabricated: true,
        }
    }

    #[test]
    fn blocks_delivery_below_the_rubric_threshold() {
        let mut rubric = complete();
        rubric.evidence_traceable = false;
        rubric.unknowns_not_fabricated = false;
        let outcome = evaluate_prd(&rubric);
        assert_eq!(outcome.score, 0.75);
        assert!(!outcome.delivery_allowed);
    }

    #[test]
    fn persists_quality_metric_and_validates_feedback() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection.execute("INSERT INTO agents VALUES ('alex','Alex','ai_product_manager','package','active','t','t')", []).unwrap();
        connection
            .execute(
                "INSERT INTO tasks VALUES ('task','alex','input','running','t','t')",
                [],
            )
            .unwrap();
        persist_evaluation(
            &mut connection,
            "eval",
            "task",
            "alex",
            &evaluate_prd(&complete()),
            "t",
        )
        .unwrap();
        assert!(record_feedback(&connection, "feedback", "task", 5, Some(" useful "), "t").is_ok());
        assert!(record_feedback(&connection, "bad", "task", 0, None, "t").is_err());
    }
}
