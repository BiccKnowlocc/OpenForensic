import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DeviceBridge, processStream } from "../adb/client";
import { remoteRead } from "../adb/remoteStatus";
import {
  createDirectoryCommand,
  writeChunkCommand,
  verifyChunkCommand,
  removeChunkCommand,
  removeDirectoryCommand,
  storageRoot,
  parseStorage,
  parseBattery,
} from "./policy";
import type { SanitizationDevice } from "../../shared/types";

export interface SanitizationTransport {
  assess(serial: string): Promise<SanitizationDevice>;
  create(device: SanitizationDevice, id: string): Promise<void>;
  write(
    device: SanitizationDevice,
    id: string,
    index: number,
    bytes: number,
    sent: (bytes: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
  verify(
    device: SanitizationDevice,
    id: string,
    index: number,
    bytes: number,
    hash: string,
    signal?: AbortSignal,
  ): Promise<void>;
  remove(device: SanitizationDevice, id: string, index: number): Promise<void>;
  finish(device: SanitizationDevice, id: string): Promise<void>;
}

export class AndroidSanitizationTransport implements SanitizationTransport {
  constructor(private bridge: DeviceBridge) {}
  private args(serial: string, command: string, input = false): string[] {
    if (
      !/^[A-Za-z0-9_.-]{1,256}$/.test(serial) ||
      serial.startsWith("emulator-")
    )
      throw new Error("Cleanup requires an authorized USB device.");
    return [
      "-H",
      "127.0.0.1",
      "-P",
      "5037",
      "-s",
      serial,
      ...(input ? ["shell", "-T"] : ["exec-out"]),
      command,
    ];
  }
  private async text(
    serial: string,
    command: string,
    timeout = 15000,
    signal?: AbortSignal,
  ): Promise<string> {
    const abort = new AbortController();
    const timer = setTimeout(
      () => abort.abort(new Error("Device cleanup command timed out.")),
      timeout,
    );
    const remote = remoteRead(command);
    const process = processStream(
      this.bridge.adbPath,
      this.args(serial, remote.command),
      signal ? AbortSignal.any([abort.signal, signal]) : abort.signal,
    );
    remote.trailer.on("error", () => {});
    process.stream.once("error", (error) => remote.trailer.destroy(error));
    void process.completion.catch((error) => remote.trailer.destroy(error));
    process.stream.pipe(remote.trailer);
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of remote.trailer) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024)
          throw new Error("Cleanup probe response exceeds its limit.");
        chunks.push(chunk);
      }
      await process.completion;
      return Buffer.concat(chunks).toString("utf8").trim();
    } catch (error) {
      throw new Error(
        `Sanitization command failed: ${error instanceof Error ? error.message : String(error)}. Check USB authorization, permissions, and Android tools.`,
      );
    } finally {
      clearTimeout(timer);
      process.stop();
      remote.trailer.destroy();
    }
  }
  async assess(serial: string): Promise<SanitizationDevice> {
    await this.bridge.ready(serial);
    const [properties, root, disk, battery, dd] = await Promise.all([
      this.text(serial, "getprop"),
      this.text(serial, "readlink -f /sdcard"),
      this.text(serial, "df -Pk /sdcard"),
      this.text(serial, "dumpsys battery"),
      this.text(serial, "toybox dd --help"),
    ]);
    if (!/\bexcl\b/.test(dd) || !/\bfsync\b/.test(dd))
      throw new Error(
        "This Android build lacks exclusive, durable file creation support. Cleanup is unavailable.",
      );
    const props: Record<string, string> = {};
    for (const line of properties.split("\n")) {
      const m = /^\[([^\]]+)\]: \[(.*)\]/.exec(line);
      if (m) props[m[1]] = m[2];
    }
    if (!props["ro.build.fingerprint"] || !props["ro.product.model"])
      throw new Error(
        "Device identification is incomplete. Cleanup is unavailable.",
      );
    return {
      serial,
      manufacturer: props["ro.product.manufacturer"] || "unknown",
      model: props["ro.product.model"],
      fingerprint: props["ro.build.fingerprint"],
      hardware: props["ro.hardware"] || "unknown",
      androidVersion: props["ro.build.version.release"] || "unknown",
      encryptionState: props["ro.crypto.state"] || "unknown",
      encryptionType: props["ro.crypto.type"] || "unknown",
      storageRoot: storageRoot(root),
      ...parseStorage(disk),
      battery: parseBattery(battery),
    };
  }
  async create(device: SanitizationDevice, id: string): Promise<void> {
    await this.text(
      device.serial,
      createDirectoryCommand(device.storageRoot, id),
    );
  }
  async write(
    device: SanitizationDevice,
    id: string,
    index: number,
    bytes: number,
    sent: (bytes: number) => void,
    signal: AbortSignal,
  ): Promise<string> {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 64 * 1024 * 1024)
      throw new Error("Invalid cleanup chunk size.");
    signal.throwIfAborted();
    const remote = remoteRead(writeChunkCommand(device.storageRoot, id, index));
    const child = spawn(
      this.bridge.adbPath,
      this.args(device.serial, remote.command, true),
      { shell: false, windowsHide: true, stdio: "pipe", signal },
    );
    let stderr = "";
    let lastProgress = Date.now();
    let timedOut = false;
    const timer = setInterval(() => {
      if (Date.now() - lastProgress > 60000) {
        timedOut = true;
        child.kill();
      }
    }, 1000);
    child.stdin.on("error", () => {});
    child.stdout.on("error", () => {});
    child.stderr.on("error", () => {});
    child.stderr.on("data", (buffer: Buffer) => {
      stderr = (stderr + buffer.toString()).slice(-4096);
    });
    const completion = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0 && !timedOut
          ? resolve()
          : reject(
              new Error(
                timedOut
                  ? "Cleanup transfer stalled."
                  : `USB transfer failed (${code}): ${stderr}`,
              ),
            ),
      );
    });
    void completion.catch(() => {});
    remote.trailer.on("error", () => {});
    child.stdout.pipe(remote.trailer);
    const response = (async () => {
      let size = 0;
      for await (const chunk of remote.trailer) {
        size += chunk.length;
        if (size > 4096) throw new Error("Unexpected cleanup command output.");
      }
    })();
    void response.catch(() => child.kill());
    void completion.catch((error) => remote.trailer.destroy(error));
    const hash = createHash("sha256");
    async function* data() {
      let remaining = bytes;
      let total = 0;
      while (remaining > 0) {
        signal.throwIfAborted();
        const buffer = randomBytes(Math.min(256 * 1024, remaining));
        hash.update(buffer);
        remaining -= buffer.length;
        total += buffer.length;
        lastProgress = Date.now();
        sent(total);
        yield buffer;
      }
    }
    try {
      await Promise.all([
        pipeline(Readable.from(data()), child.stdin, { signal }),
        response,
        completion,
      ]);
      return hash.digest("hex");
    } finally {
      clearInterval(timer);
      child.kill();
      remote.trailer.destroy();
    }
  }
  async verify(
    device: SanitizationDevice,
    id: string,
    index: number,
    bytes: number,
    hash: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.text(
      device.serial,
      verifyChunkCommand(device.storageRoot, id, index),
      120000,
      signal,
    );
    const [count, digest] = response.split(/\r?\n/);
    if (Number(count.trim()) !== bytes || digest?.split(/\s+/)[0] !== hash)
      throw new Error(
        "Temporary-file size or SHA-256 readback mismatch. Cleanup stopped.",
      );
  }
  async remove(
    device: SanitizationDevice,
    id: string,
    index: number,
  ): Promise<void> {
    await this.text(
      device.serial,
      removeChunkCommand(device.storageRoot, id, index),
    );
  }
  async finish(device: SanitizationDevice, id: string): Promise<void> {
    await this.text(
      device.serial,
      removeDirectoryCommand(device.storageRoot, id),
    );
  }
}
