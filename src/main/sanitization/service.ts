import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  readdirSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { canonical, sha256, AuditLog } from "../integrity/audit";
import type { SanitizationTransport } from "./transport";
import {
  CHUNK_BYTES,
  GIB,
  MAX_TARGET_BYTES,
  reserveBytes,
  safeBattery,
  jobDirectory,
} from "./policy";
import type {
  SanitizationPlan,
  SanitizationJob,
  SanitizationDevice,
} from "../../shared/types";

export const SANITIZATION_LIMITATIONS = [
  "This is a best-effort free-space exercise, not verified permanent erasure or a NIST clear/purge certificate.",
  "Only newly allocated files on primary emulated shared storage are written and removed. Existing files are not selected for deletion.",
  "Private app databases, WALs, reserved space, flash remapping/spare cells, SD cards, eSIMs, cloud backups, and other devices are not sanitized.",
  "A safety reserve remains untouched. Android can independently clear caches or change its data while running; a byte-identical whole-phone state cannot be guaranteed.",
  "Readback verifies the temporary files, not destruction of previous deleted contents. Deleted-data recovery may remain possible.",
];
const idSchema = z.string().uuid();
const deviceSchema = z.object({
  serial: z.string().min(1).max(256),
  manufacturer: z.string(),
  model: z.string(),
  fingerprint: z.string().min(1),
  hardware: z.string(),
  androidVersion: z.string(),
  encryptionState: z.string(),
  encryptionType: z.string(),
  storageRoot: z.string(),
  filesystem: z.string(),
  totalBytes: z.number().safe().positive(),
  freeBytes: z.number().safe().nonnegative(),
  battery: z.object({
    level: z.number(),
    powered: z.boolean(),
    temperatureC: z.number(),
  }),
});
const planSchema = z.object({
  token: idSchema,
  expiresUtc: z.string(),
  device: deviceSchema,
  reserveBytes: z.number().safe().positive(),
  targetBytes: z.number().safe().positive().max(MAX_TARGET_BYTES),
  limitGiB: z.number().min(0).max(512),
  assurance: z.literal("best_effort_only"),
});
const jobSchema = z.object({
  id: idSchema,
  plan: planSchema,
  operator: z.string(),
  authority: z.string(),
  startedUtc: z.string(),
  updatedUtc: z.string(),
  status: z.enum([
    "running",
    "cleaning",
    "complete",
    "cancelled",
    "failed",
    "cleanup_required",
  ]),
  phase: z.string(),
  bytesSent: z.number().safe().nonnegative(),
  bytesVerified: z.number().safe().nonnegative(),
  bytesPerSecond: z.number().nonnegative(),
  lastIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_TARGET_BYTES / CHUNK_BYTES + 1),
  directoryCreated: z.boolean(),
  cleanupComplete: z.boolean(),
  error: z.string().nullable(),
  receiptPath: z.string().nullable(),
});

export class SanitizationService {
  private plans = new Map<string, SanitizationPlan>();
  private controller: AbortController | null = null;
  private task: Promise<void> | null = null;
  recoveryWarning = "";
  constructor(
    private directory: string,
    private transport: SanitizationTransport,
    private emit: (job: SanitizationJob) => void,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      for (const job of this.jobs()) {
        if (job.status === "running" || job.status === "cleaning") {
          job.status = "cleanup_required";
          job.phase = "Previous operation was interrupted";
          job.error =
            "App stopped during cleanup. Reconnect the same device and remove only this job's temporary files.";
          this.save(job);
        }
      }
    } catch (error) {
      this.recoveryWarning = `Saved cleanup records need review. Keep the records intact and inspect local diagnostics. ${String(error)}`;
    }
  }
  get active(): boolean {
    return this.controller !== null;
  }
  async settled(): Promise<void> {
    await this.task;
  }
  private statePath(id: string): string {
    return join(this.directory, `${idSchema.parse(id)}.state.json`);
  }
  private log(id: string): AuditLog {
    return new AuditLog(
      join(this.directory, `${idSchema.parse(id)}.audit.jsonl`),
    );
  }
  private save(job: SanitizationJob): void {
    job.updatedUtc = new Date().toISOString();
    const file = this.statePath(job.id);
    const temporary = file + ".tmp";
    writeFileSync(temporary, canonical(job) + "\n", { mode: 0o600 });
    const fd = openSync(temporary, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, file);
  }
  private publish(job: SanitizationJob): void {
    try {
      this.emit(structuredClone(job));
    } catch {
      /* Device cleanup continues if its display disappears. */
    }
  }
  jobs(): SanitizationJob[] {
    return readdirSync(this.directory)
      .filter((n) => /^[a-f0-9-]{36}\.state\.json$/.test(n))
      .map((n) =>
        jobSchema.parse(
          JSON.parse(readFileSync(join(this.directory, n), "utf8")),
        ),
      )
      .sort((a, b) => b.startedUtc.localeCompare(a.startedUtc));
  }
  private sameDevice(
    expected: SanitizationDevice,
    actual: SanitizationDevice,
  ): void {
    if (
      actual.serial !== expected.serial ||
      actual.fingerprint !== expected.fingerprint ||
      actual.hardware !== expected.hardware ||
      actual.storageRoot !== expected.storageRoot ||
      actual.filesystem !== expected.filesystem ||
      actual.totalBytes !== expected.totalBytes
    )
      throw new Error(
        "Device identity or storage changed. Assess the device again; no new writes are permitted.",
      );
  }
  async prepare(serial: string, limitGiB: number): Promise<SanitizationPlan> {
    if (this.recoveryWarning) throw new Error(this.recoveryWarning);
    if (this.active) throw new Error("A cleanup operation is already running.");
    if (!Number.isFinite(limitGiB) || limitGiB < 0 || limitGiB > 512)
      throw new Error(
        "Cleanup size must be 0 (all safe free space) or at most 512 GiB.",
      );
    const device = await this.transport.assess(serial);
    safeBattery(device.battery);
    const reserve = reserveBytes(device.totalBytes);
    const available =
      Math.floor(
        Math.max(0, device.freeBytes - reserve - CHUNK_BYTES) / (1024 * 1024),
      ) *
      1024 *
      1024;
    const target = Math.floor(
      Math.min(available, limitGiB ? limitGiB * GIB : MAX_TARGET_BYTES),
    );
    if (target < 1024 * 1024)
      throw new Error(
        "Not enough free space above the safety reserve. Existing files will not be removed to make room.",
      );
    const plan: SanitizationPlan = {
      token: randomUUID(),
      expiresUtc: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      device,
      reserveBytes: reserve,
      targetBytes: target,
      limitGiB,
      assurance: "best_effort_only",
    };
    for (const [id, old] of this.plans)
      if (Date.parse(old.expiresUtc) < Date.now()) this.plans.delete(id);
    if (this.plans.size >= 10) this.plans.clear();
    this.plans.set(plan.token, plan);
    return structuredClone(plan);
  }
  plan(token: string): SanitizationPlan {
    const plan = this.plans.get(token);
    if (!plan || Date.parse(plan.expiresUtc) < Date.now())
      throw new Error("Cleanup assessment expired. Assess the device again.");
    return structuredClone(plan);
  }
  async start(input: {
    token: string;
    operator: string;
    authority: string;
    typedSerial: string;
    acknowledged: boolean;
  }): Promise<string> {
    if (this.active) throw new Error("A cleanup operation is already running.");
    const plan = this.plan(input.token);
    if (
      !input.acknowledged ||
      input.typedSerial !== plan.device.serial ||
      !input.operator.trim() ||
      !input.authority.trim()
    )
      throw new Error(
        "Confirm the device serial, operator, authority, and cleanup limits first.",
      );
    const current = await this.transport.assess(plan.device.serial);
    this.sameDevice(plan.device, current);
    safeBattery(current.battery);
    if (current.freeBytes < plan.targetBytes + plan.reserveBytes + CHUNK_BYTES)
      throw new Error("Available space changed. Assess the device again.");
    this.plans.delete(input.token);
    const job: SanitizationJob = {
      id: randomUUID(),
      plan,
      operator: input.operator.trim(),
      authority: input.authority.trim(),
      startedUtc: new Date().toISOString(),
      updatedUtc: new Date().toISOString(),
      status: "running",
      phase: "Creating dedicated temporary files",
      bytesSent: 0,
      bytesVerified: 0,
      bytesPerSecond: 0,
      lastIndex: 0,
      directoryCreated: false,
      cleanupComplete: false,
      error: null,
      receiptPath: null,
    };
    jobDirectory(plan.device.storageRoot, job.id);
    this.save(job);
    this.log(job.id).append("cleanup_authorized", {
      plan,
      operator: job.operator,
      authority: job.authority,
      limitations: SANITIZATION_LIMITATIONS,
    });
    this.controller = new AbortController();
    this.task = this.run(job, this.controller)
      .catch((error) => {
        job.status = "cleanup_required";
        job.phase = "Host storage or audit failure";
        job.error = String(error);
        try {
          this.save(job);
        } catch {
          /* Leave the previous durable checkpoint intact. */
        }
        this.publish(job);
      })
      .finally(() => {
        this.controller = null;
      });
    return job.id;
  }
  cancel(): void {
    this.controller?.abort(new Error("Operator cancelled free-space cleanup."));
  }
  private async removeTemporary(job: SanitizationJob): Promise<void> {
    const current = await this.transport.assess(job.plan.device.serial);
    this.sameDevice(job.plan.device, current);
    for (let index = 1; index <= job.lastIndex; index++)
      await this.transport.remove(job.plan.device, job.id, index);
    await this.transport.finish(job.plan.device, job.id);
    job.cleanupComplete = true;
  }
  private receipt(job: SanitizationJob): void {
    const events = this.log(job.id).verify();
    const path = join(this.directory, `${job.id}-${randomUUID()}.receipt.json`);
    const document = {
      format: "OpenForensic cleanup receipt v1",
      applicationVersion: "0.1.2",
      job: { ...job, receiptPath: null },
      limitations: SANITIZATION_LIMITATIONS,
      assurance: "best_effort_only",
      permanentDeletionVerified: false,
      auditHead: events.at(-1)?.hash ?? "0".repeat(64),
      events,
    };
    const bytes = canonical(document) + "\n";
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
    writeFileSync(path + ".sha256", sha256(bytes) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    job.receiptPath = path;
    this.save(job);
  }
  private async run(
    job: SanitizationJob,
    controller: AbortController,
  ): Promise<void> {
    let outcome: "complete" | "cancelled" | "failed" = "complete";
    try {
      await this.transport.create(job.plan.device, job.id);
      job.directoryCreated = true;
      this.save(job);
      while (job.bytesVerified < job.plan.targetBytes) {
        controller.signal.throwIfAborted();
        const current = await this.transport.assess(job.plan.device.serial);
        this.sameDevice(job.plan.device, current);
        safeBattery(current.battery);
        const bytes = Math.min(
          CHUNK_BYTES,
          job.plan.targetBytes - job.bytesVerified,
        );
        if (current.freeBytes < job.plan.reserveBytes + bytes + CHUNK_BYTES)
          throw new Error(
            "Free space fell below the safety threshold. Temporary files will be removed.",
          );
        job.lastIndex++;
        this.save(job);
        job.phase = "Writing new temporary files";
        const base = job.bytesVerified;
        const started = Date.now();
        let notified = 0;
        const hash = await this.transport.write(
          job.plan.device,
          job.id,
          job.lastIndex,
          bytes,
          (sent) => {
            job.bytesSent = base + sent;
            job.bytesPerSecond =
              sent / Math.max(0.001, (Date.now() - started) / 1000);
            if (Date.now() - notified > 250) {
              notified = Date.now();
              this.publish(job);
            }
          },
          controller.signal,
        );
        controller.signal.throwIfAborted();
        job.phase = "Verifying temporary-file bytes";
        job.bytesPerSecond = 0;
        this.publish(job);
        await this.transport.verify(
          job.plan.device,
          job.id,
          job.lastIndex,
          bytes,
          hash,
          controller.signal,
        );
        job.bytesVerified += bytes;
        job.bytesSent = job.bytesVerified;
        this.log(job.id).append("temporary_file_verified", {
          index: job.lastIndex,
          bytes,
          sha256: hash,
        });
        this.save(job);
        this.publish(job);
      }
    } catch (error) {
      outcome = controller.signal.aborted ? "cancelled" : "failed";
      job.error = error instanceof Error ? error.message : String(error);
    }
    job.status = "cleaning";
    job.phase = "Removing only this operation's temporary files";
    job.bytesPerSecond = 0;
    this.save(job);
    this.publish(job);
    try {
      await this.removeTemporary(job);
      job.status = outcome;
      job.phase =
        outcome === "complete"
          ? "Free-space exercise finished; permanent deletion is not verified"
          : "Stopped; temporary files removed";
    } catch (error) {
      job.status = "cleanup_required";
      job.phase = "Reconnect the same phone to remove leftover temporary files";
      job.error = [job.error, String(error)].filter(Boolean).join("\n");
    }
    this.log(job.id).append("cleanup_finished", {
      outcome: job.status,
      cleanupComplete: job.cleanupComplete,
      bytesVerified: job.bytesVerified,
      error: job.error,
      permanentDeletionVerified: false,
    });
    this.save(job);
    this.receipt(job);
    this.publish(job);
  }
  async cleanup(id: string): Promise<SanitizationJob> {
    if (this.active) throw new Error("Finish the current operation first.");
    const job = jobSchema.parse(
      JSON.parse(readFileSync(this.statePath(id), "utf8")),
    );
    if (job.cleanupComplete) return job;
    this.log(id).append("leftover_cleanup_requested", { id });
    await this.removeTemporary(job);
    job.status = "cancelled";
    job.phase =
      "Leftover temporary files removed; permanent deletion is not verified";
    job.bytesPerSecond = 0;
    this.log(id).append("leftover_cleanup_completed", {
      id,
      permanentDeletionVerified: false,
    });
    this.save(job);
    this.receipt(job);
    this.publish(job);
    return job;
  }
  exportReceipt(id: string): { json: string; hash: string } {
    const job = this.jobs().find((j) => j.id === idSchema.parse(id));
    if (!job?.receiptPath)
      throw new Error("No completed receipt is available for this operation.");
    const expected = join(
      this.directory,
      job.receiptPath.split(/[\\/]/).at(-1)!,
    );
    if (expected !== job.receiptPath || !existsSync(expected))
      throw new Error("Invalid receipt location.");
    const json = readFileSync(expected, "utf8");
    const hash = readFileSync(expected + ".sha256", "utf8").trim();
    if (sha256(json) !== hash)
      throw new Error("Cleanup receipt integrity check failed.");
    const document = JSON.parse(json);
    if (
      document.job?.id !== id ||
      document.assurance !== "best_effort_only" ||
      document.permanentDeletionVerified !== false
    )
      throw new Error("Cleanup receipt identity or assurance is invalid.");
    const events = this.log(id).verify();
    const count = Array.isArray(document.events) ? document.events.length : -1;
    if (
      count < 0 ||
      canonical(events.slice(0, count)) !== canonical(document.events) ||
      document.auditHead !== (document.events.at(-1)?.hash ?? "0".repeat(64))
    )
      throw new Error("Cleanup receipt does not match its audit history.");
    return { json, hash };
  }
}
