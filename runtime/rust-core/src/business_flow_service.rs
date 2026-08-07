use std::collections::BTreeSet;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::Serialize;

use crate::business_flow::{ScenarioProposal, ValidatedScenario};

#[derive(Debug, Serialize)]
pub struct ScenarioSummary {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub current_version: i64,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct SavedScenario {
    pub id: String,
    pub version_id: String,
    pub version: i64,
    pub source: String,
    pub sha256: String,
    pub definition: ScenarioProposal,
    pub confirmed_at: String,
}

#[derive(Debug, Serialize)]
pub struct BusinessFlowProjection {
    pub schema_version: &'static str,
    pub business_flow_id: String,
    pub root_task_id: String,
    pub scenario_id: String,
    pub scenario_version_id: String,
    pub scenario_sha256: String,
    pub title: String,
    pub objective: String,
    pub status: String,
    pub root_deliverable_id: Option<String>,
    pub work_orders: Vec<WorkOrderProjection>,
}

#[derive(Debug, Serialize)]
pub struct WorkOrderProjection {
    pub id: String,
    pub node_id: String,
    pub child_task_id: String,
    pub assignee_agent_id: String,
    pub role: String,
    pub goal: String,
    pub status: String,
    pub revision: i64,
    pub run_id: Option<String>,
    pub run_phase: Option<String>,
    pub action_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HandoffRecord {
    pub id: String,
    pub business_flow_id: String,
    pub source_work_order_id: String,
    pub target_work_order_id: String,
    pub deliverable_id: String,
    pub acceptance: String,
    pub summary: String,
}

pub fn validate_scenario(
    connection: &Connection,
    proposal: ScenarioProposal,
) -> Result<ValidatedScenario, String> {
    let validated = proposal.validate()?;
    for node in &validated.proposal.nodes {
        if !node.input_refs.is_empty() {
            return Err("shared_context_forbidden".into());
        }
        let status: Option<String> = connection
            .query_row(
                "SELECT status FROM agents WHERE id=?1",
                [&node.suggested_agent_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if status.as_deref() != Some("active") {
            return Err(format!("assignee_unavailable:{}", node.suggested_agent_id));
        }
        for capability in &node.required_capabilities {
            let ready: bool = connection
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM agent_skills binding
                       JOIN skills skill ON skill.id=binding.skill_id
                       WHERE binding.agent_id=?1 AND binding.skill_id=?2
                         AND binding.enabled=1 AND skill.status='active'
                     )",
                    params![node.suggested_agent_id, capability],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            if !ready {
                return Err(format!(
                    "assignee_not_ready:{}:{}",
                    node.suggested_agent_id, capability
                ));
            }
        }
    }
    Ok(validated)
}

pub fn save_scenario(
    connection: &mut Connection,
    scenario_id: &str,
    source: &str,
    proposal: ScenarioProposal,
    confirmed_at: &str,
) -> Result<SavedScenario, String> {
    if !matches!(source, "manual" | "ai_proposal") {
        return Err("scenario_source_invalid".into());
    }
    if scenario_id.trim().is_empty() {
        return Err("scenario_id_required".into());
    }
    let validated = validate_scenario(connection, proposal)?;
    let definition_json =
        serde_json::to_string(&validated.proposal).map_err(|_| "scenario_serialization_failed")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    let existing: Option<(i64, String)> = transaction
        .query_row(
            "SELECT current_version,status FROM scenario_definitions WHERE id=?1",
            [scenario_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let version = existing.as_ref().map_or(1, |(current, _)| current + 1);
    if existing
        .as_ref()
        .is_some_and(|(_, status)| status == "disabled")
    {
        return Err("scenario_disabled".into());
    }
    let existing_version: Option<(String, i64, String, String)> = transaction
        .query_row(
            "SELECT id,version,source,confirmed_at FROM scenario_versions
             WHERE scenario_definition_id=?1 AND sha256=?2",
            params![scenario_id, validated.proposal_hash],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some((version_id, version, existing_source, existing_confirmed_at)) = existing_version {
        return Ok(SavedScenario {
            id: scenario_id.to_owned(),
            version_id,
            version,
            source: existing_source,
            sha256: validated.proposal_hash,
            definition: validated.proposal,
            confirmed_at: existing_confirmed_at,
        });
    }

    if existing.is_none() {
        transaction
            .execute(
                "INSERT INTO scenario_definitions(id,title,description,status,current_version,created_at,updated_at)
                 VALUES (?1,?2,'','active',1,?3,?3)",
                params![scenario_id, validated.proposal.title, confirmed_at],
            )
            .map_err(|error| error.to_string())?;
    }
    let version_id = format!("{scenario_id}:v{version}");
    transaction
        .execute(
            "INSERT INTO scenario_versions(id,scenario_definition_id,version,source,definition_json,sha256,model_config_json,confirmed_at,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,?7)",
            params![version_id, scenario_id, version, source, definition_json, validated.proposal_hash, confirmed_at],
        )
        .map_err(|error| error.to_string())?;
    for (position, node) in validated.proposal.nodes.iter().enumerate() {
        let node_id = format!("{version_id}:{}", node.node_id);
        transaction
            .execute(
                "INSERT INTO scenario_nodes(id,scenario_version_id,node_key,role,goal,assignee_agent_id,required_capabilities_json,input_refs_json,acceptance_json,budget_json,failure_policy,position)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![
                    node_id,
                    version_id,
                    node.node_id,
                    serde_json::to_value(node.role).unwrap().as_str().unwrap(),
                    node.goal,
                    node.suggested_agent_id,
                    serde_json::to_string(&node.required_capabilities).unwrap(),
                    serde_json::to_string(&node.input_refs).unwrap(),
                    serde_json::to_string(&node.acceptance_criteria).unwrap(),
                    serde_json::to_string(&node.budget).unwrap(),
                    serde_json::to_value(node.failure_policy).unwrap().as_str().unwrap(),
                    position as i64,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    for edge in &validated.proposal.edges {
        transaction
            .execute(
                "INSERT INTO scenario_edges(scenario_version_id,predecessor_node_id,successor_node_id,required,created_at)
                 VALUES (?1,?2,?3,?4,?5)",
                params![
                    version_id,
                    format!("{version_id}:{}", edge.predecessor_node_id),
                    format!("{version_id}:{}", edge.successor_node_id),
                    edge.required,
                    confirmed_at,
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "UPDATE scenario_definitions SET title=?1,current_version=?2,updated_at=?3 WHERE id=?4",
            params![validated.proposal.title, version, confirmed_at, scenario_id],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(SavedScenario {
        id: scenario_id.to_owned(),
        version_id,
        version,
        source: source.to_owned(),
        sha256: validated.proposal_hash,
        definition: validated.proposal,
        confirmed_at: confirmed_at.to_owned(),
    })
}

pub fn list_scenarios(connection: &Connection) -> Result<Vec<ScenarioSummary>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id,title,description,status,current_version,updated_at
             FROM scenario_definitions ORDER BY updated_at DESC,id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(ScenarioSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                status: row.get(3)?,
                current_version: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn get_scenario(connection: &Connection, scenario_id: &str) -> Result<SavedScenario, String> {
    let row: Option<(String, i64, String, String, String, String)> = connection
        .query_row(
            "SELECT version.id,version.version,version.source,version.sha256,version.definition_json,version.confirmed_at
             FROM scenario_definitions definition
             JOIN scenario_versions version ON version.scenario_definition_id=definition.id AND version.version=definition.current_version
             WHERE definition.id=?1",
            [scenario_id],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?)),
        )
        .optional().map_err(|error| error.to_string())?;
    let (version_id, version, source, sha256, definition_json, confirmed_at) =
        row.ok_or_else(|| "scenario_not_found".to_owned())?;
    Ok(SavedScenario {
        id: scenario_id.to_owned(),
        version_id,
        version,
        source,
        sha256,
        definition: serde_json::from_str(&definition_json)
            .map_err(|_| "scenario_definition_corrupt")?,
        confirmed_at,
    })
}

pub fn disable_scenario(
    connection: &Connection,
    scenario_id: &str,
    now: &str,
) -> Result<(), String> {
    let updated = connection.execute(
        "UPDATE scenario_definitions SET status='disabled',updated_at=?1 WHERE id=?2 AND status='active'",
        params![now, scenario_id],
    ).map_err(|error| error.to_string())?;
    if updated != 1 {
        return Err("scenario_not_found_or_disabled".into());
    }
    Ok(())
}

pub fn start_business_flow(
    connection: &mut Connection,
    flow_id: &str,
    scenario_id: &str,
    plan_hash: &str,
    now: &str,
) -> Result<BusinessFlowProjection, String> {
    if flow_id.trim().is_empty() {
        return Err("business_flow_id_required".into());
    }
    let already_exists: Option<(String, String)> = connection
        .query_row(
            "SELECT scenario_definition_id,scenario_sha256 FROM business_flows WHERE id=?1",
            [flow_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if let Some((existing_scenario_id, existing_hash)) = already_exists {
        if existing_scenario_id != scenario_id || existing_hash != plan_hash {
            return Err("flow_revision_conflict".into());
        }
        return project_business_flow(connection, flow_id);
    }
    let status: Option<String> = connection
        .query_row(
            "SELECT status FROM scenario_definitions WHERE id=?1",
            [scenario_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    if status.as_deref() != Some("active") {
        return Err("scenario_not_active".into());
    }
    let saved = get_scenario(connection, scenario_id)?;
    if saved.sha256 != plan_hash {
        return Err("plan_hash_stale".into());
    }
    let validated = validate_scenario(connection, saved.definition.clone())?;
    let root_task_id = format!("{flow_id}:root");
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at,parent_task_id)
             VALUES (?1,?2,?3,'pending',?4,?4,NULL)",
            params![
                root_task_id,
                validated.proposal.coordinator_agent_id,
                serde_json::json!({"objective":validated.proposal.objective,"scenario_version_id":saved.version_id}).to_string(),
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO business_flows(id,root_task_id,scenario_definition_id,scenario_version_id,scenario_sha256,title,objective,acceptance_json,budget_json,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)",
            params![
                flow_id,
                root_task_id,
                scenario_id,
                saved.version_id,
                saved.sha256,
                validated.proposal.title,
                validated.proposal.objective,
                serde_json::to_string(&validated.proposal.overall_acceptance_criteria).unwrap(),
                serde_json::to_string(&validated.proposal.nodes.iter().map(|node| &node.budget).collect::<Vec<_>>()).unwrap(),
                now
            ],
        )
        .map_err(|error| error.to_string())?;

    let mut participants = BTreeSet::new();
    for node in &validated.proposal.nodes {
        participants.insert(node.suggested_agent_id.clone());
        let child_task_id = format!("{flow_id}:task:{}", node.node_id);
        let work_order_id = format!("{flow_id}:work:{}", node.node_id);
        let scenario_node_id = format!("{}:{}", saved.version_id, node.node_id);
        let role = serde_json::to_value(node.role).unwrap();
        let failure_policy = serde_json::to_value(node.failure_policy).unwrap();
        transaction
            .execute(
                "INSERT INTO tasks(id,agent_id,input,status,created_at,updated_at,parent_task_id)
                 VALUES (?1,?2,?3,'pending',?4,?4,?5)",
                params![
                    child_task_id,
                    node.suggested_agent_id,
                    serde_json::json!({"goal":node.goal,"input_refs":node.input_refs}).to_string(),
                    now,
                    root_task_id
                ],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO work_orders(id,business_flow_id,scenario_node_id,child_task_id,assignee_agent_id,role,goal,input_refs_json,acceptance_json,required_capabilities_json,budget_json,failure_policy,revision,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,1,?13,?13)",
                params![
                    work_order_id,
                    flow_id,
                    scenario_node_id,
                    child_task_id,
                    node.suggested_agent_id,
                    role.as_str().unwrap(),
                    node.goal,
                    serde_json::to_string(&node.input_refs).unwrap(),
                    serde_json::to_string(&node.acceptance_criteria).unwrap(),
                    serde_json::to_string(&node.required_capabilities).unwrap(),
                    serde_json::to_string(&node.budget).unwrap(),
                    failure_policy.as_str().unwrap(),
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    for agent_id in participants {
        let role = if agent_id == validated.proposal.coordinator_agent_id {
            "coordinator"
        } else {
            "executor"
        };
        transaction
            .execute(
                "INSERT INTO business_flow_participants VALUES (?1,?2,?3,?4)",
                params![flow_id, agent_id, role, now],
            )
            .map_err(|error| error.to_string())?;
    }
    for edge in &validated.proposal.edges {
        transaction
            .execute(
                "INSERT INTO work_order_dependencies VALUES (?1,?2,?3,?4,?5)",
                params![
                    flow_id,
                    format!("{flow_id}:work:{}", edge.predecessor_node_id),
                    format!("{flow_id}:work:{}", edge.successor_node_id),
                    edge.required,
                    now
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "UPDATE tasks SET status='running',updated_at=?1 WHERE id=?2 AND status='pending'",
            params![now, root_task_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO audit_logs(id,agent_id,task_id,approval_id,action,resource,result,created_at)
             VALUES (?1,?2,?3,NULL,'business_flow.start',?4,'created',?5)",
            params![
                format!("{flow_id}:audit:start"),
                validated.proposal.coordinator_agent_id,
                root_task_id,
                flow_id,
                now
            ],
        )
        .map_err(|error| error.to_string())?;
    append_root_event(
        &transaction,
        &root_task_id,
        "business_flow.created",
        &serde_json::json!({"business_flow_id":flow_id,"scenario_sha256":saved.sha256}),
        now,
    )?;
    append_root_event(
        &transaction,
        &root_task_id,
        "business_flow.started",
        &serde_json::json!({"business_flow_id":flow_id,"status":"running"}),
        now,
    )?;
    for node_id in &validated.execution_order {
        let has_dependency = validated
            .proposal
            .edges
            .iter()
            .any(|edge| edge.required && edge.successor_node_id == *node_id);
        append_root_event(
            &transaction,
            &root_task_id,
            if has_dependency {
                "work_order.waiting_dependency"
            } else {
                "work_order.ready"
            },
            &serde_json::json!({"work_order_id":format!("{flow_id}:work:{node_id}")}),
            now,
        )?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    project_business_flow(connection, flow_id)
}

pub fn project_business_flow(
    connection: &Connection,
    flow_id: &str,
) -> Result<BusinessFlowProjection, String> {
    let header: Option<(String, String, String, String, String, String, String)> = connection
        .query_row(
            "SELECT flow.root_task_id,flow.scenario_definition_id,flow.scenario_version_id,
                    flow.scenario_sha256,flow.title,flow.objective,task.status
             FROM business_flows flow JOIN tasks task ON task.id=flow.root_task_id WHERE flow.id=?1",
            [flow_id],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?,row.get(6)?)),
        )
        .optional().map_err(|error| error.to_string())?;
    let (root_task_id, scenario_id, scenario_version_id, scenario_sha256, title, objective, status) =
        header.ok_or_else(|| "business_flow_not_found".to_owned())?;
    let mut statement = connection.prepare(
        "SELECT work.id,node.node_key,work.child_task_id,work.assignee_agent_id,work.role,work.goal,task.status,work.revision,
                EXISTS(SELECT 1 FROM actions WHERE task_id=task.id AND status='blocked'),
                EXISTS(SELECT 1 FROM actions WHERE task_id=task.id AND status='result_unknown'),
                EXISTS(SELECT 1 FROM work_order_dependencies dependency
                       JOIN work_orders predecessor ON predecessor.id=dependency.predecessor_work_order_id
                       JOIN tasks predecessor_task ON predecessor_task.id=predecessor.child_task_id
                       WHERE dependency.successor_work_order_id=work.id AND dependency.required=1
                         AND (
                           predecessor_task.status!='succeeded'
                           OR NOT EXISTS(
                             SELECT 1 FROM handoffs handoff
                             WHERE handoff.source_work_order_id=dependency.predecessor_work_order_id
                               AND handoff.target_work_order_id=dependency.successor_work_order_id
                               AND handoff.acceptance='accepted'
                           )
                         )),
                (SELECT id FROM agent_runs WHERE task_id=task.id ORDER BY created_at DESC LIMIT 1),
                (SELECT phase FROM agent_runs WHERE task_id=task.id ORDER BY created_at DESC LIMIT 1),
                (SELECT id FROM actions WHERE task_id=task.id AND status IN ('blocked','result_unknown')
                 ORDER BY created_at DESC LIMIT 1)
         FROM work_orders work
         JOIN scenario_nodes node ON node.id=work.scenario_node_id
         JOIN tasks task ON task.id=work.child_task_id
         WHERE work.business_flow_id=?1 ORDER BY node.position"
    ).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([flow_id], |row| {
            let persisted: String = row.get(6)?;
            let blocked: bool = row.get(8)?;
            let unknown: bool = row.get(9)?;
            let waiting_dependency: bool = row.get(10)?;
            let projection = if unknown {
                "verification_required"
            } else if blocked {
                "waiting_approval"
            } else if persisted == "pending" && waiting_dependency {
                "waiting_dependency"
            } else if persisted == "pending" {
                "ready"
            } else {
                &persisted
            };
            Ok(WorkOrderProjection {
                id: row.get(0)?,
                node_id: row.get(1)?,
                child_task_id: row.get(2)?,
                assignee_agent_id: row.get(3)?,
                role: row.get(4)?,
                goal: row.get(5)?,
                status: projection.to_owned(),
                revision: row.get(7)?,
                run_id: row.get(11)?,
                run_phase: row.get(12)?,
                action_id: row.get(13)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let work_orders = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(BusinessFlowProjection {
        schema_version: "1.0.0",
        business_flow_id: flow_id.to_owned(),
        root_task_id,
        scenario_id,
        scenario_version_id,
        scenario_sha256,
        title,
        objective,
        status,
        root_deliverable_id: connection
            .query_row(
                "SELECT deliverable_id FROM business_flow_outputs WHERE business_flow_id=?1",
                [flow_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?,
        work_orders,
    })
}

pub fn list_business_flows(connection: &Connection) -> Result<Vec<BusinessFlowProjection>, String> {
    let mut statement = connection
        .prepare("SELECT id FROM business_flows ORDER BY created_at DESC,id")
        .map_err(|error| error.to_string())?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    ids.into_iter()
        .map(|flow_id| project_business_flow(connection, &flow_id))
        .collect()
}

pub fn accept_handoff(
    connection: &mut Connection,
    flow_id: &str,
    source_work_order_id: &str,
    target_work_order_id: &str,
    deliverable_id: &str,
    summary: &str,
    now: &str,
) -> Result<HandoffRecord, String> {
    if summary.trim().is_empty() {
        return Err("handoff_summary_required".into());
    }
    let relationship: bool = connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM work_order_dependencies
               WHERE business_flow_id=?1 AND predecessor_work_order_id=?2
                 AND successor_work_order_id=?3 AND required=1
             )",
            params![flow_id, source_work_order_id, target_work_order_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !relationship {
        return Err("handoff_dependency_invalid".into());
    }
    let source: Option<(String, String)> = connection
        .query_row(
            "SELECT work.child_task_id,task.status FROM work_orders work
             JOIN tasks task ON task.id=work.child_task_id
             WHERE work.id=?1 AND work.business_flow_id=?2",
            params![source_work_order_id, flow_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let (source_task_id, source_status) =
        source.ok_or_else(|| "handoff_source_missing".to_owned())?;
    if source_status != "succeeded" {
        return Err("handoff_source_not_succeeded".into());
    }
    let deliverable_valid: bool = connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM deliverables deliverable
               WHERE deliverable.id=?1 AND deliverable.task_id=?2 AND deliverable.status='verified'
                 AND EXISTS(SELECT 1 FROM deliverable_evidence evidence WHERE evidence.deliverable_id=deliverable.id)
             )",
            params![deliverable_id, source_task_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !deliverable_valid {
        return Err("handoff_evidence_missing".into());
    }
    let handoff_id =
        format!("handoff:{source_work_order_id}:{target_work_order_id}:{deliverable_id}");
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO handoffs(id,business_flow_id,source_work_order_id,target_work_order_id,deliverable_id,artifact_refs_json,summary,acceptance,rejection_reason,created_at,resolved_at)
             VALUES (?1,?2,?3,?4,?5,'[]',?6,'accepted',NULL,?7,?7)
             ON CONFLICT(source_work_order_id,target_work_order_id,deliverable_id) DO NOTHING",
            params![handoff_id, flow_id, source_work_order_id, target_work_order_id, deliverable_id, summary, now],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE work_orders SET input_refs_json=json_insert(input_refs_json,'$[#]',?1),updated_at=?2
             WHERE id=?3 AND business_flow_id=?4
               AND NOT EXISTS(SELECT 1 FROM json_each(input_refs_json) WHERE value=?1)",
            params![format!("deliverable:{deliverable_id}"), now, target_work_order_id, flow_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE tasks SET input=json_insert(input,'$.input_refs[#]',?1),updated_at=?2
             WHERE id=(SELECT child_task_id FROM work_orders WHERE id=?3 AND business_flow_id=?4)
               AND NOT EXISTS(SELECT 1 FROM json_each(tasks.input,'$.input_refs') WHERE value=?1)",
            params![
                format!("deliverable:{deliverable_id}"),
                now,
                target_work_order_id,
                flow_id
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO audit_logs(id,agent_id,task_id,approval_id,action,resource,result,created_at)
             SELECT ?1,work.assignee_agent_id,work.child_task_id,NULL,'handoff.accept',?2,'accepted',?3
             FROM work_orders work WHERE work.id=?4",
            params![format!("{handoff_id}:audit"), deliverable_id, now, target_work_order_id],
        )
        .map_err(|error| error.to_string())?;
    let root_task_id: String = transaction
        .query_row(
            "SELECT root_task_id FROM business_flows WHERE id=?1",
            [flow_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    append_root_event(
        &transaction,
        &root_task_id,
        "handoff.created",
        &serde_json::json!({"handoff_id":handoff_id,"deliverable_id":deliverable_id}),
        now,
    )?;
    append_root_event(
        &transaction,
        &root_task_id,
        "handoff.accepted",
        &serde_json::json!({"handoff_id":handoff_id,"target_work_order_id":target_work_order_id}),
        now,
    )?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(HandoffRecord {
        id: handoff_id,
        business_flow_id: flow_id.to_owned(),
        source_work_order_id: source_work_order_id.to_owned(),
        target_work_order_id: target_work_order_id.to_owned(),
        deliverable_id: deliverable_id.to_owned(),
        acceptance: "accepted".into(),
        summary: summary.to_owned(),
    })
}

pub fn next_ready_work_order(
    connection: &Connection,
    flow_id: &str,
) -> Result<Option<WorkOrderProjection>, String> {
    Ok(project_business_flow(connection, flow_id)?
        .work_orders
        .into_iter()
        .find(|work_order| work_order.status == "ready"))
}

pub fn advance_after_child_success(
    connection: &mut Connection,
    flow_id: &str,
    source_work_order_id: &str,
    deliverable_id: &str,
    now: &str,
) -> Result<BusinessFlowProjection, String> {
    let root_task_id: String = connection
        .query_row(
            "SELECT root_task_id FROM business_flows WHERE id=?1",
            [flow_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT successor_work_order_id FROM work_order_dependencies
             WHERE business_flow_id=?1 AND predecessor_work_order_id=?2 AND required=1
             ORDER BY successor_work_order_id",
        )
        .map_err(|error| error.to_string())?;
    let successors = statement
        .query_map(params![flow_id, source_work_order_id], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);
    let already_advanced = if successors.is_empty() {
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM business_flow_outputs WHERE business_flow_id=?1 AND deliverable_id=?2)",
                params![flow_id, deliverable_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(|error| error.to_string())?
    } else {
        successors.iter().all(|successor| {
            connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM handoffs WHERE business_flow_id=?1 AND source_work_order_id=?2 AND target_work_order_id=?3 AND deliverable_id=?4 AND acceptance='accepted')",
                    params![flow_id, source_work_order_id, successor, deliverable_id],
                    |row| row.get::<_, bool>(0),
                )
                .unwrap_or(false)
        })
    };
    if already_advanced {
        return project_business_flow(connection, flow_id);
    }
    append_root_event(
        connection,
        &root_task_id,
        "work_order.completed",
        &serde_json::json!({"work_order_id":source_work_order_id,"deliverable_id":deliverable_id}),
        now,
    )?;
    for successor in successors {
        accept_handoff(
            connection,
            flow_id,
            source_work_order_id,
            &successor,
            deliverable_id,
            "上游交付物已通过 Runtime 证据校验",
            now,
        )?;
        append_root_event(
            connection,
            &root_task_id,
            "work_order.ready",
            &serde_json::json!({"work_order_id":successor}),
            now,
        )?;
    }
    let unfinished: bool = connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM work_orders work JOIN tasks task ON task.id=work.child_task_id
               WHERE work.business_flow_id=?1 AND task.status!='succeeded'
             )",
            [flow_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if !unfinished {
        let finalization_valid: bool = connection
            .query_row(
                "SELECT EXISTS(
                   SELECT 1 FROM work_orders work
                   JOIN tasks root ON root.id=(SELECT root_task_id FROM business_flows WHERE id=?1)
                   JOIN deliverables deliverable ON deliverable.id=?3
                   WHERE work.id=?2 AND work.business_flow_id=?1 AND work.role='finalization'
                     AND work.child_task_id=deliverable.task_id AND deliverable.status='verified'
                 )",
                params![flow_id, source_work_order_id, deliverable_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if !finalization_valid {
            return Err("root_finalization_evidence_invalid".into());
        }
        connection
            .execute(
                "INSERT INTO business_flow_outputs(business_flow_id,root_task_id,finalization_work_order_id,deliverable_id,verified_at)
                 SELECT flow.id,flow.root_task_id,?2,?3,?4 FROM business_flows flow WHERE flow.id=?1
                 ON CONFLICT(business_flow_id) DO NOTHING",
                params![flow_id, source_work_order_id, deliverable_id, now],
            )
            .map_err(|error| error.to_string())?;
        append_root_event(
            connection,
            &root_task_id,
            "business_flow.completed",
            &serde_json::json!({"business_flow_id":flow_id,"root_deliverable_id":deliverable_id}),
            now,
        )?;
        connection
            .execute(
                "UPDATE tasks SET status='succeeded',updated_at=?1
                 WHERE id=(SELECT root_task_id FROM business_flow_outputs WHERE business_flow_id=?2)
                   AND status='running'",
                params![now, flow_id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT OR IGNORE INTO audit_logs(id,agent_id,task_id,approval_id,action,resource,result,created_at)
                 SELECT ?1,task.agent_id,task.id,NULL,'business_flow.complete',?2,'succeeded',?3
                 FROM business_flows flow JOIN tasks task ON task.id=flow.root_task_id WHERE flow.id=?2",
                params![format!("{flow_id}:audit:complete"), flow_id, now],
            )
            .map_err(|error| error.to_string())?;
    }
    project_business_flow(connection, flow_id)
}

pub fn record_work_order_started(
    connection: &Connection,
    flow_id: &str,
    work_order_id: &str,
    now: &str,
) -> Result<(), String> {
    let root_task_id: String = connection
        .query_row(
            "SELECT root_task_id FROM business_flows WHERE id=?1",
            [flow_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    append_root_event(
        connection,
        &root_task_id,
        "work_order.started",
        &serde_json::json!({"work_order_id":work_order_id}),
        now,
    )
}

pub fn settle_failed_work_order(
    connection: &Connection,
    flow_id: &str,
    work_order_id: &str,
    reason: &str,
    now: &str,
) -> Result<BusinessFlowProjection, String> {
    let (root_task_id, failure_policy): (String, String) = connection
        .query_row(
            "SELECT flow.root_task_id,work.failure_policy FROM business_flows flow
             JOIN work_orders work ON work.business_flow_id=flow.id
             WHERE flow.id=?1 AND work.id=?2",
            params![flow_id, work_order_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "work_order_not_found".to_owned())?;
    match failure_policy.as_str() {
        "ask_user" => {
            append_root_event(
                connection,
                &root_task_id,
                "business_flow.waiting_user",
                &serde_json::json!({"work_order_id":work_order_id,"reason":reason}),
                now,
            )?;
        }
        "stop" => {
            connection
                .execute(
                    "UPDATE tasks SET status='cancelled',updated_at=?1
                     WHERE parent_task_id=?2 AND status='pending'",
                    params![now, root_task_id],
                )
                .map_err(|error| error.to_string())?;
            append_root_event(
                connection,
                &root_task_id,
                "business_flow.failed",
                &serde_json::json!({"work_order_id":work_order_id,"reason":reason}),
                now,
            )?;
            connection
                .execute(
                    "UPDATE tasks SET status='failed',updated_at=?1 WHERE id=?2 AND status='running'",
                    params![now, root_task_id],
                )
                .map_err(|error| error.to_string())?;
        }
        _ => return Err("failure_policy_invalid".into()),
    }
    project_business_flow(connection, flow_id)
}

fn append_root_event(
    connection: &Connection,
    root_task_id: &str,
    event_type: &str,
    payload: &serde_json::Value,
    now: &str,
) -> Result<(), String> {
    let sequence: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM runtime_events WHERE task_id=?1",
            [root_task_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO runtime_events(task_id,sequence,event_id,event_type,payload_json,occurred_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![root_task_id, sequence, format!("{root_task_id}:event:{sequence}"), event_type, payload.to_string(), now],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        business_flow::{
            FailurePolicy, SCENARIO_SCHEMA_VERSION, ScenarioEdgeSpec, ScenarioNodeRole,
            ScenarioNodeSpec, WorkBudget,
        },
        storage::migrate,
    };

    fn fixture(connection: &mut Connection) -> ScenarioProposal {
        migrate(connection).unwrap();
        connection
            .execute(
                "INSERT INTO agents VALUES ('alex','Alex','PM','package','active','t','t')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO skills VALUES ('local-file-operations','Local files','1.0.0','{}','path','active','t','t')", []).unwrap();
        connection
            .execute(
                "INSERT INTO agent_skills VALUES ('alex','local-file-operations',1,'t')",
                [],
            )
            .unwrap();
        let node = |id: &str, role| ScenarioNodeSpec {
            node_id: id.into(),
            role,
            goal: id.into(),
            suggested_agent_id: "alex".into(),
            required_capabilities: vec!["local-file-operations".into()],
            input_refs: vec![],
            acceptance_criteria: vec!["verified".into()],
            budget: WorkBudget {
                max_input_tokens: 1,
                max_output_tokens: 1,
                max_tool_rounds: 0,
                max_elapsed_ms: 1,
            },
            failure_policy: FailurePolicy::Stop,
        };
        ScenarioProposal {
            schema_version: SCENARIO_SCHEMA_VERSION.into(),
            proposal_id: "p".into(),
            title: "Launch".into(),
            objective: "Ship".into(),
            overall_acceptance_criteria: vec!["verified".into()],
            coordinator_agent_id: "alex".into(),
            nodes: vec![
                node("work", ScenarioNodeRole::Executor),
                node("finalize", ScenarioNodeRole::Finalization),
            ],
            edges: vec![ScenarioEdgeSpec {
                predecessor_node_id: "work".into(),
                successor_node_id: "finalize".into(),
                required: true,
            }],
            assumptions: vec![],
            risks: vec![],
            questions_for_user: vec![],
        }
    }

    #[test]
    fn saves_immutable_versions_and_disables_new_writes() {
        let mut connection = Connection::open_in_memory().unwrap();
        let proposal = fixture(&mut connection);
        let first = save_scenario(
            &mut connection,
            "scenario",
            "manual",
            proposal.clone(),
            "t1",
        )
        .unwrap();
        let second =
            save_scenario(&mut connection, "scenario", "ai_proposal", proposal, "t2").unwrap();
        assert_eq!((first.version, second.version), (1, 1));
        assert_eq!(list_scenarios(&connection).unwrap().len(), 1);
        assert_eq!(get_scenario(&connection, "scenario").unwrap().version, 1);
        disable_scenario(&connection, "scenario", "t3").unwrap();
        let proposal = get_scenario(&connection, "scenario").unwrap().definition;
        assert_eq!(
            save_scenario(&mut connection, "scenario", "manual", proposal, "t4").unwrap_err(),
            "scenario_disabled"
        );
    }

    #[test]
    fn starts_an_idempotent_flow_with_derived_dependency_status() {
        let mut connection = Connection::open_in_memory().unwrap();
        let proposal = fixture(&mut connection);
        save_scenario(&mut connection, "scenario", "manual", proposal, "t1").unwrap();
        let hash = get_scenario(&connection, "scenario").unwrap().sha256;
        let first = start_business_flow(&mut connection, "flow", "scenario", &hash, "t2").unwrap();
        let second = start_business_flow(&mut connection, "flow", "scenario", &hash, "t3").unwrap();
        assert_eq!(first.root_task_id, second.root_task_id);
        assert_eq!(first.status, "running");
        assert_eq!(first.work_orders[0].status, "ready");
        assert_eq!(first.work_orders[1].status, "waiting_dependency");
        let task_count: i64 = connection
            .query_row("SELECT count(*) FROM tasks", [], |row| row.get(0))
            .unwrap();
        assert_eq!(task_count, 3);
        let run_count: i64 = connection
            .query_row("SELECT count(*) FROM agent_runs", [], |row| row.get(0))
            .unwrap();
        assert_eq!(run_count, 0);
    }

    #[test]
    fn requires_verified_evidence_before_unlocking_downstream() {
        let mut connection = Connection::open_in_memory().unwrap();
        let proposal = fixture(&mut connection);
        save_scenario(&mut connection, "scenario", "manual", proposal, "t1").unwrap();
        let hash = get_scenario(&connection, "scenario").unwrap().sha256;
        start_business_flow(&mut connection, "flow", "scenario", &hash, "t2").unwrap();
        connection
            .execute(
                "UPDATE tasks SET status='succeeded',updated_at='t3' WHERE id='flow:task:work'",
                [],
            )
            .unwrap();
        assert_eq!(
            accept_handoff(
                &mut connection,
                "flow",
                "flow:work:work",
                "flow:work:finalize",
                "deliverable",
                "verified output",
                "t3"
            )
            .unwrap_err(),
            "handoff_evidence_missing"
        );
        connection.execute(
            "INSERT INTO agent_runs(id,task_id,schema_version,phase,revision,model_turns_used,tool_calls_used,max_model_turns,max_tool_calls,deadline,waiting_reason,stop_reason,created_at,updated_at)
             VALUES ('run','flow:task:work','1.0.0','terminal',1,0,0,1,0,'t4',NULL,'completed','t2','t3')", []).unwrap();
        connection.execute(
            "INSERT INTO deliverables(id,task_id,run_id,deliverable_type,title,summary,status,output_json,created_at,verified_at)
             VALUES ('deliverable','flow:task:work','run','document','Output','Verified','verified','{}','t3','t3')", []).unwrap();
        connection.execute(
            "INSERT INTO deliverable_evidence VALUES ('deliverable','structured_output','output:hash','t3')", []).unwrap();
        let handoff = accept_handoff(
            &mut connection,
            "flow",
            "flow:work:work",
            "flow:work:finalize",
            "deliverable",
            "verified output",
            "t4",
        )
        .unwrap();
        assert_eq!(handoff.acceptance, "accepted");
        let projection = project_business_flow(&connection, "flow").unwrap();
        assert_eq!(projection.work_orders[1].status, "ready");
        assert_eq!(
            next_ready_work_order(&connection, "flow")
                .unwrap()
                .unwrap()
                .node_id,
            "finalize"
        );
    }

    #[test]
    fn stop_failure_cancels_downstream_and_fails_root() {
        let mut connection = Connection::open_in_memory().unwrap();
        let proposal = fixture(&mut connection);
        save_scenario(&mut connection, "scenario", "manual", proposal, "t1").unwrap();
        let hash = get_scenario(&connection, "scenario").unwrap().sha256;
        start_business_flow(&mut connection, "flow", "scenario", &hash, "t2").unwrap();
        connection
            .execute(
                "UPDATE tasks SET status='failed',updated_at='t3' WHERE id='flow:task:work'",
                [],
            )
            .unwrap();
        let projection =
            settle_failed_work_order(&connection, "flow", "flow:work:work", "worker_failed", "t3")
                .unwrap();
        assert_eq!(projection.status, "failed");
        assert_eq!(projection.work_orders[1].status, "cancelled");
        let events: Vec<String> = connection
            .prepare(
                "SELECT event_type FROM runtime_events WHERE task_id='flow:root' ORDER BY sequence",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert!(events.contains(&"business_flow.failed".to_owned()));
    }

    #[test]
    fn ask_user_failure_keeps_root_running() {
        let mut connection = Connection::open_in_memory().unwrap();
        let mut proposal = fixture(&mut connection);
        proposal.nodes[0].failure_policy = FailurePolicy::AskUser;
        save_scenario(&mut connection, "scenario", "manual", proposal, "t1").unwrap();
        let hash = get_scenario(&connection, "scenario").unwrap().sha256;
        start_business_flow(&mut connection, "flow", "scenario", &hash, "t2").unwrap();
        connection
            .execute(
                "UPDATE tasks SET status='failed',updated_at='t3' WHERE id='flow:task:work'",
                [],
            )
            .unwrap();
        let projection =
            settle_failed_work_order(&connection, "flow", "flow:work:work", "worker_failed", "t3")
                .unwrap();
        assert_eq!(projection.status, "running");
        assert_eq!(projection.work_orders[1].status, "waiting_dependency");
        let waiting: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM runtime_events WHERE task_id='flow:root' AND event_type='business_flow.waiting_user')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(waiting);
    }

    #[test]
    fn rejects_private_context_refs_and_handoff_updates_child_input() {
        let mut connection = Connection::open_in_memory().unwrap();
        let mut forbidden = fixture(&mut connection);
        let proposal = forbidden.clone();
        forbidden.nodes[0].input_refs = vec!["conversation:private-message".into()];
        assert_eq!(
            validate_scenario(&connection, forbidden).unwrap_err(),
            "shared_context_forbidden"
        );

        save_scenario(&mut connection, "scenario", "manual", proposal, "t1").unwrap();
        let hash = get_scenario(&connection, "scenario").unwrap().sha256;
        start_business_flow(&mut connection, "flow", "scenario", &hash, "t2").unwrap();
        connection
            .execute(
                "UPDATE tasks SET status='succeeded' WHERE id='flow:task:work'",
                [],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO agent_runs(id,task_id,schema_version,phase,revision,model_turns_used,tool_calls_used,max_model_turns,max_tool_calls,deadline,waiting_reason,stop_reason,created_at,updated_at)
             VALUES ('run','flow:task:work','1.0.0','terminal',1,0,0,1,0,'t4',NULL,'completed','t2','t3')", []).unwrap();
        connection.execute(
            "INSERT INTO deliverables(id,task_id,run_id,deliverable_type,title,summary,status,output_json,created_at,verified_at)
             VALUES ('deliverable','flow:task:work','run','document','Output','Verified','verified','{}','t3','t3')", []).unwrap();
        connection.execute("INSERT INTO deliverable_evidence VALUES ('deliverable','structured_output','hash','t3')", []).unwrap();
        accept_handoff(
            &mut connection,
            "flow",
            "flow:work:work",
            "flow:work:finalize",
            "deliverable",
            "verified",
            "t4",
        )
        .unwrap();
        let input: String = connection
            .query_row(
                "SELECT input FROM tasks WHERE id='flow:task:finalize'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&input).unwrap()["input_refs"][0],
            "deliverable:deliverable"
        );
    }
}
