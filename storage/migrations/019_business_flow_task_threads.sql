PRAGMA foreign_keys = ON;

CREATE TABLE task_thread_task_bindings_v2 (
  thread_id TEXT NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  proposal_id TEXT,
  binding_role TEXT NOT NULL CHECK (binding_role IN ('single','root','child')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, task_id),
  FOREIGN KEY (thread_id) REFERENCES task_threads(id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (proposal_id) REFERENCES task_proposals(id) ON DELETE RESTRICT
);

INSERT INTO task_thread_task_bindings_v2(thread_id,task_id,proposal_id,binding_role,created_at)
SELECT thread_id,task_id,proposal_id,binding_role,created_at
FROM task_thread_task_bindings;

DROP TABLE task_thread_task_bindings;
ALTER TABLE task_thread_task_bindings_v2 RENAME TO task_thread_task_bindings;
CREATE INDEX idx_task_thread_bindings_thread_role ON task_thread_task_bindings(thread_id, binding_role);

CREATE TEMP TABLE migration_019_unbound_flows AS
SELECT flow.id AS flow_id,
       'system:flow-thread:' || flow.id AS thread_id,
       flow.root_task_id,
       flow.title,
       flow.objective,
       CASE root.status
         WHEN 'succeeded' THEN 'succeeded'
         WHEN 'failed' THEN 'failed'
         WHEN 'cancelled' THEN 'cancelled'
         ELSE 'running'
       END AS thread_status,
       flow.created_at,
       root.updated_at
FROM business_flows flow
JOIN tasks root ON root.id=flow.root_task_id
WHERE NOT EXISTS (
  SELECT 1 FROM task_thread_task_bindings binding
  WHERE binding.task_id=flow.root_task_id
);

INSERT INTO task_threads(id,title,status,current_revision,created_at,updated_at)
SELECT thread_id,title,thread_status,1,created_at,updated_at
FROM migration_019_unbound_flows;

INSERT INTO task_thread_messages(id,thread_id,sequence,role,kind,content,proposal_id,task_id,created_at)
SELECT 'system:flow-goal:' || flow_id,thread_id,1,'user','goal',objective,NULL,root_task_id,created_at
FROM migration_019_unbound_flows;

INSERT INTO task_thread_task_bindings(thread_id,task_id,proposal_id,binding_role,created_at)
SELECT thread_id,root_task_id,NULL,'root',created_at
FROM migration_019_unbound_flows;

INSERT INTO task_thread_task_bindings(thread_id,task_id,proposal_id,binding_role,created_at)
SELECT migration.thread_id,work.child_task_id,NULL,'child',work.created_at
FROM migration_019_unbound_flows migration
JOIN work_orders work ON work.business_flow_id=migration.flow_id;

DROP TABLE migration_019_unbound_flows;

INSERT INTO schema_migrations(version, applied_at)
VALUES (19, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
