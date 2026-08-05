CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) > 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  UNIQUE (conversation_id, sequence)
);

CREATE TABLE IF NOT EXISTS model_calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  assistant_message_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (assistant_message_id) REFERENCES messages(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON messages(conversation_id, sequence);
CREATE INDEX IF NOT EXISTS idx_model_calls_conversation_created
ON model_calls(conversation_id, created_at);

DELETE FROM agent_skills
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 8);
UPDATE skills SET status = 'disabled'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 8);
UPDATE tools SET status = 'disabled'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 8);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
