PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, package_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personas (
  agent_id TEXT PRIMARY KEY,
  communication_json TEXT NOT NULL CHECK (json_valid(communication_json)),
  thinking_json TEXT NOT NULL CHECK (json_valid(thinking_json)),
  decision_json TEXT NOT NULL CHECK (json_valid(decision_json)),
  habit_json TEXT NOT NULL CHECK (json_valid(habit_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)), path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (name, version)
);
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id TEXT NOT NULL, skill_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)), created_at TEXT NOT NULL,
  PRIMARY KEY (agent_id, skill_id),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, version TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (name, version)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tool_id TEXT,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  output_json TEXT CHECK (output_json IS NULL OR json_valid(output_json)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'blocked', 'result_unknown', 'cancelled')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'agent', 'company')),
  owner_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'experience', 'fact', 'decision', 'pattern')),
  content TEXT NOT NULL, importance REAL NOT NULL CHECK (importance BETWEEN 0.0 AND 1.0),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY, uri TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('local_file', 'seed_document')),
  title TEXT NOT NULL, content_hash TEXT NOT NULL,
  index_status TEXT NOT NULL CHECK (index_status IN ('pending', 'indexed', 'failed', 'stale')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0), content TEXT NOT NULL,
  content_hash TEXT NOT NULL, embedding_ref TEXT, created_at TEXT NOT NULL,
  UNIQUE (source_id, chunk_index),
  FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'agent', 'company')),
  subject_id TEXT NOT NULL, resource TEXT NOT NULL, action TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (subject_type, subject_id, resource, action)
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, action TEXT NOT NULL,
  risk_level INTEGER NOT NULL CHECK (risk_level BETWEEN 0 AND 3),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at TEXT NOT NULL, resolved_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, agent_id TEXT, task_id TEXT, approval_id TEXT,
  action TEXT NOT NULL, resource TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL,
  score REAL NOT NULL CHECK (score BETWEEN 0.0 AND 1.0),
  metrics_json TEXT NOT NULL CHECK (json_valid(metrics_json)), created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY, task_id TEXT, agent_id TEXT, name TEXT NOT NULL,
  value REAL NOT NULL, recorded_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_agent_status ON tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_task_created ON actions(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memories_owner_type ON memories(owner_type, owner_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON knowledge_sources(index_status);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_approvals_task_status ON approvals(task_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_task_created ON audit_logs(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evaluations_task_created ON evaluations(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedbacks_task_created ON feedbacks(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_name_recorded ON metrics(name, recorded_at);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
