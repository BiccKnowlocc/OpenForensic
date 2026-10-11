import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type Digests = { md5: string; sha256: string; bytes: number };

export function createHashTransform(): { transform: Transform; digests: () => Digests } {
  const md5 = createHash("md5");
  const sha256 = createHash("sha256");
  let bytes = 0;
  let done = false;
  let result: Digests = { md5: "", sha256: "", bytes: 0 };
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      md5.update(buffer);
      sha256.update(buffer);
      bytes += buffer.length;
      callback(null, buffer);
    },
    flush(callback) {
      result = { md5: md5.digest("hex"), sha256: sha256.digest("hex"), bytes };
      done = true;
      callback();
    },
  });
  return {
    transform,
    digests: () => {
      if (!done) throw new Error("Hash transform has not finished.");
      return result;
    },
  };
}

export async function writeHashed(source: Readable | Buffer | string, destPath: string): Promise<Digests> {
  await mkdir(path.dirname(destPath), { recursive: true });
  const input = typeof source === "string" || Buffer.isBuffer(source)
    ? Readable.from([Buffer.isBuffer(source) ? source : Buffer.from(source)])
    : source;
  const hasher = createHashTransform();
  await pipeline(input, hasher.transform, createWriteStream(destPath));
  return hasher.digests();
}
