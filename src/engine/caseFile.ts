import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CallRecord, CaseBundle, CaseSummary, Contact, MediaItem, Message } from "../../shared/types";

export type CaseRecords = {
  summary: CaseSummary;
  messages: Message[];
  calls: CallRecord[];
  contacts: Contact[];
  media: MediaItem[];
};

export function caseFilePath(caseDir: string): string {
  return path.join(caseDir, "case.json");
}

export async function readCaseFile(caseDir: string): Promise<CaseRecords> {
  const text = await readFile(caseFilePath(caseDir), "utf8");
  return JSON.parse(text) as CaseRecords;
}

export async function writeCaseFile(caseDir: string, records: CaseRecords): Promise<void> {
  await writeFile(caseFilePath(caseDir), `${JSON.stringify(records, null, 2)}\n`);
}

export async function replaceCaseRecords(
  caseDir: string,
  records: Pick<CaseRecords, "messages" | "calls" | "contacts" | "media">,
): Promise<void> {
  const current = await readCaseFile(caseDir);
  await writeCaseFile(caseDir, { ...current, ...records });
}

export function bundleFrom(records: CaseRecords, manifest: CaseBundle["manifest"], audit: CaseBundle["audit"]): CaseBundle {
  return { ...records, manifest, audit };
}
