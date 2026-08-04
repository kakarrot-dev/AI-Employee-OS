use std::collections::HashSet;

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use serde_json::{Value, json};

#[derive(Clone, Debug)]
pub struct GraphNode {
    pub id: String,
    pub depends_on: Vec<String>,
    pub output_as: String,
    pub tool_id: Option<String>,
    pub tool_action: Option<String>,
    pub tool_version: Option<String>,
    pub timeout_ms: u64,
    pub max_attempts: u64,
}

#[derive(Clone, Debug)]
pub struct GraphPlan {
    pub skill_id: String,
    pub skill_version: String,
    pub max_steps: usize,
    pub nodes: Vec<GraphNode>,
}

#[derive(Debug, Serialize)]
pub struct GraphNodeEvidence {
    pub step_id: String,
    pub action_id: String,
    pub status: String,
    pub output_as: String,
}

impl GraphPlan {
    pub fn restore(connection: &Connection, task_id: &str) -> Result<Self, String> {
        let snapshot: String = connection
            .query_row(
                "SELECT skill_snapshot_json FROM task_execution_snapshots WHERE task_id=?1",
                [task_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("locked graph snapshot is unavailable: {error}"))?;
        let snapshot: Value = serde_json::from_str(&snapshot).map_err(|error| error.to_string())?;
        let skill_id = required_text(&snapshot, "id")?.to_owned();
        let skill_version = required_text(&snapshot, "version")?.to_owned();
        let mut statement = connection
            .prepare(
                "SELECT input_json,tool_id FROM actions WHERE task_id=?1 AND json_extract(input_json,'$.graph.step_id') IS NOT NULL ORDER BY id",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([task_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|error| error.to_string())?;
        let mut nodes = Vec::new();
        for row in rows {
            let (input, tool_id) = row.map_err(|error| error.to_string())?;
            let input: Value = serde_json::from_str(&input).map_err(|error| error.to_string())?;
            let graph = &input["graph"];
            if graph["skill_id"] != skill_id || graph["skill_version"] != skill_version {
                return Err("materialized graph does not match locked task snapshot".into());
            }
            nodes.push(GraphNode {
                id: required_text(graph, "step_id")?.to_owned(),
                depends_on: graph["depends_on"]
                    .as_array()
                    .ok_or("invalid locked dependencies")?
                    .iter()
                    .map(|value| {
                        value
                            .as_str()
                            .map(str::to_owned)
                            .ok_or("invalid locked dependency")
                    })
                    .collect::<Result<Vec<_>, _>>()?,
                output_as: required_text(graph, "output_as")?.to_owned(),
                tool_id,
                tool_action: graph["tool_action"].as_str().map(str::to_owned),
                tool_version: graph["tool_version"].as_str().map(str::to_owned),
                timeout_ms: graph["timeout_ms"]
                    .as_u64()
                    .ok_or("invalid locked timeout")?,
                max_attempts: graph["max_attempts"]
                    .as_u64()
                    .ok_or("invalid locked retry policy")?,
            });
        }
        if nodes.is_empty() || nodes.len() > 64 {
            return Err("locked graph has invalid step count".into());
        }
        validate_dependencies(&nodes)?;
        Ok(Self {
            skill_id,
            skill_version,
            max_steps: nodes.len(),
            nodes,
        })
    }

    pub fn reconcile_task(
        &self,
        connection: &mut Connection,
        task_id: &str,
        now: &str,
    ) -> Result<(), String> {
        crate::recovery::reconcile_interrupted(connection, now)?;
        for node in &self.nodes {
            let action_id = self.action_id(task_id, &node.id);
            let status: String = connection
                .query_row(
                    "SELECT status FROM actions WHERE id=?1 AND task_id=?2",
                    params![action_id, task_id],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            if status != "running" {
                continue;
            }
            if node.tool_id.is_none() {
                connection.execute(
                    "UPDATE actions SET status='pending',updated_at=?1 WHERE id=?2 AND status='running'",
                    params![now, action_id],
                ).map_err(|error| error.to_string())?;
            } else {
                let execution_count: i64 = connection
                    .query_row(
                        "SELECT count(*) FROM tool_executions WHERE action_id=?1",
                        [&action_id],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                if execution_count == 0 {
                    connection.execute(
                        "UPDATE actions SET status='result_unknown',updated_at=?1 WHERE id=?2 AND status='running'",
                        params![now, action_id],
                    ).map_err(|error| error.to_string())?;
                }
            }
        }
        Ok(())
    }

    pub fn load(connection: &Connection, skill_id: &str, version: &str) -> Result<Self, String> {
        let manifest: Option<String> = connection
            .query_row(
                "SELECT manifest_json FROM skills WHERE id=?1 AND version=?2 AND status='active'",
                params![skill_id, version],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let manifest: Value = serde_json::from_str(
            &manifest
                .ok_or_else(|| format!("locked skill is unavailable: {skill_id}@{version}"))?,
        )
        .map_err(|error| error.to_string())?;
        let workflow = &manifest["skill"]["workflow"];
        if workflow["engine"] != "runtime-dag-v1" {
            return Err("unsupported graph engine".into());
        }
        let max_steps = workflow["max_steps"]
            .as_u64()
            .ok_or("workflow max_steps is invalid")? as usize;
        let raw_nodes = workflow["steps"]
            .as_array()
            .ok_or("workflow steps are invalid")?;
        if max_steps == 0 || max_steps > 64 || raw_nodes.is_empty() || raw_nodes.len() > max_steps {
            return Err("workflow exceeds its step limit".into());
        }
        let mut nodes = Vec::with_capacity(raw_nodes.len());
        let mut ids = HashSet::new();
        let allowed_routes: HashSet<(String, String)> = manifest["skill"]["required_tools"]
            .as_array()
            .ok_or("required_tools are invalid")?
            .iter()
            .flat_map(|tool| {
                let tool_id = tool["id"].as_str().unwrap_or_default().to_owned();
                tool["actions"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(move |action| {
                        action
                            .as_str()
                            .map(|action| (tool_id.clone(), action.to_owned()))
                    })
            })
            .collect();
        for raw in raw_nodes {
            let id = required_text(raw, "id")?.to_owned();
            if !ids.insert(id.clone()) {
                return Err("workflow step ids must be unique".into());
            }
            let depends_on = raw["depends_on"]
                .as_array()
                .ok_or("depends_on must be an array")?
                .iter()
                .map(|value| {
                    value
                        .as_str()
                        .map(str::to_owned)
                        .ok_or("invalid dependency")
                })
                .collect::<Result<Vec<_>, _>>()?;
            let tool = raw.get("tool");
            let (tool_id, tool_action, tool_version) = match tool {
                Some(tool) => {
                    let tool_id = required_text(tool, "id")?.to_owned();
                    let action = required_text(tool, "action")?.to_owned();
                    if !allowed_routes.contains(&(tool_id.clone(), action.clone())) {
                        return Err(format!(
                            "graph tool route is not declared: {tool_id}.{action}"
                        ));
                    }
                    let installed: Option<(String, String)> = connection
                        .query_row(
                            "SELECT version,manifest_json FROM tools WHERE id=?1 AND status='active'",
                            [&tool_id],
                            |row| Ok((row.get(0)?, row.get(1)?)),
                        )
                        .optional()
                        .map_err(|error| error.to_string())?;
                    let (version, tool_manifest) =
                        installed.ok_or_else(|| format!("graph tool is unavailable: {tool_id}"))?;
                    let tool_manifest: Value =
                        serde_json::from_str(&tool_manifest).map_err(|error| error.to_string())?;
                    let action_exists =
                        tool_manifest["tool"]["actions"]
                            .as_array()
                            .is_some_and(|actions| {
                                actions.iter().any(|candidate| candidate["name"] == action)
                            });
                    if !action_exists {
                        return Err(format!(
                            "graph tool action is unavailable: {tool_id}.{action}"
                        ));
                    }
                    (Some(tool_id), Some(action), Some(version))
                }
                None => (None, None, None),
            };
            let max_attempts = raw["retry_policy"]["max_attempts"]
                .as_u64()
                .ok_or("retry max_attempts is invalid")?;
            if max_attempts == 0 {
                return Err("retry max_attempts must be positive".into());
            }
            if tool_id.is_some() && max_attempts != 1 {
                return Err("side-effect graph nodes cannot retry automatically".into());
            }
            let timeout_ms = raw["timeout_ms"].as_u64().ok_or("timeout_ms is invalid")?;
            if timeout_ms == 0 || timeout_ms > 300_000 {
                return Err("timeout_ms is outside the runtime limit".into());
            }
            nodes.push(GraphNode {
                id,
                depends_on,
                output_as: required_text(raw, "output_as")?.to_owned(),
                tool_id,
                tool_action,
                tool_version,
                timeout_ms,
                max_attempts,
            });
        }
        validate_dependencies(&nodes)?;
        Ok(Self {
            skill_id: skill_id.into(),
            skill_version: version.into(),
            max_steps,
            nodes,
        })
    }

    pub fn materialize(
        &self,
        connection: &Connection,
        task_id: &str,
        now: &str,
    ) -> Result<(), String> {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        for node in &self.nodes {
            transaction
                .execute(
                    "INSERT INTO actions
                     (id,task_id,tool_id,input_json,output_json,status,created_at,updated_at)
                     VALUES (?1,?2,?3,?4,NULL,'pending',?5,?5)",
                    params![
                        self.action_id(task_id, &node.id),
                        task_id,
                        node.tool_id,
                        json!({
                            "graph": {
                                "skill_id": self.skill_id,
                                "skill_version": self.skill_version,
                                "step_id": node.id,
                                "depends_on": node.depends_on,
                                "output_as": node.output_as,
                                "timeout_ms": node.timeout_ms,
                                "max_attempts": node.max_attempts,
                                "tool_action": node.tool_action,
                                "tool_version": node.tool_version,
                            }
                        })
                        .to_string(),
                        now
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn start_step(
        &self,
        connection: &Connection,
        task_id: &str,
        step_id: &str,
        now: &str,
    ) -> Result<String, String> {
        let node = self.node(step_id)?;
        for dependency in &node.depends_on {
            let status: Option<String> = connection
                .query_row(
                    "SELECT status FROM actions WHERE id=?1 AND task_id=?2",
                    params![self.action_id(task_id, dependency), task_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            if status.as_deref() != Some("succeeded") {
                return Err(format!("graph dependency is not satisfied: {dependency}"));
            }
        }
        let action_id = self.action_id(task_id, step_id);
        let updated = connection
            .execute(
                "UPDATE actions SET status='running',updated_at=?1
                 WHERE id=?2 AND task_id=?3 AND status='pending'",
                params![now, action_id, task_id],
            )
            .map_err(|error| error.to_string())?;
        if updated != 1 {
            return Err(format!("graph step is not pending: {step_id}"));
        }
        Ok(action_id)
    }

    pub fn complete_step(
        &self,
        connection: &Connection,
        task_id: &str,
        step_id: &str,
        output: &Value,
        now: &str,
    ) -> Result<(), String> {
        self.node(step_id)?;
        let updated = connection
            .execute(
                "UPDATE actions SET status='succeeded',output_json=?1,updated_at=?2
                 WHERE id=?3 AND task_id=?4 AND status='running'",
                params![
                    output.to_string(),
                    now,
                    self.action_id(task_id, step_id),
                    task_id
                ],
            )
            .map_err(|error| error.to_string())?;
        if updated != 1 {
            return Err(format!("graph step cannot complete: {step_id}"));
        }
        Ok(())
    }

    pub fn evidence(
        &self,
        connection: &Connection,
        task_id: &str,
    ) -> Result<Vec<GraphNodeEvidence>, String> {
        self.nodes
            .iter()
            .map(|node| {
                let action_id = self.action_id(task_id, &node.id);
                let status = connection
                    .query_row(
                        "SELECT status FROM actions WHERE id=?1 AND task_id=?2",
                        params![action_id, task_id],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                Ok(GraphNodeEvidence {
                    step_id: node.id.clone(),
                    action_id,
                    status,
                    output_as: node.output_as.clone(),
                })
            })
            .collect()
    }

    pub fn action_id(&self, task_id: &str, step_id: &str) -> String {
        format!("{task_id}:{step_id}")
    }

    pub fn tool_route(&self, step_id: &str) -> Result<(&str, &str, &str), String> {
        let node = self.node(step_id)?;
        match (&node.tool_id, &node.tool_action, &node.tool_version) {
            (Some(tool_id), Some(action), Some(version)) => Ok((tool_id, action, version)),
            _ => Err(format!("graph step has no tool route: {step_id}")),
        }
    }

    fn node(&self, step_id: &str) -> Result<&GraphNode, String> {
        self.nodes
            .iter()
            .find(|node| node.id == step_id)
            .ok_or_else(|| format!("unknown graph step: {step_id}"))
    }
}

fn required_text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value[key]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("missing {key}"))
}

fn validate_dependencies(nodes: &[GraphNode]) -> Result<(), String> {
    let known: HashSet<&str> = nodes.iter().map(|node| node.id.as_str()).collect();
    if nodes.iter().any(|node| {
        node.depends_on
            .iter()
            .any(|dependency| !known.contains(dependency.as_str()))
    }) {
        return Err("graph references an unknown dependency".into());
    }
    let mut complete = HashSet::new();
    loop {
        let before = complete.len();
        for node in nodes {
            if node
                .depends_on
                .iter()
                .all(|dependency| complete.contains(dependency.as_str()))
            {
                complete.insert(node.id.as_str());
            }
        }
        if complete.len() == nodes.len() {
            return Ok(());
        }
        if complete.len() == before {
            return Err("graph contains a cycle".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        agent::install_agent_package, skill_package::install_skill_package, storage::migrate,
        tool_package::install_tool_package,
    };
    use std::path::Path;

    #[test]
    fn manifest_graph_materializes_into_canonical_actions() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let packages = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages");
        install_tool_package(&connection, &packages.join("tools/document-tool"), "t").unwrap();
        install_skill_package(&connection, &packages.join("skills/prd-generation"), "t").unwrap();
        install_agent_package(
            &mut connection,
            &packages.join("agents/ai-product-manager"),
            "t",
        )
        .unwrap();
        connection
            .execute(
                "INSERT INTO tasks VALUES ('task_1','ai-product-manager','prd','running','t','t')",
                [],
            )
            .unwrap();
        let graph = GraphPlan::load(&connection, "prd-generation", "1.0.0").unwrap();
        graph.materialize(&connection, "task_1", "t").unwrap();
        assert!(
            graph
                .start_step(&connection, "task_1", "write", "t")
                .is_err()
        );
        graph
            .start_step(&connection, "task_1", "analyze", "t")
            .unwrap();
        graph
            .complete_step(
                &connection,
                "task_1",
                "analyze",
                &json!({"analysis":"ok"}),
                "t",
            )
            .unwrap();
        graph
            .start_step(&connection, "task_1", "write", "t")
            .unwrap();
        let evidence = graph.evidence(&connection, "task_1").unwrap();
        assert_eq!(evidence[0].status, "succeeded");
        assert_eq!(evidence[1].status, "running");
    }

    #[test]
    fn restores_from_locked_actions_and_reconciles_interrupted_nodes() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let packages = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages");
        install_tool_package(&connection, &packages.join("tools/document-tool"), "t").unwrap();
        install_skill_package(&connection, &packages.join("skills/prd-generation"), "t").unwrap();
        install_agent_package(
            &mut connection,
            &packages.join("agents/ai-product-manager"),
            "t",
        )
        .unwrap();
        connection
            .execute(
                "INSERT INTO tasks VALUES ('task_2','ai-product-manager','prd','running','t','t')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO task_execution_snapshots VALUES ('task_2','{\"id\":\"prd-generation\",\"version\":\"1.0.0\"}','[]','{}','{}','[]','{}','t')", []).unwrap();
        let graph = GraphPlan::load(&connection, "prd-generation", "1.0.0").unwrap();
        graph.materialize(&connection, "task_2", "t").unwrap();
        graph
            .start_step(&connection, "task_2", "analyze", "t")
            .unwrap();
        let restored = GraphPlan::restore(&connection, "task_2").unwrap();
        restored
            .reconcile_task(&mut connection, "task_2", "restart")
            .unwrap();
        restored
            .start_step(&connection, "task_2", "analyze", "restart")
            .unwrap();
        restored
            .complete_step(
                &connection,
                "task_2",
                "analyze",
                &json!({"ok":true}),
                "restart",
            )
            .unwrap();
        restored
            .start_step(&connection, "task_2", "write", "restart")
            .unwrap();
        restored
            .reconcile_task(&mut connection, "task_2", "restart-2")
            .unwrap();
        let status: String = connection
            .query_row(
                "SELECT status FROM actions WHERE id='task_2:write'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "result_unknown");
        connection
            .execute("DELETE FROM skills WHERE id='prd-generation'", [])
            .unwrap();
        assert!(GraphPlan::restore(&connection, "task_2").is_ok());
    }
}
