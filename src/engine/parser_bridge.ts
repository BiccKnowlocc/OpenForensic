import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, copyFile, stat, readdir, chmod } from "node:fs/promises";
import { basename, join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { collect } from "../main/adb/client";
import { ForensicCase, realWithin } from "../main/case";
import { hashFile } from "../main/integrity/hashStream";

const messageSchema = z.object({
  timestamp_utc: z.string().nullable(),
  platform: z.string().max(128),
  sender_id: z.string().max(8192),
  receiver_id: z.string().max(8192),
  message_text: z.string().max(4 * 1024 * 1024),
  media_path: z.string().nullable(),
  is_deleted_flag: z.union([z.literal(0), z.literal(1), z.null()]),
  thread_id: z.string().max(8192),
  source_locator: z.string().max(8192),
  confidence: z.string().max(128),
});
const candidateSchema = z.object({
  source_locator: z.string().max(8192),
  origin: z.string().max(128),
  confidence: z.string().max(128),
  values_json: z.string().max(4 * 1024 * 1024),
  raw_hex: z.string().max(8192),
  note: z.string().max(8192),
});
export class ParserBridge {
  python = process.env.OPENFORENSIC_PYTHON || "python";
  constructor(private engineDirectory: string) {}
  async parse(
    item: ForensicCase,
    evidenceId: string,
  ): Promise<{ messages: number; candidates: number; warnings: string[] }> {
    item.writable();
    const evidence = item.store.evidence().find((e) => e.id === evidenceId);
    if (!evidence || evidence.status !== "complete")
      throw new Error("Select a complete evidence item to parse.");
    if (evidence.kind === "physical")
      throw new Error(
        "Raw block images require a separately validated filesystem/decryption workflow. Import acquired SQLite or app exports for parsing.",
      );
    const path = await realWithin(item.root, evidence.relative_path);
    if ((await hashFile(path)).sha256 !== evidence.sha256)
      throw new Error("Evidence hash mismatch; parsing refused.");
    const runId = randomUUID();
    const work = join(item.root, "working", runId);
    await mkdir(work, { mode: 0o700 });
    const input = join(work, basename(path));
    await copyFile(path, input);
    await chmod(input, 0o600);
    if ((await hashFile(input)).sha256 !== evidence.sha256)
      throw new Error("Working copy failed integrity verification.");
    for (const suffix of ["-wal", "-shm"]) {
      const companion = item.store
        .evidence()
        .find(
          (e) =>
            e.source === evidence.source + suffix && e.status === "complete",
        );
      if (companion) {
        const source = await realWithin(item.root, companion.relative_path);
        if ((await hashFile(source)).sha256 !== companion.sha256)
          throw new Error("Companion file integrity failure.");
        await copyFile(source, input + suffix);
        await chmod(input + suffix, 0o600);
        if ((await hashFile(input + suffix)).sha256 !== companion.sha256)
          throw new Error("Working companion failed integrity verification.");
      }
    }
    const derivative = join(item.root, "derivatives", `${runId}.jsonl`);
    item.audit.append("parser_started", {
      pythonVersion: await collect(this.python, ["--version"]),
      runId,
      evidenceId,
      inputSha256: evidence.sha256,
      workingCopy: `working/${runId}`,
    });
    try {
      await collect(
        this.python,
        [
          join(this.engineDirectory, "runner.py"),
          "--input",
          input,
          "--kind",
          evidence.kind,
          "--output",
          derivative,
          "--work",
          work,
        ],
        2 * 1024 * 1024,
        20 * 60 * 1000,
      );
      if ((await stat(derivative)).size > 270 * 1024 * 1024)
        throw new Error("Parser derivative exceeds output bounds.");
      const insertMessage = item.store.db
        .prepare(`INSERT OR IGNORE INTO messages(evidence_id,timestamp_utc,platform,sender_id,receiver_id,message_text,media_path,is_deleted_flag,thread_id,source_locator,confidence)
        VALUES(@evidence_id,@timestamp_utc,@platform,@sender_id,@receiver_id,@message_text,@media_path,@is_deleted_flag,@thread_id,@source_locator,@confidence)`);
      const insertCandidate = item.store.db
        .prepare(`INSERT OR IGNORE INTO recovered_candidates(evidence_id,source_locator,origin,confidence,values_json,raw_hex,note)
        VALUES(@evidence_id,@source_locator,@origin,@confidence,@values_json,@raw_hex,@note)`);
      const insertAux = item.store.db.prepare(
        "INSERT OR IGNORE INTO auxiliary_artifacts(evidence_id,kind,source_locator,data_json) VALUES(?,?,?,?)",
      );
      let summary: {
        messages: number;
        candidates: number;
        warnings: string[];
        version: string;
      } | null = null;
      let messages = 0;
      let candidates = 0;
      item.store.db.exec("BEGIN IMMEDIATE");
      try {
        for await (const line of createInterface({
          input: createReadStream(derivative),
          crlfDelay: Infinity,
        })) {
          if (line.length > 8 * 1024 * 1024)
            throw new Error("Parser row exceeds limit.");
          const value = JSON.parse(line);
          if (value.type === "message") {
            const parsed = messageSchema.parse(value);
            if (parsed.media_path) {
              await realWithin(work, parsed.media_path);
              parsed.media_path = `working/${runId}/${parsed.media_path}`;
            }
            messages += insertMessage.run({
              ...parsed,
              evidence_id: evidenceId,
            }).changes;
          } else if (value.type === "candidate")
            candidates += insertCandidate.run({
              ...candidateSchema.parse(value),
              evidence_id: evidenceId,
            }).changes;
          else if (value.type === "auxiliary") {
            const parsed = z
              .object({
                kind: z.string().max(128),
                source_locator: z.string().max(8192),
                data_json: z.string().max(16 * 1024 * 1024),
              })
              .parse(value);
            insertAux.run(
              evidenceId,
              parsed.kind,
              parsed.source_locator,
              parsed.data_json,
            );
          } else if (value.type === "summary")
            summary = z
              .object({
                messages: z.number().int().nonnegative(),
                candidates: z.number().int().nonnegative(),
                warnings: z.array(z.string()),
                version: z.string(),
              })
              .parse(value);
          else throw new Error("Unknown parser output type.");
        }
        if (!summary) throw new Error("Parser summary is missing.");
        const hash = await hashFile(derivative);
        const registerDerived = item.store.db.prepare(
          "INSERT INTO derived_files VALUES(?,?,?,?,?)",
        );
        async function registerTree(directory: string): Promise<void> {
          for (const entry of await readdir(directory, {
            withFileTypes: true,
          })) {
            const file = join(directory, entry.name);
            if (entry.isDirectory()) await registerTree(file);
            else if (entry.isFile()) {
              const digest = await hashFile(file);
              const { relative } = await import("node:path");
              registerDerived.run(
                relative(item.root, file).replaceAll("\\", "/"),
                evidenceId,
                digest.bytes,
                digest.sha256,
                digest.md5,
              );
            } else
              throw new Error(
                "A parser derivative contains a link or special file.",
              );
          }
        }
        await registerTree(work);
        registerDerived.run(
          `derivatives/${runId}.jsonl`,
          evidenceId,
          hash.bytes,
          hash.sha256,
          hash.md5,
        );
        item.store.db
          .prepare("INSERT INTO parser_runs VALUES(?,?,?,?,?,?,?,?,?)")
          .run(
            runId,
            evidenceId,
            new Date().toISOString(),
            summary.version,
            messages,
            candidates,
            JSON.stringify(summary.warnings),
            `derivatives/${runId}.jsonl`,
            hash.sha256,
          );
        item.store.db.exec("COMMIT");
        item.audit.append("parser_finished", {
          runId,
          evidenceId,
          messages,
          candidates,
          warnings: summary.warnings,
          derivativeSha256: hash.sha256,
        });
      } catch (error) {
        if (item.store.db.inTransaction) item.store.db.exec("ROLLBACK");
        throw error;
      }
      if ((await hashFile(path)).sha256 !== evidence.sha256)
        throw new Error(
          "Evidence changed during parsing. Preserve all outputs and investigate.",
        );
      return { messages, candidates, warnings: summary!.warnings };
    } catch (error) {
      item.audit.append("parser_failed", {
        runId,
        evidenceId,
        error: String(error),
      });
      throw error;
    }
  }
}
