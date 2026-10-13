import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { hashFile, writeHashed } from "../src/main/integrity/hashStream";

describe("evidence streams", () => {
  it("writes byte-for-byte with two correct hashes and progress under backpressure", async () => {
    const root = await mkdtemp(join(tmpdir(), "openforensic-"));
    const path = join(root, "capture.bin");
    const bytes = Buffer.alloc(4 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const progress: number[] = [];
    try {
      async function* chunks() {
        for (let i = 0; i < bytes.length; i += 8191)
          yield bytes.subarray(i, i + 8191);
      }
      const digest = await writeHashed(Readable.from(chunks()), path, (n) =>
        progress.push(n),
      );
      expect(digest.bytes).toBe(bytes.length);
      expect(digest.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      expect(digest.md5).toBe(createHash("md5").update(bytes).digest("hex"));
      expect(await readFile(path)).toEqual(bytes);
      expect(await hashFile(path)).toEqual(digest);
      expect(progress.at(-1)).toBe(bytes.length);
      await expect(
        writeHashed(Readable.from([Buffer.from("overwrite")]), path, () => {}),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("retains a partial file after source failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "openforensic-"));
    const path = join(root, "partial.bin");
    try {
      async function* interrupted() {
        yield Buffer.from("captured");
        await new Promise((r) => setTimeout(r, 10));
        throw new Error("USB disconnected");
      }
      await expect(
        writeHashed(Readable.from(interrupted()), path, () => {}),
      ).rejects.toThrow("USB disconnected");
      expect((await hashFile(path)).bytes).toBe(8);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
