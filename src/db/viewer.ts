import Database from "better-sqlite3";
import type { Message } from "../../shared/types";
import { schemaSql } from "./schema";

function open(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(schemaSql);
  return db;
}

export async function replaceMessages(dbPath: string, messages: Message[]): Promise<void> {
  const db = open(dbPath);
  const insert = db.prepare(
    `INSERT INTO messages (id, timestamp_utc, platform, sender_id, receiver_id, message_text, media_path, is_deleted_flag, thread_id)
     VALUES (@id, @timestamp_utc, @platform, @sender_id, @receiver_id, @message_text, @media_path, @is_deleted_flag, @thread_id)`,
  );
  const write = db.transaction((rows: Message[]) => {
    db.prepare("DELETE FROM messages").run();
    for (const message of rows) {
      insert.run({
        id: message.id,
        timestamp_utc: message.timestampUtc,
        platform: message.platform,
        sender_id: message.senderId,
        receiver_id: message.receiverId,
        message_text: message.messageText,
        media_path: message.mediaPath,
        is_deleted_flag: message.isDeletedFlag ? 1 : 0,
        thread_id: message.threadId,
      });
    }
    db.prepare("INSERT INTO messages_fts(messages_fts) VALUES('rebuild')").run();
  });
  write(messages);
  db.close();
}

export function toFtsQuery(input: string): string | null {
  const tokens = input.toLowerCase().match(/[a-z0-9+]{2,}/g) ?? [];
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token.replaceAll('"', "")}"`).join(" AND ");
}

export async function searchMessages(dbPath: string, query: string): Promise<Message[]> {
  const match = toFtsQuery(query);
  if (!match) return [];
  const db = open(dbPath);
  const rows = db.prepare(
    `SELECT m.id, m.timestamp_utc, m.platform, m.sender_id, m.receiver_id, m.message_text, m.media_path, m.is_deleted_flag, m.thread_id
     FROM messages m
     JOIN messages_fts ON messages_fts.rowid = m.rowid
     WHERE messages_fts MATCH ?
     ORDER BY m.timestamp_utc`,
  ).all(match) as Array<Record<string, string | number | null>>;
  db.close();
  return rows.map((row) => ({
    id: String(row.id),
    threadId: String(row.thread_id ?? ""),
    timestampUtc: String(row.timestamp_utc),
    platform: "sms",
    senderId: String(row.sender_id ?? ""),
    receiverId: String(row.receiver_id ?? ""),
    messageText: String(row.message_text ?? ""),
    mediaPath: row.media_path ? String(row.media_path) : null,
    isDeletedFlag: Number(row.is_deleted_flag) === 1,
  }));
}
