import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import type { Digests } from "./hashStream";
import type { VerifyItem, VerifyReport } from "../../shared/types";
import { appendAudit } from "./auditLog";
import { readManifest } from "./manifest";

export async function verifyCaseFiles(caseDir: string): Promise<VerifyReport> {
  const manifest = await readManifest(caseDir);
  const root = path.resolve(caseDir);
  const items: VerifyItem[] = [];
  for (const item of manifest.items) {
    if (item.status !== "hashed" || !item.localPath) {
      items.push({
        sourcePath: item.sourcePath,
        localPath: item.localPath,
        status: "skipped",
        detail: item.error || "This manifest row is not a saved file.",
      });
      continue;
    }
    const full = path.resolve(root, item.localPath);
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
      items.push({ sourcePath: item.sourcePath, localPath: item.localPath, status: "mismatch", detail: "The path leaves the case folder." });
      continue;
    }
    try {
      const digests = await hashFile(full);
      const same = digests.md5 === item.md5 && digests.sha256 === item.sha256 && digests.bytes === item.bytes;
      items.push({
        sourcePath: item.sourcePath,
        localPath: item.localPath,
        status: same ? "match" : "mismatch",
        detail: same ? "MD5 and SHA-256 match the manifest." : `On disk md5 ${digests.md5} sha256 ${digests.sha256} (${digests.bytes} bytes).`,
      });
    } catch {
      items.push({ sourcePath: item.sourcePath, localPath: item.localPath, status: "missing", detail: "The saved file is not in the case folder." });
    }
  }
  const report: VerifyReport = {
    checkedAt: new Date().toISOString(),
    matches: items.filter((item) => item.status === "match").length,
    mismatches: items.filter((item) => item.status === "mismatch").length,
    missing: items.filter((item) => item.status === "missing").length,
    skipped: items.filter((item) => item.status === "skipped").length,
    items,
    message: "",
  };
  report.message = `${report.matches} match, ${report.mismatches} differ, ${report.missing} missing.`;
  await appendAudit(caseDir, { action: "manifest_checked", detail: report.message });
  return report;
}

function hashFile(filePath: string): Promise<Digests> {
  return new Promise((resolve, reject) => {
    const md5 = createHash("md5");
    const sha256 = createHash("sha256");
    let bytes = 0;
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      md5.update(buffer);
      sha256.update(buffer);
      bytes += buffer.length;
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({ md5: md5.digest("hex"), sha256: sha256.digest("hex"), bytes }));
  });
}
