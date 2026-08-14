PRAGMA foreign_keys = ON;

CREATE TABLE task_participant_snapshots (
  task_id TEXT PRIMARY KEY,
  historical_agent_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  role TEXT NOT NULL CHECK (length(trim(role)) > 0),
  captured_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

INSERT INTO task_participant_snapshots(task_id,historical_agent_id,display_name,role,captured_at)
SELECT task.id,agent.id,agent.name,agent.role,task.created_at
FROM tasks task JOIN agents agent ON agent.id=task.agent_id;

CREATE TRIGGER capture_task_participant_snapshot
AFTER INSERT ON tasks
BEGIN
  INSERT INTO task_participant_snapshots(task_id,historical_agent_id,display_name,role,captured_at)
  SELECT NEW.id,agent.id,agent.name,agent.role,NEW.created_at
  FROM agents agent WHERE agent.id=NEW.agent_id;
END;

ALTER TABLE scenario_nodes ADD COLUMN historical_agent_id TEXT;

UPDATE scenario_nodes SET historical_agent_id=assignee_agent_id;

CREATE TRIGGER capture_scenario_node_historical_agent
AFTER INSERT ON scenario_nodes
WHEN NEW.historical_agent_id IS NULL
BEGIN
  UPDATE scenario_nodes
  SET historical_agent_id=NEW.assignee_agent_id
  WHERE id=NEW.id;
END;

INSERT INTO agents(id,name,role,package_path,status,created_at,updated_at)
VALUES ('system:historical-employee','已删除员工','历史参与者','system-history','disabled',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT INTO schema_migrations(version, applied_at)
VALUES (18, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
