export const schemaSql = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  timestamp_utc TEXT NOT NULL,
  platform TEXT NOT NULL,
  sender_id TEXT,
  receiver_id TEXT,
  message_text TEXT,
  media_path TEXT,
  is_deleted_flag INTEGER NOT NULL DEFAULT 0,
  thread_id TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_text,
  sender_id,
  content='messages',
  content_rowid='rowid'
);
`;
