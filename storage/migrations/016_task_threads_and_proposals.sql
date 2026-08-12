PRAGMA foreign_keys = ON;

CREATE TABLE task_threads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  status TEXT NOT NULL CHECK (status IN ('drafting','awaiting_input','awaiting_confirmation','materialized','running','succeeded','failed','cancelled')),
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_thread_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  role TEXT NOT NULL CHECK (role IN ('user','system')),
  kind TEXT NOT NULL CHECK (kind IN ('goal','clarification','proposal','confirmation','progress','deliverable','error')),
  content TEXT NOT NULL,
  proposal_id TEXT,
  task_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES task_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  UNIQUE (thread_id, sequence)
);

CREATE TABLE task_proposals (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft','awaiting_input','validated','confirmed','expired','rejected','materialized')),
  proposal_json TEXT NOT NULL CHECK (json_valid(proposal_json)),
  proposal_sha256 TEXT NOT NULL CHECK (length(proposal_sha256) = 64),
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES task_threads(id) ON DELETE CASCADE,
  UNIQUE (thread_id, revision),
  UNIQUE (thread_id, proposal_sha256)
);

CREATE TABLE task_thread_task_bindings (
  thread_id TEXT NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  proposal_id TEXT NOT NULL,
  binding_role TEXT NOT NULL CHECK (binding_role IN ('single','root','child')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (thread_id, task_id),
  FOREIGN KEY (thread_id) REFERENCES task_threads(id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY (proposal_id) REFERENCES task_proposals(id) ON DELETE RESTRICT
);

CREATE INDEX idx_task_threads_status_updated ON task_threads(status, updated_at);
CREATE INDEX idx_task_thread_messages_thread_sequence ON task_thread_messages(thread_id, sequence);
CREATE INDEX idx_task_proposals_thread_status ON task_proposals(thread_id, status, revision);
CREATE INDEX idx_task_thread_bindings_thread_role ON task_thread_task_bindings(thread_id, binding_role);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (16, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
