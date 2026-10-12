import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { writeHashed } from "./hashStream";
import { emptyManifest, addManifestItem } from "./manifest";
import { verifyCaseFiles } from "./verifyCase";

test("reopening a case checks saved files against the manifest", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "of-verify-"));
  try {
    await mkdir(path.join(root, "raw"), { recursive: true });
    const digests = await writeHashed("sms row", path.join(root, "raw/sms.txt"));
    const { writeManifest } = await import("./manifest");
    await writeManifest(root, emptyManifest("case", "Ada", "2026-01-01T00:00:00.000Z"));
    await addManifestItem(root, {
      sourcePath: "content://sms",
      localPath: "raw/sms.txt",
      ...digests,
      acquiredAt: "2026-01-01T00:01:00.000Z",
      status: "hashed",
    });
    const match = await verifyCaseFiles(root);
    assert.equal(match.matches, 1);
    assert.equal(match.mismatches, 0);
    await writeFile(path.join(root, "raw/sms.txt"), "changed");
    const differ = await verifyCaseFiles(root);
    assert.equal(differ.mismatches, 1);
    assert.match(differ.message, /differ/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
