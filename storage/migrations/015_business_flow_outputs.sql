PRAGMA foreign_keys = ON;

CREATE TABLE business_flow_outputs (
  business_flow_id TEXT PRIMARY KEY,
  root_task_id TEXT NOT NULL UNIQUE,
  finalization_work_order_id TEXT NOT NULL UNIQUE,
  deliverable_id TEXT NOT NULL UNIQUE,
  verified_at TEXT NOT NULL,
  FOREIGN KEY (business_flow_id) REFERENCES business_flows(id) ON DELETE RESTRICT,
  FOREIGN KEY (root_task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (finalization_work_order_id) REFERENCES work_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (deliverable_id) REFERENCES deliverables(id) ON DELETE RESTRICT
);

CREATE INDEX idx_business_flow_outputs_root ON business_flow_outputs(root_task_id, deliverable_id);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (15, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
