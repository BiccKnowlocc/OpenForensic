import Database from "better-sqlite3";
import schema from "./schema.sql?raw";
import type {
  CaseInfo,
  Evidence,
  Message,
  Candidate,
  Query,
  Stats,
} from "../shared/types";

export function ftsLiteral(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => '"' + token.replaceAll('"', '""') + '"')
    .join(" AND ");
}
export class CaseStore {
  readonly db: Database.Database;
  constructor(
    path: string,
    readonly sealed = false,
  ) {
    this.db = new Database(path, { readonly: sealed, fileMustExist: sealed });
    try {
      const version = this.db.pragma("user_version", { simple: true });
      if (sealed ? version !== 1 : version !== 0 && version !== 1)
        throw new Error("Unsupported case database version.");
      this.db.pragma("foreign_keys = ON");
      this.db.pragma("busy_timeout = 5000");
      if (!sealed) {
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("synchronous = FULL");
        this.db.exec(schema);
      }
      if (this.db.pragma("user_version", { simple: true }) !== 1)
        throw new Error("Unsupported case database version.");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  info(root: string): CaseInfo {
    return {
      ...(this.db.prepare("SELECT * FROM case_info").get() as Omit<
        CaseInfo,
        "root"
      >),
      root,
    };
  }
  register(e: Evidence): void {
    this.db
      .prepare(
        "INSERT INTO evidence VALUES(@id,@relative_path,@source,@kind,@bytes,@sha256,@md5,@status,@created_utc,@error)",
      )
      .run(e);
  }
  evidence(): Evidence[] {
    return this.db
      .prepare("SELECT * FROM evidence ORDER BY created_utc,id")
      .all() as Evidence[];
  }
  messages(q: Query): Message[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (q.search.trim()) {
      where.push(
        "m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)",
      );
      params.push(ftsLiteral(q.search));
    }
    if (q.platform) {
      where.push("m.platform = ?");
      params.push(q.platform);
    }
    if (q.thread) {
      where.push("m.thread_id = ?");
      params.push(q.thread);
    }
    return this.db
      .prepare(
        `SELECT m.* FROM messages m ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY m.timestamp_utc,m.id LIMIT ? OFFSET ?`,
      )
      .all(...params, q.limit, q.offset) as Message[];
  }
  threads(): { thread_id: string; platform: string; count: number }[] {
    return this.db
      .prepare(
        "SELECT thread_id,platform,count(*) AS count FROM messages GROUP BY thread_id,platform ORDER BY count DESC LIMIT 2000",
      )
      .all() as { thread_id: string; platform: string; count: number }[];
  }
  candidates(offset: number): Candidate[] {
    return this.db
      .prepare(
        "SELECT * FROM recovered_candidates ORDER BY id LIMIT 100 OFFSET ?",
      )
      .all(offset) as Candidate[];
  }
  stats(): Stats {
    const count = (table: string): number =>
      (
        this.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
          n: number;
        }
      ).n;
    return {
      messages: count("messages"),
      candidates: count("recovered_candidates"),
      evidence: count("evidence"),
      bytes: (
        this.db
          .prepare("SELECT coalesce(sum(bytes),0) AS n FROM evidence")
          .get() as { n: number }
      ).n,
      platforms: this.db
        .prepare(
          "SELECT platform,count(*) AS count FROM messages GROUP BY platform",
        )
        .all() as Stats["platforms"],
    };
  }
  close(): void {
    this.db.close();
  }
}
