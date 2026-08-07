PRAGMA foreign_keys = ON;

ALTER TABLE tasks ADD COLUMN parent_task_id TEXT
  REFERENCES tasks(id) ON DELETE RESTRICT
  CHECK (parent_task_id IS NULL OR parent_task_id != id);

CREATE TABLE scenario_definitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  current_version INTEGER NOT NULL CHECK (current_version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE scenario_versions (
  id TEXT PRIMARY KEY,
  scenario_definition_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  source TEXT NOT NULL CHECK (source IN ('manual','ai_proposal')),
  definition_json TEXT NOT NULL CHECK (json_valid(definition_json)),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  model_config_json TEXT CHECK (model_config_json IS NULL OR json_valid(model_config_json)),
  confirmed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (scenario_definition_id) REFERENCES scenario_definitions(id) ON DELETE RESTRICT,
  UNIQUE (scenario_definition_id, version),
  UNIQUE (scenario_definition_id, sha256)
);

CREATE TABLE scenario_nodes (
  id TEXT PRIMARY KEY,
  scenario_version_id TEXT NOT NULL,
  node_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coordinator','executor','finalization')),
  goal TEXT NOT NULL CHECK (length(trim(goal)) > 0),
  assignee_agent_id TEXT NOT NULL,
  required_capabilities_json TEXT NOT NULL CHECK (json_valid(required_capabilities_json)),
  input_refs_json TEXT NOT NULL CHECK (json_valid(input_refs_json)),
  acceptance_json TEXT NOT NULL CHECK (json_valid(acceptance_json)),
  budget_json TEXT NOT NULL CHECK (json_valid(budget_json)),
  failure_policy TEXT NOT NULL CHECK (failure_policy IN ('stop','ask_user','continue_independent')),
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (scenario_version_id) REFERENCES scenario_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  UNIQUE (scenario_version_id, node_key),
  UNIQUE (scenario_version_id, position)
);

CREATE TABLE scenario_edges (
  scenario_version_id TEXT NOT NULL,
  predecessor_node_id TEXT NOT NULL,
  successor_node_id TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (scenario_version_id, predecessor_node_id, successor_node_id),
  FOREIGN KEY (scenario_version_id) REFERENCES scenario_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (predecessor_node_id) REFERENCES scenario_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (successor_node_id) REFERENCES scenario_nodes(id) ON DELETE CASCADE,
  CHECK (predecessor_node_id != successor_node_id)
);

CREATE TABLE business_flows (
  id TEXT PRIMARY KEY,
  root_task_id TEXT NOT NULL UNIQUE,
  scenario_definition_id TEXT NOT NULL,
  scenario_version_id TEXT NOT NULL,
  scenario_sha256 TEXT NOT NULL CHECK (length(scenario_sha256) = 64),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  acceptance_json TEXT NOT NULL CHECK (json_valid(acceptance_json)),
  budget_json TEXT NOT NULL CHECK (json_valid(budget_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (root_task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (scenario_definition_id) REFERENCES scenario_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (scenario_version_id) REFERENCES scenario_versions(id) ON DELETE RESTRICT
);

CREATE TABLE business_flow_participants (
  business_flow_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coordinator','executor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (business_flow_id, agent_id, role),
  FOREIGN KEY (business_flow_id) REFERENCES business_flows(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

CREATE TABLE work_orders (
  id TEXT PRIMARY KEY,
  business_flow_id TEXT NOT NULL,
  scenario_node_id TEXT NOT NULL,
  child_task_id TEXT NOT NULL UNIQUE,
  assignee_agent_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coordinator','executor','finalization')),
  goal TEXT NOT NULL,
  input_refs_json TEXT NOT NULL CHECK (json_valid(input_refs_json)),
  acceptance_json TEXT NOT NULL CHECK (json_valid(acceptance_json)),
  required_capabilities_json TEXT NOT NULL CHECK (json_valid(required_capabilities_json)),
  budget_json TEXT NOT NULL CHECK (json_valid(budget_json)),
  failure_policy TEXT NOT NULL CHECK (failure_policy IN ('stop','ask_user','continue_independent')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (business_flow_id) REFERENCES business_flows(id) ON DELETE CASCADE,
  FOREIGN KEY (scenario_node_id) REFERENCES scenario_nodes(id) ON DELETE RESTRICT,
  FOREIGN KEY (child_task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (assignee_agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

CREATE TABLE work_order_dependencies (
  business_flow_id TEXT NOT NULL,
  predecessor_work_order_id TEXT NOT NULL,
  successor_work_order_id TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (predecessor_work_order_id, successor_work_order_id),
  FOREIGN KEY (business_flow_id) REFERENCES business_flows(id) ON DELETE CASCADE,
  FOREIGN KEY (predecessor_work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (successor_work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  CHECK (predecessor_work_order_id != successor_work_order_id)
);

CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  business_flow_id TEXT NOT NULL,
  source_work_order_id TEXT NOT NULL,
  target_work_order_id TEXT NOT NULL,
  deliverable_id TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL CHECK (json_valid(artifact_refs_json)),
  summary TEXT NOT NULL,
  acceptance TEXT NOT NULL CHECK (acceptance IN ('pending','accepted','rejected')),
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (business_flow_id) REFERENCES business_flows(id) ON DELETE CASCADE,
  FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_work_order_id) REFERENCES work_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE RESTRICT,
  UNIQUE (source_work_order_id, target_work_order_id, deliverable_id)
);

CREATE TABLE shared_context_refs (
  id TEXT PRIMARY KEY,
  business_flow_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('user_input','knowledge','artifact','deliverable')),
  source_id TEXT NOT NULL,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('public','internal','sensitive')),
  allowed_agents_json TEXT NOT NULL CHECK (json_valid(allowed_agents_json)),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (business_flow_id) REFERENCES business_flows(id) ON DELETE CASCADE,
  UNIQUE (business_flow_id, source_type, source_id, content_sha256)
);

CREATE INDEX idx_tasks_parent_status_created ON tasks(parent_task_id, status, created_at);
CREATE INDEX idx_scenario_versions_definition_version ON scenario_versions(scenario_definition_id, version);
CREATE INDEX idx_scenario_nodes_version_position ON scenario_nodes(scenario_version_id, position);
CREATE INDEX idx_scenario_edges_successor ON scenario_edges(scenario_version_id, successor_node_id);
CREATE INDEX idx_business_flows_scenario_created ON business_flows(scenario_definition_id, created_at);
CREATE INDEX idx_work_orders_flow_child ON work_orders(business_flow_id, child_task_id);
CREATE INDEX idx_work_orders_assignee ON work_orders(assignee_agent_id, created_at);
CREATE INDEX idx_work_order_dependencies_successor ON work_order_dependencies(business_flow_id, successor_work_order_id);
CREATE INDEX idx_handoffs_target_acceptance ON handoffs(target_work_order_id, acceptance);
CREATE INDEX idx_shared_context_flow_source ON shared_context_refs(business_flow_id, source_type, source_id);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (14, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
