import { randomUUID } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

export function remoteRead(command: string): {
  command: string;
  trailer: RemoteStatusStream;
} {
  const marker = `OPENFORENSIC_EXIT_${randomUUID().replaceAll("-", "")}`;
  return {
    command: `(${command}) 2>/dev/null; of_status=$?; printf '\n${marker}:%s\n' "$of_status"`,
    trailer: new RemoteStatusStream(marker),
  };
}
export class RemoteStatusStream extends Transform {
  private tail = Buffer.alloc(0);
  exitCode: number | null = null;
  constructor(private marker: string) {
    super();
  }
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const bytes = Buffer.concat([this.tail, chunk]);
    if (bytes.length > 128) {
      this.push(bytes.subarray(0, bytes.length - 128));
      this.tail = bytes.subarray(bytes.length - 128);
    } else this.tail = bytes;
    callback();
  }
  _flush(callback: TransformCallback): void {
    const marker = Buffer.from("\n" + this.marker + ":");
    const offset = this.tail.lastIndexOf(marker);
    if (offset < 0) {
      this.push(this.tail);
      callback(
        new Error(
          "Remote command completion marker missing; capture is incomplete.",
        ),
      );
      return;
    }
    this.push(this.tail.subarray(0, offset));
    const exit = this.tail.subarray(offset + marker.length).toString("ascii");
    if (!/^\d{1,3}\n$/.test(exit)) {
      callback(new Error("Invalid remote command completion status."));
      return;
    }
    const code = Number(exit.trim());
    this.exitCode = code;
    callback(
      code === 0
        ? null
        : new Error(
            `Android read command returned exit ${code}; source may be denied or unavailable. Response bytes were retained.`,
          ),
    );
  }
}
