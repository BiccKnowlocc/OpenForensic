PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS case_info (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, operator TEXT NOT NULL, authority TEXT NOT NULL,
 created_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
 id TEXT PRIMARY KEY, relative_path TEXT NOT NULL UNIQUE, source TEXT NOT NULL, kind TEXT NOT NULL,
 bytes INTEGER NOT NULL CHECK(bytes >= 0), sha256 TEXT NOT NULL, md5 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('complete','partial','failed')), created_utc TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id), timestamp_utc TEXT,
 platform TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, message_text TEXT NOT NULL,
 media_path TEXT, is_deleted_flag INTEGER CHECK(is_deleted_flag IN (0,1) OR is_deleted_flag IS NULL),
 thread_id TEXT NOT NULL, source_locator TEXT NOT NULL, confidence TEXT NOT NULL,
 UNIQUE(evidence_id, source_locator)
);
CREATE INDEX IF NOT EXISTS messages_time ON messages(timestamp_utc,id);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id,timestamp_utc,id);
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(message_text,sender_id,receiver_id,platform,
 content='messages',content_rowid='id',tokenize='unicode61');
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
 INSERT INTO messages_fts(rowid,message_text,sender_id,receiver_id,platform)
 VALUES(new.id,new.message_text,new.sender_id,new.receiver_id,new.platform);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
 INSERT INTO messages_fts(messages_fts,rowid,message_text,sender_id,receiver_id,platform)
 VALUES('delete',old.id,old.message_text,old.sender_id,old.receiver_id,old.platform);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
 INSERT INTO messages_fts(messages_fts,rowid,message_text,sender_id,receiver_id,platform)
 VALUES('delete',old.id,old.message_text,old.sender_id,old.receiver_id,old.platform);
 INSERT INTO messages_fts(rowid,message_text,sender_id,receiver_id,platform)
 VALUES(new.id,new.message_text,new.sender_id,new.receiver_id,new.platform);
END;
CREATE TABLE IF NOT EXISTS recovered_candidates (
 id INTEGER PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id), source_locator TEXT NOT NULL,
 origin TEXT NOT NULL, confidence TEXT NOT NULL, values_json TEXT NOT NULL, raw_hex TEXT NOT NULL,
 note TEXT NOT NULL, UNIQUE(evidence_id,source_locator,origin)
);
CREATE TABLE IF NOT EXISTS auxiliary_artifacts (
 id INTEGER PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id), kind TEXT NOT NULL,
 source_locator TEXT NOT NULL, data_json TEXT NOT NULL, UNIQUE(evidence_id,source_locator,kind)
);
CREATE TABLE IF NOT EXISTS ai_runs (
 id TEXT PRIMARY KEY, created_utc TEXT NOT NULL, kind TEXT NOT NULL, model TEXT NOT NULL,
 prompt TEXT NOT NULL, response TEXT NOT NULL, source_ids_json TEXT NOT NULL,
 source_snapshot_sha256 TEXT NOT NULL, truncated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parser_runs (
 id TEXT PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id), created_utc TEXT NOT NULL,
 version TEXT NOT NULL, messages INTEGER NOT NULL, candidates INTEGER NOT NULL, warnings_json TEXT NOT NULL,
 derivative_path TEXT NOT NULL, derivative_sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS derived_files (
 relative_path TEXT PRIMARY KEY, evidence_id TEXT NOT NULL REFERENCES evidence(id), bytes INTEGER NOT NULL,
 sha256 TEXT NOT NULL, md5 TEXT NOT NULL
);
PRAGMA user_version = 1;
