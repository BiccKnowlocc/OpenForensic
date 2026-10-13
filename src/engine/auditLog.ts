import { randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { AuditEvent, AuditLevel } from "../../shared/types";

export function auditPath(caseDir: string): string {
  return path.join(caseDir, "audit.jsonl");
}

export async function appendAudit(
  caseDir: string,
  event: { action: string; detail: string; level?: AuditLevel; at?: string },
): Promise<AuditEvent> {
  const full: AuditEvent = {
    id: randomBytes(8).toString("hex"),
    at: event.at ?? new Date().toISOString(),
    action: event.action,
    detail: event.detail,
    level: event.level ?? "info",
  };
  await appendFile(auditPath(caseDir), `${JSON.stringify(full)}\n`, { encoding: "utf8", flag: "a" });
  return full;
}

export async function readAudit(caseDir: string): Promise<AuditEvent[]> {
  try {
    const text = await readFile(auditPath(caseDir), "utf8");
    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AuditEvent);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
