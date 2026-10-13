import assert from "node:assert/strict";
import test from "node:test";
import { previewKind, savedFromManifest } from "./savedFiles";
import type { EvidenceManifest } from "./types";

test("a partial manifest lists only hashed files", () => {
  const manifest: EvidenceManifest = {
    caseId: "c",
    operator: "Ada",
    createdAt: "2026-01-01T00:00:00.000Z",
    device: null,
    acquisition: "partial",
    items: [
      { sourcePath: "content://sms", localPath: "raw/sms.txt", md5: "a", sha256: "b", bytes: 4, acquiredAt: "2026-01-01T00:01:00.000Z", status: "hashed" },
      { sourcePath: "/sdcard/DCIM", localPath: "", md5: "", sha256: "", bytes: 0, acquiredAt: "2026-01-01T00:02:00.000Z", status: "failed", error: "USB" },
    ],
  };
  const saved = savedFromManifest(manifest);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].localPath, "raw/sms.txt");
});

test("preview follows the copied file type", () => {
  assert.equal(previewKind("files/DCIM/Camera/IMG_2041.svg"), "image");
  assert.equal(previewKind("files/Recordings/note.m4a"), "audio");
  assert.equal(previewKind("files/Recordings/voice-001.txt"), "other");
});
