import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve, relative, isAbsolute, join } from "node:path";
import { realpath } from "node:fs/promises";
import { CaseStore } from "../db";
import { AuditLog, canonical, sha256 } from "./integrity/audit";
import { hashFile } from "./integrity/hashStream";
import type { CaseInfo, DeviceProfile } from "../shared/types";

export function within(root: string, name: string): string {
  const path = resolve(root, name);
  const rel = relative(resolve(root), path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Path is outside the case directory.");
  return path;
}
export async function realWithin(root: string, name: string): Promise<string> {
  const base = await realpath(root);
  const path = await realpath(within(base, name));
  within(base, relative(base, path));
  return path;
}
export class ForensicCase {
  readonly store: CaseStore;
  readonly audit: AuditLog;
  readonly info: CaseInfo;
  sealed: boolean;
  constructor(readonly root: string) {
    const databasePath = join(root, "case_store.db");
    if (!existsSync(databasePath))
      throw new Error(
        "This folder is not an OpenForensic case. No files were created.",
      );
    this.sealed = existsSync(join(root, "evidence_manifest.json"));
    const probe = new CaseStore(databasePath, true);
    let info: CaseInfo;
    try {
      info = probe.info(root);
    } finally {
      probe.close();
    }
    if (!info.id || !info.name || !info.operator || !info.authority)
      throw new Error(
        "Case identity or required examiner metadata is missing.",
      );
    this.audit = new AuditLog(join(root, "audit.jsonl"));
    const first = this.audit.read()[0];
    if (
      !first ||
      first.action !== "case_created" ||
      (first.details as { caseId?: string } | null)?.caseId !== info.id
    )
      throw new Error(
        "The custody origin is missing or belongs to another case.",
      );
    this.store = new CaseStore(databasePath, this.sealed);
    this.info = info;
  }
  static create(
    root: string,
    input: { name: string; operator: string; authority: string },
  ): ForensicCase {
    mkdirSync(root, { recursive: false, mode: 0o700 });
    for (const directory of [
      "evidence",
      "working",
      "derivatives",
      "reports",
      "sessions",
    ])
      mkdirSync(join(root, directory), { mode: 0o700 });
    const db = new CaseStore(join(root, "case_store.db"));
    const caseId = randomUUID();
    db.db
      .prepare("INSERT INTO case_info VALUES(?,?,?,?,?)")
      .run(
        caseId,
        input.name,
        input.operator,
        input.authority,
        new Date().toISOString(),
      );
    db.close();
    new AuditLog(join(root, "audit.jsonl")).append("case_created", {
      ...input,
      caseId,
      tool: "OpenForensic 0.1.0",
    });
    return new ForensicCase(root);
  }
  writable(): void {
    if (this.sealed)
      throw new Error(
        "This case is sealed. Create a new examination case to add material.",
      );
  }
  session(id: string, profile: DeviceProfile): void {
    this.writable();
    writeFileSync(
      join(this.root, "sessions", `${id}.json`),
      canonical(profile),
      { flag: "wx", mode: 0o600 },
    );
    this.audit.append("device_profile", { sessionId: id, profile });
  }
  async verify(): Promise<{ ok: boolean; problems: string[] }> {
    const problems: string[] = [];
    try {
      this.audit.verify();
    } catch (e) {
      problems.push(String(e));
    }
    for (const e of this.store.evidence()) {
      try {
        const hash = await hashFile(
          await realWithin(this.root, e.relative_path),
        );
        if (
          hash.sha256 !== e.sha256 ||
          hash.md5 !== e.md5 ||
          hash.bytes !== e.bytes
        )
          problems.push(`${e.id}: evidence digest or size mismatch`);
      } catch (error) {
        problems.push(`${e.id}: ${String(error)}`);
      }
    }
    const derivatives = this.store.db
      .prepare("SELECT * FROM derived_files")
      .all() as {
      relative_path: string;
      sha256: string;
      md5: string;
      bytes: number;
    }[];
    for (const file of derivatives) {
      try {
        const hash = await hashFile(
          await realWithin(this.root, file.relative_path),
        );
        if (
          hash.sha256 !== file.sha256 ||
          hash.md5 !== file.md5 ||
          hash.bytes !== file.bytes
        )
          problems.push(`${file.relative_path}: derivative digest mismatch`);
      } catch (error) {
        problems.push(`${file.relative_path}: ${String(error)}`);
      }
    }
    if (this.sealed) {
      try {
        const manifestText = readFileSync(
          join(this.root, "evidence_manifest.json"),
          "utf8",
        );
        if (
          sha256(manifestText) !==
          readFileSync(
            join(this.root, "evidence_manifest.sha256"),
            "utf8",
          ).trim()
        )
          problems.push("Manifest digest mismatch");
        const manifest = JSON.parse(manifestText);
        if (canonical(manifest.evidence) !== canonical(this.store.evidence()))
          problems.push("Evidence register differs from sealed manifest");
        if (manifest.auditHead !== this.audit.verify().at(-1)?.hash)
          problems.push("Audit head differs from sealed manifest");
        if (
          (await hashFile(join(this.root, "case_store.db"))).sha256 !==
          manifest.caseDatabaseSha256
        )
          problems.push("Case database differs from sealed manifest");
      } catch (error) {
        problems.push(`Manifest verification: ${String(error)}`);
      }
    }
    return { ok: !problems.length, problems };
  }
  async seal(): Promise<string> {
    this.writable();
    const verified = await this.verify();
    if (!verified.ok) throw new Error(verified.problems.join("\n"));
    const head = this.audit.append("case_seal", {
      operator: this.info.operator,
      evidenceCount: this.store.evidence().length,
    });
    this.store.db.pragma("wal_checkpoint(TRUNCATE)");
    const text =
      canonical({
        format: "OpenForensic-manifest-v1",
        case: this.info,
        sealedUtc: new Date().toISOString(),
        toolVersion: "0.1.0",
        runtime: process.versions,
        evidence: this.store.evidence(),
        deviceProfiles: this.audit
          .read()
          .filter((e) => e.action === "device_profile")
          .map((e) => e.details),
        auditHead: head.hash,
        auditEvents: head.sequence,
        caseDatabaseSha256: (await hashFile(join(this.root, "case_store.db")))
          .sha256,
        writeProtection:
          "Application command allowlist only; no hardware write blocker. Live Android services and su may write logs.",
        integrityScope:
          "Hashes prove byte consistency; external preservation of this manifest digest is required to anchor tamper evidence.",
      }) + "\n";
    const path = join(this.root, "evidence_manifest.json");
    writeFileSync(path, text, { flag: "wx", mode: 0o400 });
    writeFileSync(
      join(this.root, "evidence_manifest.sha256"),
      sha256(text) + "\n",
      { flag: "wx", mode: 0o400 },
    );
    chmodSync(path, 0o400);
    this.sealed = true;
    return path;
  }
}
