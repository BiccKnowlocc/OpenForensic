import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { DeviceFingerprint } from "../../shared/types";
import { classifyAdbFailure, type FailureKind } from "./classify";
import { createHashTransform, type Digests } from "./hashStream";

export type AdbResult = { code: number; stdout: string; stderr: string };

export class AdbCommandError extends Error {
  constructor(
    public kind: FailureKind,
    message: string,
    public result: AdbResult,
  ) {
    super(message);
    this.name = "AdbCommandError";
  }
}

const quoted = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

export function runAdb(args: string[], timeoutMs = 20000): Promise<AdbResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("adb", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`adb timed out: adb ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function adbAvailable(): Promise<boolean> {
  try {
    const result = await runAdb(["version"], 5000);
    return result.code === 0;
  } catch {
    return false;
  }
}

export function parseDeviceList(text: string): DeviceFingerprint[] {
  const devices: DeviceFingerprint[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("List of devices")) continue;
    const match = line.match(/^(\S+)\s+(device|unauthorized|offline)\b/);
    if (!match) continue;
    const model = line.match(/\bmodel:(\S+)/)?.[1]?.replaceAll("_", " ") ?? "";
    devices.push({
      serial: match[1],
      model,
      android: "",
      selinux: "",
      rooted: false,
      state: match[2] as DeviceFingerprint["state"],
    });
  }
  return devices;
}

export async function listDevices(): Promise<DeviceFingerprint[]> {
  const result = await runAdb(["devices", "-l"]);
  if (result.code !== 0) {
    throw new AdbCommandError(classifyAdbFailure(`${result.stderr}\n${result.stdout}`) ?? "other", result.stderr || result.stdout || "adb devices failed", result);
  }
  return parseDeviceList(result.stdout);
}

async function prop(serial: string, name: string): Promise<string> {
  const result = await runAdb(["-s", serial, "shell", "getprop", name], 8000);
  return result.stdout.trim();
}

export async function fingerprintDevice(serial: string): Promise<DeviceFingerprint> {
  const [model, android, selinux, id] = await Promise.all([
    prop(serial, "ro.product.model"),
    prop(serial, "ro.build.version.release"),
    runAdb(["-s", serial, "shell", "getenforce"], 8000).then((result) => result.stdout.trim() || result.stderr.trim()),
    runAdb(["-s", serial, "shell", "id"], 8000).then((result) => result.stdout.trim()),
  ]);
  return {
    serial,
    model: model || "Unknown model",
    android: android || "unknown",
    selinux: selinux || "unknown",
    rooted: /\buid=0\b/.test(id),
    state: "device",
  };
}

export function watchDevice(serial: string, onLost: () => void, intervalMs = 2000): () => void {
  let stopped = false;
  const timer = setInterval(() => {
    void listDevices()
      .then((devices) => {
        if (stopped) return;
        const live = devices.some((device) => device.serial === serial && device.state === "device");
        if (!live) onLost();
      })
      .catch(() => {
        if (!stopped) onLost();
      });
  }, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

export async function contentQuery(serial: string, uri: string): Promise<AdbResult> {
  return runAdb(["-s", serial, "shell", "content", "query", "--uri", uri], 30000);
}

export async function writeCommandHashed(result: AdbResult, destPath: string): Promise<Digests> {
  const { writeHashed } = await import("./hashStream");
  return writeHashed(result.stdout, destPath);
}

export function assertCommandOk(result: AdbResult, source: string): void {
  const kind = classifyAdbFailure(`${result.stderr}\n${result.stdout}`);
  if (result.code !== 0 || (kind && kind !== "other" && !/no result found/i.test(result.stdout))) {
    const resolved = kind ?? "other";
    if (/no result found/i.test(result.stdout) && result.code === 0) return;
    throw new AdbCommandError(resolved, result.stderr || result.stdout || `${source} failed`, result);
  }
}

export type ListedFile = { remotePath: string; size: number };

export function parseFindListing(text: string, root: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(root) && !line.endsWith(":"));
}

export async function listRemoteFiles(serial: string, root: string): Promise<string[]> {
  const result = await runAdb(["-s", serial, "shell", "find", root, "-type", "f"], 20000);
  const kind = classifyAdbFailure(`${result.stderr}\n${result.stdout}`);
  if (result.code !== 0 || kind === "permission" || kind === "encrypted" || kind === "disconnect") {
    throw new AdbCommandError(kind ?? "other", result.stderr || result.stdout || `Cannot list ${root}`, result);
  }
  return parseFindListing(result.stdout, root).slice(0, 100);
}

export async function pullHashed(serial: string, remotePath: string, destPath: string, shouldStop: () => boolean): Promise<Digests> {
  await mkdir(path.dirname(destPath), { recursive: true });
  if (shouldStop()) throw new AdbCommandError("disconnect", "USB device disappeared before the pull.", { code: 1, stdout: "", stderr: "device offline" });
  const child = spawn("adb", ["-s", serial, "exec-out", `cat ${quoted(remotePath)}`], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const hasher = createHashTransform();
  const stopTimer = setInterval(() => {
    if (shouldStop()) child.kill("SIGKILL");
  }, 500);
  try {
    await pipeline(child.stdout, hasher.transform, createWriteStream(destPath));
  } finally {
    clearInterval(stopTimer);
  }
  const code = await new Promise<number>((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once("close", (value) => resolve(value ?? 1));
  });
  if (shouldStop()) {
    throw new AdbCommandError("disconnect", "USB device disappeared during the pull.", { code, stdout: "", stderr });
  }
  const kind = classifyAdbFailure(stderr);
  if (code !== 0 || kind === "permission" || kind === "encrypted" || kind === "disconnect") {
    throw new AdbCommandError(kind ?? "other", stderr || `Pull failed for ${remotePath}`, { code, stdout: "", stderr });
  }
  return hasher.digests();
}

export function stdoutStream(text: string): Readable {
  return Readable.from([Buffer.from(text)]);
}
