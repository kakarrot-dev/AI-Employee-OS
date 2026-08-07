use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SCENARIO_SCHEMA_VERSION: &str = "1.0.0";
pub const MAX_SCENARIO_NODES: usize = 12;
pub const MAX_SCENARIO_PARTICIPANTS: usize = 5;
pub const MAX_WORK_INPUT_TOKENS: u64 = 200_000;
pub const MAX_WORK_OUTPUT_TOKENS: u64 = 64_000;
pub const MAX_WORK_TOOL_ROUNDS: u32 = 32;
pub const MAX_WORK_ELAPSED_MS: u64 = 3_600_000;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScenarioProposal {
    pub schema_version: String,
    pub proposal_id: String,
    pub title: String,
    pub objective: String,
    pub overall_acceptance_criteria: Vec<String>,
    pub coordinator_agent_id: String,
    pub nodes: Vec<ScenarioNodeSpec>,
    pub edges: Vec<ScenarioEdgeSpec>,
    pub assumptions: Vec<String>,
    pub risks: Vec<String>,
    pub questions_for_user: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScenarioNodeSpec {
    pub node_id: String,
    pub role: ScenarioNodeRole,
    pub goal: String,
    pub suggested_agent_id: String,
    pub required_capabilities: Vec<String>,
    pub input_refs: Vec<String>,
    pub acceptance_criteria: Vec<String>,
    pub budget: WorkBudget,
    pub failure_policy: FailurePolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ScenarioEdgeSpec {
    pub predecessor_node_id: String,
    pub successor_node_id: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WorkBudget {
    pub max_input_tokens: u64,
    pub max_output_tokens: u64,
    pub max_tool_rounds: u32,
    pub max_elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct NormalizedBusinessFlowPlan {
    pub schema_version: String,
    pub scenario_id: String,
    pub scenario_version_id: String,
    pub plan_hash: String,
    pub execution_order: Vec<String>,
    pub work_orders: Vec<WorkOrderPlanSpec>,
    pub blocking_issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct WorkOrderPlanSpec {
    pub node_id: String,
    pub assignee_agent_id: String,
    pub role: ScenarioNodeRole,
    pub dependency_ids: Vec<String>,
    pub budget: WorkBudget,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SharedContextRefSpec {
    pub schema_version: String,
    pub id: String,
    pub business_flow_id: String,
    pub source_type: SharedContextSourceType,
    pub source_id: String,
    pub sensitivity: ContextSensitivity,
    pub allowed_agents: Vec<String>,
    pub content_sha256: String,
    pub added_by: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SharedContextSourceType {
    UserInput,
    Knowledge,
    Artifact,
    Deliverable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextSensitivity {
    Public,
    Internal,
    Sensitive,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ScenarioNodeRole {
    Coordinator,
    Executor,
    Finalization,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailurePolicy {
    Stop,
    AskUser,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ValidatedScenario {
    pub proposal: ScenarioProposal,
    pub proposal_hash: String,
    pub execution_order: Vec<String>,
}

impl ScenarioProposal {
    pub fn validate(self) -> Result<ValidatedScenario, String> {
        if self.schema_version != SCENARIO_SCHEMA_VERSION {
            return Err("scenario_schema_version_unsupported".into());
        }
        if self.proposal_id.trim().is_empty()
            || self.title.trim().is_empty()
            || self.objective.trim().is_empty()
            || self.coordinator_agent_id.trim().is_empty()
        {
            return Err("scenario_required_field_missing".into());
        }
        if !(2..=MAX_SCENARIO_NODES).contains(&self.nodes.len()) {
            return Err("scenario_node_limit_exceeded".into());
        }
        if self.overall_acceptance_criteria.is_empty() {
            return Err("scenario_acceptance_required".into());
        }
        let participants = self
            .nodes
            .iter()
            .map(|node| node.suggested_agent_id.as_str())
            .collect::<BTreeSet<_>>();
        if participants.len() > MAX_SCENARIO_PARTICIPANTS {
            return Err("scenario_participant_limit_exceeded".into());
        }

        let mut nodes = BTreeMap::new();
        for node in &self.nodes {
            if node.node_id.trim().is_empty()
                || node.goal.trim().is_empty()
                || node.suggested_agent_id.trim().is_empty()
                || node.required_capabilities.is_empty()
                || node.acceptance_criteria.is_empty()
                || node.budget.max_input_tokens == 0
                || node.budget.max_output_tokens == 0
                || node.budget.max_elapsed_ms == 0
            {
                return Err("scenario_node_invalid".into());
            }
            if node.budget.max_input_tokens > MAX_WORK_INPUT_TOKENS
                || node.budget.max_output_tokens > MAX_WORK_OUTPUT_TOKENS
                || node.budget.max_tool_rounds > MAX_WORK_TOOL_ROUNDS
                || node.budget.max_elapsed_ms > MAX_WORK_ELAPSED_MS
            {
                return Err("work_order_budget_exceeded".into());
            }
            if nodes.insert(node.node_id.clone(), node).is_some() {
                return Err("scenario_node_duplicate".into());
            }
        }

        let finalization: Vec<_> = self
            .nodes
            .iter()
            .filter(|node| node.role == ScenarioNodeRole::Finalization)
            .collect();
        if finalization.len() != 1
            || finalization[0].suggested_agent_id != self.coordinator_agent_id
        {
            return Err("scenario_finalization_invalid".into());
        }

        let mut dependencies: BTreeMap<String, BTreeSet<String>> = self
            .nodes
            .iter()
            .map(|node| (node.node_id.clone(), BTreeSet::new()))
            .collect();
        let mut unique_edges = BTreeSet::new();
        for edge in &self.edges {
            if edge.predecessor_node_id == edge.successor_node_id
                || !nodes.contains_key(&edge.predecessor_node_id)
                || !nodes.contains_key(&edge.successor_node_id)
            {
                return Err("scenario_edge_invalid".into());
            }
            if !unique_edges.insert((
                edge.predecessor_node_id.clone(),
                edge.successor_node_id.clone(),
            )) {
                return Err("scenario_edge_duplicate".into());
            }
            dependencies
                .get_mut(&edge.successor_node_id)
                .expect("successor was checked")
                .insert(edge.predecessor_node_id.clone());
        }

        let mut execution_order = Vec::with_capacity(self.nodes.len());
        while execution_order.len() < self.nodes.len() {
            let completed: BTreeSet<_> = execution_order.iter().cloned().collect();
            let next = dependencies
                .iter()
                .find(|(node_id, required)| {
                    !completed.contains(*node_id) && required.is_subset(&completed)
                })
                .map(|(node_id, _)| node_id.clone());
            match next {
                Some(node_id) => execution_order.push(node_id),
                None => return Err("scenario_dependency_cycle".into()),
            }
        }
        if execution_order.last() != Some(&finalization[0].node_id) {
            return Err("scenario_finalization_must_be_last".into());
        }

        let canonical = serde_json::to_vec(&self).map_err(|_| "scenario_serialization_failed")?;
        let proposal_hash = format!("{:x}", Sha256::digest(canonical));
        Ok(ValidatedScenario {
            proposal: self,
            proposal_hash,
            execution_order,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proposal() -> ScenarioProposal {
        ScenarioProposal {
            schema_version: SCENARIO_SCHEMA_VERSION.into(),
            proposal_id: "proposal".into(),
            title: "Launch".into(),
            objective: "Ship".into(),
            overall_acceptance_criteria: vec!["verified".into()],
            coordinator_agent_id: "alex".into(),
            nodes: vec![
                node("research", ScenarioNodeRole::Executor),
                node("finalize", ScenarioNodeRole::Finalization),
            ],
            edges: vec![ScenarioEdgeSpec {
                predecessor_node_id: "research".into(),
                successor_node_id: "finalize".into(),
                required: true,
            }],
            assumptions: vec![],
            risks: vec![],
            questions_for_user: vec![],
        }
    }

    fn node(id: &str, role: ScenarioNodeRole) -> ScenarioNodeSpec {
        ScenarioNodeSpec {
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
        }
    }

    #[test]
    fn validates_and_hashes_a_scenario() {
        let first = proposal().validate().unwrap();
        let second = proposal().validate().unwrap();
        assert_eq!(first.execution_order, ["research", "finalize"]);
        assert_eq!(first.proposal_hash, second.proposal_hash);
    }

    #[test]
    fn rejects_cycles_and_unknown_fields() {
        let mut cyclic = proposal();
        cyclic.edges.push(ScenarioEdgeSpec {
            predecessor_node_id: "finalize".into(),
            successor_node_id: "research".into(),
            required: true,
        });
        assert_eq!(cyclic.validate().unwrap_err(), "scenario_dependency_cycle");
        let json = serde_json::json!({"schema_version":"1.0.0","unknown":true});
        assert!(serde_json::from_value::<ScenarioProposal>(json).is_err());
    }

    #[test]
    fn rejects_excessive_budget_and_participants() {
        let mut excessive = proposal();
        excessive.nodes[0].budget.max_input_tokens = MAX_WORK_INPUT_TOKENS + 1;
        assert_eq!(
            excessive.validate().unwrap_err(),
            "work_order_budget_exceeded"
        );

        let mut too_many = proposal();
        too_many.nodes.clear();
        too_many.edges.clear();
        for index in 0..6 {
            let mut item = node(&format!("work-{index}"), ScenarioNodeRole::Executor);
            item.suggested_agent_id = format!("agent-{index}");
            too_many.nodes.push(item);
        }
        let mut finalization = node("finalize", ScenarioNodeRole::Finalization);
        finalization.suggested_agent_id = "alex".into();
        too_many.nodes.push(finalization);
        assert_eq!(
            too_many.validate().unwrap_err(),
            "scenario_participant_limit_exceeded"
        );
    }
}
