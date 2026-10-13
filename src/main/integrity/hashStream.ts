import { createHash } from "node:crypto";
import {
  Transform,
  Writable,
  type TransformCallback,
  type Readable,
} from "node:stream";
import { pipeline } from "node:stream/promises";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";

export interface Digests {
  bytes: number;
  sha256: string;
  md5: string;
}
export class DualHashStream extends Transform {
  private sha = createHash("sha256");
  private legacy = createHash("md5");
  private done: Digests | null = null;
  bytes = 0;
  constructor(private progress: (bytes: number) => void = () => {}) {
    super();
  }
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      this.sha.update(chunk);
      this.legacy.update(chunk);
      this.bytes += chunk.length;
      this.progress(this.bytes);
      callback(null, chunk);
    } catch (error) {
      callback(error as Error);
    }
  }
  digests(): Digests {
    if (!this.done)
      this.done = {
        bytes: this.bytes,
        sha256: this.sha.digest("hex"),
        md5: this.legacy.digest("hex"),
      };
    return this.done;
  }
}
export async function hashFile(path: string): Promise<Digests> {
  const hash = new DualHashStream();
  await pipeline(
    createReadStream(path),
    hash,
    new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  );
  return hash.digests();
}
export async function writeHashed(
  source: Readable,
  destination: string,
  progress: (bytes: number) => void,
  signal?: AbortSignal,
): Promise<Digests> {
  const handle = await open(destination, "wx", 0o600);
  const hash = new DualHashStream(progress);
  const sink = new Writable({
    highWaterMark: 1024 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      void (async () => {
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await handle.write(
            chunk,
            offset,
            chunk.length - offset,
          );
          if (!bytesWritten)
            throw new Error("Evidence destination stopped accepting bytes.");
          offset += bytesWritten;
        }
      })().then(
        () => callback(),
        (error) => callback(error),
      );
    },
  });
  try {
    await pipeline(source, hash, sink, { signal });
    await handle.sync();
    return hash.digests();
  } finally {
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
