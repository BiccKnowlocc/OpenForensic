import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createHash, randomUUID } from "node:crypto";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
import { AndroidSanitizationTransport } from "../src/main/sanitization/transport";
import { DeviceBridge } from "../src/main/adb/client";
import type { SanitizationDevice } from "../src/shared/types";

const device: SanitizationDevice = {
  serial: "SYNTHETIC",
  manufacturer: "Fixture",
  model: "Fixture",
  hardware: "fixture",
  fingerprint: "fixture",
  androidVersion: "15",
  encryptionState: "encrypted",
  encryptionType: "file",
  storageRoot: "/storage/emulated/0",
  filesystem: "/dev/fuse",
  totalBytes: 10000000000,
  freeBytes: 5000000000,
  battery: { level: 90, powered: true, temperatureC: 25 },
};
function childFor(
  args: string[],
  receive: (buffer: Buffer) => void,
  remoteExit: number,
) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: PassThrough;
    stderr: PassThrough;
    kill(): boolean;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      receive(Buffer.from(chunk));
      callback();
    },
    final(callback) {
      const marker = /OPENFORENSIC_EXIT_[a-f0-9]+/.exec(args.at(-1)!)![0];
      child.stdout.end(`\n${marker}:${remoteExit}\n`);
      child.stderr.end();
      callback();
      child.emit("close", 0);
    },
  });
  child.kill = () => {
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
    return true;
  };
  return child;
}
describe("binary cleanup transport", () => {
  it("uses bidirectional non-PTY ADB shell, streams bounded random bytes, and verifies remote completion", async () => {
    const buffers: Buffer[] = [];
    let invocation: string[] = [];
    mocks.spawn.mockImplementation((_executable: string, args: string[]) => {
      invocation = args;
      return childFor(args, (b) => buffers.push(b), 0);
    });
    const transport = new AndroidSanitizationTransport(
      new DeviceBridge("synthetic-adb"),
    );
    const progress: number[] = [];
    const hash = await transport.write(
      device,
      randomUUID(),
      1,
      1024 * 1024,
      (bytes) => progress.push(bytes),
      new AbortController().signal,
    );
    const data = Buffer.concat(buffers);
    expect(data.length).toBe(1024 * 1024);
    expect(buffers.every((b) => b.length <= 256 * 1024)).toBe(true);
    expect(hash).toBe(createHash("sha256").update(data).digest("hex"));
    expect(invocation.slice(6, 8)).toEqual(["shell", "-T"]);
    expect(invocation.at(-1)).toContain("conv=excl,fsync");
    expect(invocation.at(-1)).not.toContain("/dev/block");
    expect(progress.at(-1)).toBe(data.length);
  });
  it("rejects a remote write failure even when the local ADB process exits successfully", async () => {
    mocks.spawn.mockImplementation((_executable: string, args: string[]) =>
      childFor(args, () => {}, 1),
    );
    const transport = new AndroidSanitizationTransport(
      new DeviceBridge("synthetic-adb"),
    );
    await expect(
      transport.write(
        device,
        randomUUID(),
        1,
        1024,
        () => {},
        new AbortController().signal,
      ),
    ).rejects.toThrow(/exit 1/);
  });
  it("refuses an already-cancelled operation before launching a writer", async () => {
    mocks.spawn.mockClear();
    const abort = new AbortController();
    abort.abort(new Error("cancelled"));
    const transport = new AndroidSanitizationTransport(
      new DeviceBridge("synthetic-adb"),
    );
    await expect(
      transport.write(device, randomUUID(), 1, 1024, () => {}, abort.signal),
    ).rejects.toThrow(/cancelled/);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
