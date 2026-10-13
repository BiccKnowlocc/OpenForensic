import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatCallDump, formatContactDump, formatSmsDump } from "../shared/formatDump";
import {
  SAMPLE_ID,
  sampleAcquiredAt,
  sampleCalls,
  sampleContacts,
  sampleCreatedAt,
  sampleFileTexts,
  sampleMessages,
  sampleOwner,
} from "../shared/sampleSource";
import type { AuditEvent, CaseBundle, EvidenceManifest, ManifestItem, MediaItem } from "../shared/types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function digest(text: string) {
  return {
    md5: createHash("md5").update(text).digest("hex"),
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text),
  };
}

function item(sourcePath: string, localPath: string, text: string, error?: string): ManifestItem {
  const hashes = digest(text);
  return {
    sourcePath,
    localPath,
    ...hashes,
    acquiredAt: sampleAcquiredAt,
    status: error ? "failed" : "hashed",
    ...(error ? { error } : {}),
  };
}

const smsText = formatSmsDump(sampleMessages);
const callText = formatCallDump(sampleCalls);
const contactText = formatContactDump(sampleContacts);

const media: MediaItem[] = Object.entries(sampleFileTexts).map(([id, file]) => {
  const hashes = digest(file.text);
  return {
    id,
    sourcePath: file.sourcePath,
    localPath: file.localPath,
    kind: file.kind,
    note: file.note,
    acquiredAt: sampleAcquiredAt,
    ...hashes,
  };
});

const items: ManifestItem[] = [
  item("content://sms", "raw/sms.txt", smsText),
  item("content://call_log/calls", "raw/calls.txt", callText),
  item("content://contacts/phones", "raw/contacts.txt", contactText),
  ...media.map((file) => {
    const source = Object.values(sampleFileTexts).find((entry) => entry.sourcePath === file.sourcePath);
    return item(file.sourcePath, file.localPath, source?.text ?? "");
  }),
];

const manifest: EvidenceManifest = {
  caseId: SAMPLE_ID,
  operator: "Sample Operator",
  createdAt: sampleCreatedAt,
  device: {
    serial: "SAMPLE",
    model: "Sample Pixel",
    android: "14",
    selinux: "Enforcing",
    rooted: false,
    state: "device",
  },
  items,
};

const audit: AuditEvent[] = [
  { id: "audit-01", at: sampleCreatedAt, action: "case_created", level: "info", detail: "Seeded the Harbor Street sample. This is not an acquisition." },
  { id: "audit-02", at: "2026-10-11T21:01:00.000Z", action: "extraction_started", level: "info", detail: "Sample logical sources written so the viewer works with no phone attached." },
  { id: "audit-03", at: sampleAcquiredAt, action: "source_hashed", level: "info", detail: "content://sms hashed while the raw file was written." },
  { id: "audit-04", at: sampleAcquiredAt, action: "source_hashed", level: "info", detail: "content://call_log/calls hashed while the raw file was written." },
  { id: "audit-05", at: sampleAcquiredAt, action: "source_hashed", level: "info", detail: "content://contacts/phones hashed while the raw file was written." },
  { id: "audit-06", at: sampleAcquiredAt, action: "source_hashed", level: "info", detail: "Shared media placeholders under DCIM, Download, and Recordings hashed while written." },
  { id: "audit-07", at: "2026-10-11T21:04:20.000Z", action: "extraction_completed", level: "info", detail: "Sample extraction finished. No device was attached." },
];

const bundle: CaseBundle = {
  summary: {
    id: SAMPLE_ID,
    name: "Harbor Street sample",
    operator: "Sample Operator",
    createdAt: sampleCreatedAt,
    sample: true,
    status: "open",
    deviceLabel: "Sample Pixel · not a phone",
    ownerName: sampleOwner.name,
    ownerNumber: sampleOwner.number,
  },
  messages: sampleMessages,
  calls: sampleCalls,
  contacts: sampleContacts,
  media,
  manifest,
  audit,
};

const destination = path.join(root, "shared", "sample-case.json");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(bundle, null, 2)}\n`);
console.log(destination);
