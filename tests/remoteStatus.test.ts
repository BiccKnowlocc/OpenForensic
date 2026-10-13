import { expect, it } from "vitest";
import { RemoteStatusStream } from "../src/main/adb/remoteStatus";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
it("strips remote protocol markers even when split across ADB chunks", async () => {
  const marker = "OPENFORENSIC_EXIT_test";
  const payload = Buffer.alloc(1024, 0xff);
  const combined = Buffer.concat([payload, Buffer.from(`\n${marker}:0\n`)]);
  const result: Buffer[] = [];
  await pipeline(
    Readable.from(
      Array.from({ length: Math.ceil(combined.length / 7) }, (_, i) =>
        combined.subarray(i * 7, (i + 1) * 7),
      ),
    ),
    new RemoteStatusStream(marker),
    new Writable({
      write(chunk, _e, cb) {
        result.push(chunk);
        cb();
      },
    }),
  );
  expect(Buffer.concat(result)).toEqual(payload);
});
it("fails on denied commands and USB truncation", async () => {
  for (const tail of ["\nOPENFORENSIC_EXIT_test:1\n", "truncated"]) {
    await expect(
      pipeline(
        Readable.from([Buffer.from(tail)]),
        new RemoteStatusStream("OPENFORENSIC_EXIT_test"),
        new Writable({
          write(_c, _e, cb) {
            cb();
          },
        }),
      ),
    ).rejects.toThrow();
  }
});
