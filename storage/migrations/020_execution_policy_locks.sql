PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS task_capability_locks (
  task_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, skill_id),
  UNIQUE (task_id, ordinal),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_task_capability_locks_order
  ON task_capability_locks(task_id, ordinal);

ALTER TABLE approvals ADD COLUMN action_id TEXT
  REFERENCES actions(id) ON DELETE RESTRICT;
ALTER TABLE approvals ADD COLUMN input_sha256 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_pending_action
  ON approvals(action_id) WHERE status = 'pending' AND action_id IS NOT NULL;

-- Retire the removed legacy generalist from existing databases while preserving
-- immutable work evidence under the historical system subject.
UPDATE tool_executions
SET status=CASE WHEN side_effect_state='unknown' THEN 'result_unknown' ELSE 'failed' END,
    finished_at=COALESCE(finished_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
WHERE status='running' AND action_id IN (
  SELECT action.id FROM actions action
  JOIN tasks task ON task.id=action.task_id
  WHERE task.agent_id='ai-product-manager'
);

UPDATE actions
SET status=CASE
      WHEN EXISTS(
        SELECT 1 FROM tool_executions execution
        WHERE execution.action_id=actions.id AND execution.status='result_unknown'
      ) THEN 'result_unknown'
      ELSE 'cancelled'
    END,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE task_id IN (SELECT id FROM tasks WHERE agent_id='ai-product-manager')
  AND status IN ('pending','running','blocked');

UPDATE agent_runs
SET phase='terminal',waiting_reason=NULL,stop_reason='legacy_employee_removed',
    revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE task_id IN (SELECT id FROM tasks WHERE agent_id='ai-product-manager')
  AND phase!='terminal';

UPDATE tasks
SET status=CASE
      WHEN EXISTS(
        SELECT 1 FROM actions action
        WHERE action.task_id=tasks.id AND action.status='result_unknown'
      ) THEN 'failed'
      ELSE 'cancelled'
    END,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE agent_id='ai-product-manager' AND status IN ('pending','running');

UPDATE approvals
SET status='expired',resolved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE agent_id='ai-product-manager' AND status='pending';

UPDATE scenario_definitions
SET status='disabled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (
  SELECT DISTINCT version.scenario_definition_id
  FROM scenario_versions version
  JOIN scenario_nodes node ON node.scenario_version_id=version.id
  WHERE node.assignee_agent_id='ai-product-manager'
);

DELETE FROM scoped_permission_grants WHERE subject_id='ai-product-manager';
DELETE FROM permissions WHERE subject_type='agent' AND subject_id='ai-product-manager';
DELETE FROM memories WHERE owner_type='agent' AND owner_id='ai-product-manager';
DELETE FROM model_call_configs WHERE employee_id='ai-product-manager';
DELETE FROM conversations WHERE agent_id='ai-product-manager';

UPDATE tasks SET agent_id='system:historical-employee'
WHERE agent_id='ai-product-manager';
UPDATE approvals SET agent_id='system:historical-employee'
WHERE agent_id='ai-product-manager';
UPDATE evaluations SET agent_id='system:historical-employee'
WHERE agent_id='ai-product-manager';
UPDATE scenario_nodes
SET historical_agent_id=COALESCE(historical_agent_id,assignee_agent_id),
    assignee_agent_id='system:historical-employee'
WHERE assignee_agent_id='ai-product-manager';
UPDATE work_orders
SET assignee_agent_id='system:historical-employee',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE assignee_agent_id='ai-product-manager';
DELETE FROM business_flow_participants WHERE agent_id='ai-product-manager';
DELETE FROM agents WHERE id='ai-product-manager';

DELETE FROM runtime_flags WHERE key = 'default_agent_dismissed';

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
