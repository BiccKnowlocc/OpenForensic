import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvidenceManifest, ManifestItem } from "../../shared/types";

export function manifestPath(caseDir: string): string {
  return path.join(caseDir, "evidence_manifest.json");
}

export function emptyManifest(caseId: string, operator: string, createdAt: string): EvidenceManifest {
  return { caseId, operator, createdAt, device: null, items: [] };
}

export async function readManifest(caseDir: string): Promise<EvidenceManifest> {
  const text = await readFile(manifestPath(caseDir), "utf8");
  return JSON.parse(text) as EvidenceManifest;
}

export async function writeManifest(caseDir: string, manifest: EvidenceManifest): Promise<void> {
  await writeFile(manifestPath(caseDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function addManifestItem(caseDir: string, item: ManifestItem): Promise<EvidenceManifest> {
  const manifest = await readManifest(caseDir);
  manifest.items.push(item);
  await writeManifest(caseDir, manifest);
  return manifest;
}
