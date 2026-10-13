import { describe, expect, it, vi } from "vitest";
import { PassThrough, Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createServer, type Socket } from "node:net";
import { Adb } from "@devicefarmer/adbkit";
import { rawShellStream, ShellV2Decoder } from "../src/main/adb/shellV2";

function packet(channel: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header[0] = channel;
  header.writeUInt32LE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
const exit = (code: number) => packet(3, Buffer.from([code]));
async function decode(bytes: Buffer, width = 7) {
  const result: Buffer[] = [];
  const decoder = new ShellV2Decoder();
  await pipeline(
    Readable.from(
      Array.from({ length: Math.ceil(bytes.length / width) }, (_, index) =>
        bytes.subarray(index * width, (index + 1) * width),
      ),
    ),
    decoder,
    new Writable({
      write(chunk, _encoding, callback) {
        result.push(Buffer.from(chunk));
        callback();
      },
    }),
  );
  return { bytes: Buffer.concat(result), diagnostics: decoder.diagnostics() };
}
function connection(bytes: Buffer, requests: Buffer[]) {
  const socket = new PassThrough();
  return {
    socket,
    write(value: Buffer) {
      requests.push(Buffer.from(value));
      if (value.equals(Buffer.from([4, 0, 0, 0, 0])))
        queueMicrotask(() => socket.end(bytes));
    },
    parser: {
      readAscii: async () => "OKAY",
      readError: async (): Promise<never> => {
        throw new Error("Permission denied");
      },
      raw: () => socket,
    },
  };
}

describe("binary Android shell v2 transport", () => {
  it("uses the actual adbkit transport handshake over a loopback mock server", async () => {
    const payload = Buffer.from([0, 1, 10, 13, 255]);
    const sockets = new Set<Socket>();
    const requests: string[] = [];
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      let buffered = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        if (requests.length >= 2) return;
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length >= 4) {
          const size = Number.parseInt(buffered.subarray(0, 4).toString(), 16);
          if (buffered.length < size + 4) return;
          requests.push(buffered.subarray(4, size + 4).toString());
          buffered = buffered.subarray(size + 4);
          socket.write("OKAY");
          if (requests.length === 2) {
            setImmediate(() =>
              socket.end(Buffer.concat([packet(1, payload), exit(0)])),
            );
            break;
          }
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Mock server did not bind");
      const client = Adb.createClient({
        host: "127.0.0.1",
        port: address.port,
      });
      client.on("error", () => {});
      const proc = rawShellStream(
        () => client.getDevice("synthetic").transport(),
        "id",
      );
      const chunks: Buffer[] = [];
      for await (const chunk of proc.stream) chunks.push(chunk);
      await proc.completion;
      expect(Buffer.concat(chunks)).toEqual(payload);
      expect(requests).toEqual(["host:transport:synthetic", "shell,v2,raw:id"]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("preserves every byte across fragmented frames and keeps stderr out of evidence", async () => {
    const payload = Buffer.from(
      Array.from({ length: 65536 }, (_, i) => i % 256),
    );
    const wire = Buffer.concat([
      packet(1, payload.subarray(0, 30000)),
      packet(2, Buffer.from("tar: Permission denied\n")),
      packet(1, payload.subarray(30000)),
      exit(1),
    ]);
    const result = await decode(wire);
    expect(result.bytes).toEqual(payload);
    expect(result.diagnostics).toEqual({
      transport: "adb-shell-v2-raw",
      remoteExitCode: 1,
      stderr: "tar: Permission denied",
      stderrTruncated: false,
    });
  });
  it("handles a split exit payload and limits retained diagnostics", async () => {
    const result = await decode(
      Buffer.concat([packet(2, Buffer.alloc(65536, 65)), exit(0)]),
      1,
    );
    expect(result.diagnostics.stderr.length).toBe(16384);
    expect(result.diagnostics.stderrTruncated).toBe(true);
    expect(result.diagnostics.remoteExitCode).toBe(0);
  });
  it("rejects missing completion, truncated frames, and data after completion", async () => {
    for (const wire of [
      packet(1, Buffer.from("partial")),
      Buffer.from([1, 4, 0]),
      packet(1, Buffer.from("data")).subarray(0, 7),
      Buffer.concat([exit(0), packet(1, Buffer.from("extra"))]),
    ])
      await expect(decode(wire)).rejects.toThrow(
        /incomplete|interrupted|after/,
      );
  });
  it("rejects unexpected channels and invalid lengths before allocating payloads", async () => {
    for (const wire of [
      Buffer.from([9, 0, 0, 0, 0]),
      Buffer.from([1, 255, 255, 255, 255]),
      Buffer.from([3, 0, 0, 0, 0]),
      Buffer.from([3, 2, 0, 0, 0, 0, 0]),
    ])
      await expect(decode(wire)).rejects.toThrow(/channel|length/);
  });
  it("negotiates raw shell, closes remote stdin, and forwards binary data exactly", async () => {
    const requests: Buffer[] = [];
    const payload = Buffer.from([0, 1, 10, 13, 255]);
    const proc = rawShellStream(
      () =>
        Promise.resolve(
          connection(Buffer.concat([packet(1, payload), exit(0)]), requests),
        ),
      "id",
    );
    const chunks: Buffer[] = [];
    for await (const chunk of proc.stream) chunks.push(chunk);
    await proc.completion;
    expect(Buffer.concat(chunks)).toEqual(payload);
    expect(requests[0].subarray(4).toString()).toBe("shell,v2,raw:id");
    expect(Number.parseInt(requests[0].subarray(0, 4).toString(), 16)).toBe(
      requests[0].length - 4,
    );
    expect(requests[1]).toEqual(Buffer.from([4, 0, 0, 0, 0]));
    expect(proc.diagnostics().remoteExitCode).toBe(0);
  });
  it("retains the entire stdout of a denied command and rejects its completion", async () => {
    const payload = Buffer.alloc(2 * 1024 * 1024, 0xa5);
    const proc = rawShellStream(
      () =>
        Promise.resolve(
          connection(
            Buffer.concat([
              packet(1, payload),
              packet(2, Buffer.from("tar: denied")),
              exit(1),
            ]),
            [],
          ),
        ),
      "tar",
    );
    let bytes = 0;
    for await (const chunk of proc.stream) bytes += chunk.length;
    expect(bytes).toBe(payload.length);
    await expect(proc.completion).rejects.toThrow(/exit 1: tar: denied/);
  });
  it("does not start a command after cancellation and bounds an unresponsive handshake", async () => {
    const abort = new AbortController();
    abort.abort(new Error("Operator cancelled"));
    const opening = vi.fn(() => Promise.resolve(connection(exit(0), [])));
    const cancelled = rawShellStream(opening, "id", abort.signal);
    await expect(cancelled.completion).rejects.toThrow("Operator cancelled");
    expect(opening).not.toHaveBeenCalled();
    const hanging = rawShellStream(
      () => new Promise(() => {}),
      "id",
      undefined,
      30,
    );
    await expect(hanging.completion).rejects.toThrow("handshake timed out");
  });
  it("rejects a refused service and releases its socket", async () => {
    const conn = connection(exit(0), []);
    conn.parser.readAscii = async () => "FAIL";
    const proc = rawShellStream(() => Promise.resolve(conn), "id");
    await expect(proc.completion).rejects.toThrow("Permission denied");
    expect(conn.socket.destroyed).toBe(true);
  });
});
