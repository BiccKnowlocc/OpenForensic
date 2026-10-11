import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import type { ExtractEvent } from "../../shared/types";
import { appendAudit } from "./auditLog";
import { AdbCommandError, listDevices, runAdb } from "./adb";
import { classifyAdbFailure, failureMessage } from "./classify";

export const WIPE_DIRECTORY = "/sdcard/OpenForensic/free-space-wipe";
export const RESERVE_BYTES = 128 * 1024 * 1024;
export const CHUNK_BYTES = 32 * 1024 * 1024;
const MIN_PARTIAL_BYTES = 1024 * 1024;

export function planFreeSpaceWipe(freeBytes: number): number[] {
  if (!Number.isFinite(freeBytes) || freeBytes <= RESERVE_BYTES) return [];
  const sizes: number[] = [];
  let remaining = freeBytes - RESERVE_BYTES;
  while (remaining >= CHUNK_BYTES) {
    sizes.push(CHUNK_BYTES);
    remaining -= CHUNK_BYTES;
  }
  if (remaining >= MIN_PARTIAL_BYTES) sizes.push(remaining);
  return sizes;
}

export function parseDfAvailableBytes(text: string): number | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerAt = lines.findIndex((line) => /\bavailable\b/i.test(line));
  if (headerAt === -1) return null;
  const availableAt = lines[headerAt].split(/\s+/).findIndex((column) => column.toLowerCase() === "available");
  if (availableAt === -1) return null;
  const data = lines.slice(headerAt + 1);
  const last = data[data.length - 1];
  if (!last) return null;
  const value = Number(last.split(/\s+/)[availableAt]);
  if (!Number.isFinite(value) || value < 0) return null;
  return value * 1024;
}

export function assertSafeWipeTarget(target: string): void {
  if (target.includes("..") || target.includes("\0")) {
    throw new Error("Refusing a wipe path that leaves the free-space folder.");
  }
  const allowed = target === WIPE_DIRECTORY || target.startsWith(`${WIPE_DIRECTORY}/`);
  if (!allowed) throw new Error("Refusing a wipe path outside /sdcard/OpenForensic/free-space-wipe.");
  if (target.includes("/dev/block") || target.includes("/dev/mmc")) {
    throw new Error("Refusing a block-device path.");
  }
}

function chunkPath(index: number): string {
  return `${WIPE_DIRECTORY}/chunk-${String(index + 1).padStart(5, "0")}.bin`;
}

export async function runFreeSpaceWipe(options: {
  caseDir: string;
  serial: string;
  onEvent: (event: ExtractEvent) => void;
  shouldStop: () => boolean;
}): Promise<{ ok: boolean; message: string }> {
  const { caseDir, serial, onEvent, shouldStop } = options;
  try {
    await ensurePresent(serial);
    const df = await runAdb(["-s", serial, "shell", "df", "-k", "/sdcard"], 15000);
    const failure = classifyAdbFailure(`${df.stderr}\n${df.stdout}`);
    if (df.code !== 0 || failure === "permission" || failure === "encrypted" || failure === "disconnect") {
      throw new AdbCommandError(failure ?? "other", df.stderr || df.stdout || "df failed", df);
    }
    const freeBytes = parseDfAvailableBytes(df.stdout);
    if (freeBytes === null) throw new AdbCommandError("other", "Could not read free space on /sdcard.", df);
    const sizes = planFreeSpaceWipe(freeBytes);
    await appendAudit(caseDir, {
      action: "wipe_started",
      detail: `Free space ${freeBytes} bytes. Writing ${sizes.length} junk files under ${WIPE_DIRECTORY}, leaving ${RESERVE_BYTES} bytes free.`,
    });
    onEvent({ type: "log", message: `${sizes.length} junk files planned. ${RESERVE_BYTES} bytes stay free.` });
    if (sizes.length === 0) {
      const message = "Free space is already within the 128 MB reserve. Nothing was written.";
      await appendAudit(caseDir, { action: "wipe_skipped", detail: message });
      return { ok: true, message };
    }
    const mkdir = await runAdb(["-s", serial, "shell", "mkdir", "-p", WIPE_DIRECTORY], 15000);
    const mkdirFailure = classifyAdbFailure(`${mkdir.stderr}\n${mkdir.stdout}`);
    if (mkdir.code !== 0 || mkdirFailure === "permission" || mkdirFailure === "encrypted" || mkdirFailure === "disconnect") {
      throw new AdbCommandError(mkdirFailure ?? "permission", mkdir.stderr || mkdir.stdout || "mkdir failed", mkdir);
    }
    let written = 0;
    for (let index = 0; index < sizes.length; index += 1) {
      if (shouldStop()) return stopEarly(caseDir, onEvent, written);
      await ensurePresent(serial);
      const remote = chunkPath(index);
      assertSafeWipeTarget(remote);
      onEvent({ type: "log", source: "wipe", status: "reading", message: `Writing ${remote} (${sizes[index]} bytes).` });
      await writeJunkFile(serial, remote, sizes[index], shouldStop);
      written += sizes[index];
    }
    const message = `Wrote ${written} bytes of junk files to ${WIPE_DIRECTORY}. About ${RESERVE_BYTES} bytes were left free.`;
    await appendAudit(caseDir, { action: "wipe_completed", detail: message });
    onEvent({ type: "done", message });
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof AdbCommandError ? failureMessage(error.kind, WIPE_DIRECTORY) : error instanceof Error ? error.message : "Free-space wipe failed.";
    await appendAudit(caseDir, { action: "wipe_failed", level: "error", detail: message });
    onEvent({ type: "error", status: "stopped", message });
    return { ok: false, message };
  }
}

export async function removeWipeFiles(options: {
  caseDir: string;
  serial: string;
}): Promise<{ ok: boolean; message: string }> {
  assertSafeWipeTarget(WIPE_DIRECTORY);
  try {
    const result = await runAdb(["-s", options.serial, "shell", "rm", "-rf", WIPE_DIRECTORY], 20000);
    const failure = classifyAdbFailure(`${result.stderr}\n${result.stdout}`);
    if (result.code !== 0 || failure === "permission" || failure === "encrypted" || failure === "disconnect") {
      throw new AdbCommandError(failure ?? "other", result.stderr || result.stdout || "rm failed", result);
    }
    const message = `Removed ${WIPE_DIRECTORY}. The junk files are gone. Deleted data they overwrote is not restored.`;
    await appendAudit(options.caseDir, { action: "wipe_removed", detail: message });
    return { ok: true, message };
  } catch (error) {
    const message = error instanceof AdbCommandError ? failureMessage(error.kind, WIPE_DIRECTORY) : error instanceof Error ? error.message : "Could not remove the wipe files.";
    await appendAudit(options.caseDir, { action: "wipe_remove_failed", level: "error", detail: message });
    return { ok: false, message };
  }
}

async function ensurePresent(serial: string) {
  const devices = await listDevices();
  if (!devices.some((device) => device.serial === serial && device.state === "device")) {
    throw new AdbCommandError("disconnect", "USB device disappeared.", { code: 1, stdout: "", stderr: "device offline" });
  }
}

async function stopEarly(caseDir: string, onEvent: (event: ExtractEvent) => void, written: number) {
  const message = `Wipe stopped. ${written} bytes were already written under ${WIPE_DIRECTORY}.`;
  await appendAudit(caseDir, { action: "wipe_stopped", level: "error", detail: message });
  onEvent({ type: "error", status: "stopped", message });
  return { ok: false, message };
}

function writeJunkFile(serial: string, remotePath: string, size: number, shouldStop: () => boolean): Promise<void> {
  assertSafeWipeTarget(remotePath);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const child = spawn("adb", ["-s", serial, "shell", `cat > '${remotePath}'`], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(error));
    const slice = 1024 * 1024;
    let sent = 0;
    const pump = () => {
      if (shouldStop()) {
        child.kill("SIGKILL");
        finish(new AdbCommandError("disconnect", "USB device disappeared during the wipe.", { code: 1, stdout: "", stderr }));
        return;
      }
      while (sent < size) {
        const next = Math.min(slice, size - sent);
        const ok = child.stdin.write(randomBytes(next));
        sent += next;
        if (!ok) {
          child.stdin.once("drain", pump);
          return;
        }
      }
      child.stdin.end();
    };
    child.on("close", (code) => {
      const failure = classifyAdbFailure(stderr);
      if ((code ?? 1) !== 0 || failure === "permission" || failure === "encrypted" || failure === "disconnect") {
        finish(new AdbCommandError(failure ?? "other", stderr || `Could not write ${remotePath}`, { code: code ?? 1, stdout: "", stderr }));
        return;
      }
      finish();
    });
    pump();
  });
}
