PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS runtime_events (
  task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (task_id, sequence),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS task_cancellation_requests (
  task_id TEXT PRIMARY KEY,
  requested_at TEXT NOT NULL,
  acknowledged_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_runtime_events_task_sequence ON runtime_events(task_id, sequence);
CREATE TRIGGER IF NOT EXISTS trg_tasks_event_created
AFTER INSERT ON tasks
BEGIN
  INSERT INTO runtime_events(task_id,sequence,event_id,event_type,payload_json,occurred_at)
  VALUES (NEW.id,1,NEW.id || ':event:1','task_created',json_object('agent_id',NEW.agent_id),NEW.created_at);
END;
CREATE TRIGGER IF NOT EXISTS trg_tasks_event_status
AFTER UPDATE OF status ON tasks WHEN OLD.status != NEW.status
BEGIN
  INSERT INTO runtime_events(task_id,sequence,event_id,event_type,payload_json,occurred_at)
  VALUES (
    NEW.id,
    (SELECT COALESCE(MAX(sequence),0)+1 FROM runtime_events WHERE task_id=NEW.id),
    NEW.id || ':event:' || (SELECT COALESCE(MAX(sequence),0)+1 FROM runtime_events WHERE task_id=NEW.id),
    CASE NEW.status
      WHEN 'running' THEN 'task_started'
      WHEN 'succeeded' THEN 'task_succeeded'
      WHEN 'failed' THEN 'task_failed'
      WHEN 'cancelled' THEN 'task_cancelled'
    END,
    json_object('status',NEW.status),
    NEW.updated_at
  );
END;
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
