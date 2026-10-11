import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { writeHashed } from "./hashStream";

test("writeHashed stores MD5 and SHA-256 of the bytes written", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "of-hash-"));
  const dest = path.join(dir, "raw", "sms.txt");
  const text = "Row: 0 body=Harbor Street\n";
  const digests = await writeHashed(text, dest);
  const written = await readFile(dest);
  assert.equal(written.toString(), text);
  assert.equal(digests.md5, createHash("md5").update(text).digest("hex"));
  assert.equal(digests.sha256, createHash("sha256").update(text).digest("hex"));
  assert.equal(digests.bytes, Buffer.byteLength(text));
});
