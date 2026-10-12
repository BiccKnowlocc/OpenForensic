import { Adb } from "@devicefarmer/adbkit";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import { assertReadCommand, probes } from "./policy";
import { remoteRead } from "./remoteStatus";
import type { Device, DeviceProfile } from "../../shared/types";

export function processStream(
  executable: string,
  args: string[],
  signal?: AbortSignal,
): { stream: Readable; completion: Promise<void>; stop(): void } {
  const child: ChildProcessWithoutNullStreams = spawn(executable, args, {
    shell: false,
    windowsHide: true,
    stdio: "pipe",
    signal,
  });
  child.stdin.end();
  let stderr = "";
  let settled = false;
  child.stdout.on("error", () => {});
  child.stderr.on("data", (b: Buffer) => {
    stderr = (stderr + b.toString("utf8")).slice(-16384);
  });
  const completion = new Promise<void>((resolve, reject) => {
    child.once("error", (e) => {
      settled = true;
      child.stdout.destroy(e);
      reject(
        new Error(
          `${executable}: ${e.message}. Check that the tool is installed and on PATH.`,
        ),
      );
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const error = new Error(
          `${executable} exited ${code}: ${stderr.trim() || "USB loss, denied permission, or command failure"}`,
        );
        child.stdout.destroy(error);
        reject(error);
      } else resolve();
    });
  });
  void completion.catch(() => {});
  return {
    stream: child.stdout,
    completion,
    stop: () => {
      child.kill();
    },
  };
}
export async function collect(
  executable: string,
  args: string[],
  max = 2 * 1024 * 1024,
  timeout = 15000,
): Promise<string> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  const proc = processStream(executable, args, abort.signal);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of proc.stream) {
      size += chunk.length;
      if (size > max) {
        proc.stop();
        throw new Error("Command response exceeds the configured size limit.");
      }
      chunks.push(chunk);
    }
    await proc.completion;
    return Buffer.concat(chunks).toString("utf8").trim();
  } finally {
    clearTimeout(timer);
    proc.stop();
  }
}
export class DeviceBridge {
  adbVersion = "unknown";
  readonly adbPath = process.env.OPENFORENSIC_ADB || "adb";
  private client = Adb.createClient({
    bin: this.adbPath,
    host: "127.0.0.1",
    port: 5037,
    timeout: 5000,
  });
  async devices(): Promise<Device[]> {
    this.adbVersion = await collect(this.adbPath, ["version"]);
    const devices = (await this.client.listDevices()) as {
      id: string;
      type: string;
    }[];
    return devices
      .filter((d) => !d.id.includes(":") && !d.id.startsWith("emulator-"))
      .map((d) => ({ id: d.id, state: d.type }));
  }
  async ready(serial: string): Promise<void> {
    const d = (await this.devices()).find((d) => d.id === serial);
    if (!d || d.state !== "device")
      throw new Error(
        `Device ${serial} is ${d?.state ?? "disconnected"}. Authorized USB debugging is required.`,
      );
  }
  stream(serial: string, command: string, signal?: AbortSignal) {
    assertReadCommand(command);
    const remote = remoteRead(command);
    const proc = processStream(
      this.adbPath,
      [
        "-H",
        "127.0.0.1",
        "-P",
        "5037",
        "-s",
        serial,
        "exec-out",
        remote.command,
      ],
      signal,
    );
    remote.trailer.on("error", () => {});
    proc.stream.once("error", (error) => remote.trailer.destroy(error));
    void proc.completion.catch((error) => remote.trailer.destroy(error));
    proc.stream.pipe(remote.trailer);
    return {
      stream: remote.trailer,
      completion: proc.completion,
      stop: proc.stop,
      command: remote.command,
    };
  }
  async probe(serial: string, command: string): Promise<string> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15000);
    const proc = this.stream(serial, command, abort.signal);
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of proc.stream) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024)
          throw new Error("Device probe response too large.");
        chunks.push(chunk);
      }
      await proc.completion;
      return Buffer.concat(chunks).toString("utf8").trim();
    } finally {
      clearTimeout(timer);
      proc.stop();
    }
  }
  async inspect(serial: string): Promise<DeviceProfile> {
    await this.ready(serial);
    const properties: Record<string, string> = {};
    (await this.probe(serial, probes.properties))
      .split("\n")
      .forEach((line) => {
        const m = /^\[([^\]]+)\]: \[(.*)\]/.exec(line);
        if (m) properties[m[1]] = m[2];
      });
    const identity = await this.probe(serial, probes.identity);
    const [rootProbe, selinux] = await Promise.all([
      /uid=0\b/.test(identity)
        ? Promise.resolve("already root shell")
        : this.probe(serial, probes.root).catch(() => "unavailable"),
      this.probe(serial, probes.selinux).catch(() => "unknown"),
    ]);
    const clockStart = Date.now();
    const deviceTime = await this.probe(serial, probes.time).catch(
      () => "unknown",
    );
    const clockEnd = Date.now();
    const hostTimeUtc = new Date((clockStart + clockEnd) / 2).toISOString();
    const time = Date.parse(deviceTime);
    return {
      serial,
      manufacturer: properties["ro.product.manufacturer"] ?? "unknown",
      model: properties["ro.product.model"] ?? "unknown",
      hardware: properties["ro.hardware"] ?? "unknown",
      fingerprint: properties["ro.build.fingerprint"] ?? "unknown",
      androidVersion: properties["ro.build.version.release"] ?? "unknown",
      buildType: properties["ro.build.type"] ?? "unknown",
      root: /uid=0\b/.test(identity) || /uid=0\b/.test(rootProbe),
      rootMethod: /uid=0\b/.test(identity)
        ? "shell"
        : /uid=0\b/.test(rootProbe)
          ? "su"
          : "none",
      selinux,
      deviceTimeUtc: deviceTime,
      hostTimeUtc,
      clockRoundTripMs: clockEnd - clockStart,
      clockOffsetSeconds: Number.isFinite(time)
        ? (time - Date.parse(hostTimeUtc)) / 1000
        : null,
      properties,
    };
  }
  async blocks(serial: string): Promise<string[]> {
    await this.ready(serial);
    const identity = await this.probe(serial, probes.identity);
    return (
      await this.probe(
        serial,
        /uid=0\b/.test(identity) ? probes.blocks.slice(7, -1) : probes.blocks,
      )
    )
      .split(/\r?\n/)
      .filter((n) => /^[A-Za-z0-9_.-]+$/.test(n))
      .map((n) => `/dev/block/by-name/${n}`);
  }
}
