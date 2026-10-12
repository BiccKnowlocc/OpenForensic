import {
  PassThrough,
  Transform,
  type Duplex,
  type TransformCallback,
} from "node:stream";
import { pipeline } from "node:stream/promises";

export interface ShellDiagnostics {
  transport: "adb-shell-v2-raw" | "adb-exec-out-marker";
  remoteExitCode: number | null;
  stderr: string;
  stderrTruncated: boolean;
}
interface ShellConnection {
  socket: Duplex;
  write(data: Buffer): unknown;
  parser: {
    readAscii(bytes: number): PromiseLike<string>;
    readError(): PromiseLike<never>;
    raw(): Duplex;
  };
}

// Shell v2 packets have a one-byte channel and a uint32 little-endian length.
// Decode the raw socket directly: Windows adb shell's stdout can translate LF
// to CRLF even without a PTY. Protocol framing must never enter evidence files.
export class ShellV2Decoder extends Transform {
  private header = Buffer.alloc(5);
  private headerBytes = 0;
  private remaining = 0;
  private channel = 0;
  private errors = Buffer.alloc(0);
  private errorBytes = 0;
  exitCode: number | null = null;
  diagnostics(): ShellDiagnostics {
    return {
      transport: "adb-shell-v2-raw",
      remoteExitCode: this.exitCode,
      stderr: this.errors.toString("utf8").trim(),
      stderrTruncated: this.errorBytes > this.errors.length,
    };
  }
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (!this.remaining) {
          if (this.exitCode !== null)
            throw new Error(
              "Android shell sent data after its completion status.",
            );
          const count = Math.min(5 - this.headerBytes, chunk.length - offset);
          chunk.copy(this.header, this.headerBytes, offset, offset + count);
          this.headerBytes += count;
          offset += count;
          if (this.headerBytes < 5) break;
          this.channel = this.header[0];
          this.remaining = this.header.readUInt32LE(1);
          this.headerBytes = 0;
          if (![1, 2, 3].includes(this.channel))
            throw new Error(
              `Unexpected Android shell output channel ${this.channel}.`,
            );
          if (
            this.remaining > 16 * 1024 * 1024 ||
            (this.channel === 3 && this.remaining !== 1)
          )
            throw new Error("Invalid Android shell packet length.");
          if (!this.remaining) continue;
        }
        const count = Math.min(this.remaining, chunk.length - offset);
        if (!count) break;
        const bytes = chunk.subarray(offset, offset + count);
        if (this.channel === 1) this.push(bytes);
        else if (this.channel === 2) {
          this.errorBytes += count;
          this.errors = Buffer.concat([this.errors, bytes]).subarray(-16384);
        } else this.exitCode = bytes[0];
        this.remaining -= count;
        offset += count;
      }
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
  _flush(callback: TransformCallback): void {
    const detail = this.diagnostics().stderr;
    const suffix = detail ? ` Android reported: ${detail}` : "";
    if (this.headerBytes || this.remaining)
      callback(
        new Error(
          `Android shell packet was interrupted; capture is incomplete.${suffix}`,
        ),
      );
    else if (this.exitCode === null)
      callback(
        new Error(
          `Android connection ended without a completion status; capture is incomplete.${suffix}`,
        ),
      );
    else callback();
  }
}

export function rawShellStream(
  openTransport: () => PromiseLike<ShellConnection>,
  command: string,
  signal?: AbortSignal,
  handshakeTimeout = 15000,
) {
  const controller = new AbortController();
  const effective = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  const stream = new PassThrough({ highWaterMark: 1024 * 1024 });
  const decoder = new ShellV2Decoder();
  let connection: ShellConnection | null = null;
  let payloadFinished = false;
  stream.on("error", () => {});
  stream.once("close", () => {
    if (!stream.readableEnded && !effective.aborted)
      controller.abort(
        new Error("Evidence stream closed before acquisition finished."),
      );
  });
  const completion = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      effective.throwIfAborted();
      timer = setTimeout(
        () =>
          controller.abort(new Error("Android stream handshake timed out.")),
        handshakeTimeout,
      );
      const interrupted = new Promise<never>((_resolve, reject) => {
        abort = () => {
          connection?.socket.destroy(
            effective.reason instanceof Error ? effective.reason : undefined,
          );
          reject(effective.reason ?? new Error("Android stream cancelled."));
        };
        effective.addEventListener("abort", abort, { once: true });
      });
      const opening = Promise.resolve(openTransport());
      void opening.then(
        (value) => {
          if (effective.aborted) value.socket.destroy();
        },
        () => {},
      );
      connection = await Promise.race([opening, interrupted]);
      connection.socket.on("error", () => {});
      effective.throwIfAborted();
      const service = Buffer.from(`shell,v2,raw:${command}`, "utf8");
      if (service.length > 65535)
        throw new Error("Android command exceeds the service size limit.");
      connection.write(
        Buffer.concat([
          Buffer.from(service.length.toString(16).padStart(4, "0")),
          service,
        ]),
      );
      const reply = await Promise.race([
        Promise.resolve(connection.parser.readAscii(4)),
        interrupted,
      ]);
      if (reply === "FAIL")
        await Promise.race([
          Promise.resolve(connection.parser.readError()),
          interrupted,
        ]);
      if (reply !== "OKAY")
        throw new Error("Android refused the raw shell v2 stream.");
      clearTimeout(timer);
      // Acquisition supplies no input; explicitly close remote stdin without
      // closing the socket that carries evidence and the remote exit packet.
      connection.write(Buffer.from([4, 0, 0, 0, 0]));
      await pipeline(connection.parser.raw(), decoder, stream, {
        signal: effective,
      });
      payloadFinished = true;
      const detail = decoder.diagnostics().stderr;
      if (decoder.exitCode !== 0)
        throw new Error(
          `Android read command returned exit ${decoder.exitCode}: ${detail || "command failed or access was denied"}. Captured bytes were retained.`,
        );
    } finally {
      clearTimeout(timer);
      if (abort) effective.removeEventListener("abort", abort);
      connection?.socket.destroy();
    }
  })();
  void completion.catch((error) => {
    if (!payloadFinished && !stream.destroyed)
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  return {
    stream,
    completion,
    stop: () => controller.abort(new Error("Android stream stopped.")),
    command,
    diagnostics: () => decoder.diagnostics(),
  };
}
