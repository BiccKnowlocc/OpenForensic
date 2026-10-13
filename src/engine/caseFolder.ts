import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sampleBundle from "../../shared/sample-case.json";
import { sampleFileTexts } from "../../shared/sampleSource";
import { formatCallDump, formatContactDump, formatSmsDump } from "../../shared/formatDump";
import type { CaseBundle, CaseSummary } from "../../shared/types";
import { appendAudit, readAudit } from "./auditLog";
import { bundleFrom, readCaseFile, writeCaseFile, type CaseRecords } from "./caseFile";
import { writeHashed } from "./hashStream";
import { emptyManifest, readManifest, writeManifest } from "./manifest";
import { replaceMessages } from "../db/viewer";

const ID_PATTERN = /^[a-z0-9-]+$/;

export function assertCaseId(id: string): void {
  if (!ID_PATTERN.test(id)) throw new Error("Case id is not valid.");
}

export async function createCase(root: string, input: { name: string; operator: string }): Promise<CaseSummary> {
  const name = input.name.trim();
  const operator = input.operator.trim();
  if (!name || !operator) throw new Error("Case name and operator are required.");
  const id = `${slug(name)}-${randomBytes(3).toString("hex")}`;
  const caseDir = path.join(root, id);
  const createdAt = new Date().toISOString();
  const summary: CaseSummary = {
    id,
    name,
    operator,
    createdAt,
    sample: false,
    status: "open",
    deviceLabel: "No device yet",
    ownerName: "This phone",
    ownerNumber: "",
  };
  await mkdir(path.join(caseDir, "raw"), { recursive: true });
  await mkdir(path.join(caseDir, "files"), { recursive: true });
  const records: CaseRecords = { summary, messages: [], calls: [], contacts: [], media: [] };
  await writeCaseFile(caseDir, records);
  await writeManifest(caseDir, emptyManifest(id, operator, createdAt));
  await appendAudit(caseDir, { action: "case_created", detail: `${operator} created ${name}.` });
  await replaceMessages(path.join(caseDir, "case_store.db"), []);
  return summary;
}

export async function seedSampleCase(root: string): Promise<string> {
  const bundle = sampleBundle as CaseBundle;
  const caseDir = path.join(root, bundle.summary.id);
  await mkdir(path.join(caseDir, "raw"), { recursive: true });
  await writeCaseFile(caseDir, {
    summary: bundle.summary,
    messages: bundle.messages,
    calls: bundle.calls,
    contacts: bundle.contacts,
    media: bundle.media,
  });
  await writeHashed(formatSmsDump(bundle.messages), path.join(caseDir, "raw/sms.txt"));
  await writeHashed(formatCallDump(bundle.calls), path.join(caseDir, "raw/calls.txt"));
  await writeHashed(formatContactDump(bundle.contacts), path.join(caseDir, "raw/contacts.txt"));
  for (const file of Object.values(sampleFileTexts)) {
    await writeHashed(file.text, path.join(caseDir, file.localPath));
  }
  await writeManifest(caseDir, bundle.manifest);
  await writeFile(path.join(caseDir, "audit.jsonl"), bundle.audit.map((event) => JSON.stringify(event)).join("\n") + "\n");
  await replaceMessages(path.join(caseDir, "case_store.db"), bundle.messages);
  return caseDir;
}

export async function listCaseSummaries(root: string): Promise<CaseSummary[]> {
  const { readdir } = await import("node:fs/promises");
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const summaries: CaseSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const records = await readCaseFile(path.join(root, entry.name));
      summaries.push(records.summary);
    } catch {
      continue;
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function openCase(root: string, id: string): Promise<CaseBundle> {
  assertCaseId(id);
  const caseDir = path.join(root, id);
  const records = await readCaseFile(caseDir);
  const manifest = await readManifest(caseDir);
  const audit = await readAudit(caseDir);
  return bundleFrom(records, manifest, audit);
}

export async function openCaseDirectory(folder: string): Promise<CaseBundle> {
  const records = await readCaseFile(folder);
  assertCaseId(records.summary.id);
  const manifest = await readManifest(folder);
  const audit = await readAudit(folder);
  return bundleFrom(records, manifest, audit);
}

export async function archiveCase(root: string, id: string): Promise<void> {
  assertCaseId(id);
  const caseDir = path.join(root, id);
  const records = await readCaseFile(caseDir);
  if (records.summary.sample) throw new Error("The sample case stays available. Archive a case you created.");
  records.summary = { ...records.summary, status: "archived" };
  await writeCaseFile(caseDir, records);
  await appendAudit(caseDir, { action: "case_archived", detail: "Archived. The manifest and audit log were kept." });
}

export async function ensureSample(root: string): Promise<void> {
  const marker = path.join(root, "harbor-street-sample", "case.json");
  try {
    await readFile(marker, "utf8");
  } catch {
    await seedSampleCase(root);
  }
}

function slug(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (base || "case").slice(0, 40);
}
