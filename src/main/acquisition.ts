import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { chmod, statfs } from "node:fs/promises";
import { join, basename } from "node:path";
import { writeHashed, hashFile, type Digests } from "./integrity/hashStream";
import { DeviceBridge } from "./adb/client";
import {
  providers,
  providerCommand,
  externalCommand,
  appCommands,
  physicalCommand,
  sizeCommand,
  type Provider,
} from "./adb/policy";
import { ForensicCase } from "./case";
import type { Evidence, Progress } from "../shared/types";

export interface AcquisitionInput {
  serial: string;
  mode: "logical" | "physical";
  external: boolean;
  appData: boolean;
  block: string;
  acknowledged: boolean;
}
export class AcquisitionService {
  private controller: AbortController | null = null;
  private operatorCancelled = false;
  constructor(
    private bridge: DeviceBridge,
    private emit: (progress: Progress) => void,
  ) {}
  get active(): boolean {
    return this.controller !== null;
  }
  cancel(): void {
    if (this.controller) {
      this.operatorCancelled = true;
      this.controller.abort(new Error("Operator cancelled acquisition."));
    }
  }
  start(item: ForensicCase, input: AcquisitionInput): string {
    item.writable();
    if (this.active) throw new Error("An acquisition is already running.");
    if (!input.acknowledged)
      throw new Error(
        "Record authority and acknowledge live-device acquisition effects first.",
      );
    const id = randomUUID();
    this.operatorCancelled = false;
    this.controller = new AbortController();
    void this.run(id, item, input, this.controller)
      .catch((error) => {
        // A failed progress recipient must not create an unhandled rejection
        // after the acquisition's own cleanup has completed.
        console.error("Acquisition notification failed:", error);
      })
      .finally(() => {
        this.controller = null;
      });
    return id;
  }
  private async run(
    jobId: string,
    item: ForensicCase,
    input: AcquisitionInput,
    controller: AbortController,
  ): Promise<void> {
    let heartbeatUtc: string | null = null;
    let busy = false;
    let failed = false;
    let current: Progress = {
      jobId,
      phase: "Inspecting device",
      source: input.serial,
      bytes: 0,
      bytesPerSecond: 0,
      hashBytes: 0,
      heartbeatUtc,
      status: "running",
    };
    const emit = (update: Partial<Progress>) => {
      current = { ...current, ...update, heartbeatUtc };
      this.emit(current);
    };
    const heartbeat = setInterval(() => {
      if (busy) return;
      busy = true;
      void this.bridge
        .ready(input.serial)
        .then(() => {
          heartbeatUtc = new Date().toISOString();
          emit({});
        })
        .catch((e) => {
          controller.abort(e);
        })
        .finally(() => {
          busy = false;
        });
    }, 3000);
    try {
      const profile = await this.bridge.inspect(input.serial);
      controller.signal.throwIfAborted();
      heartbeatUtc = new Date().toISOString();
      item.session(jobId, profile);
      item.audit.append("acquisition_started", {
        adbVersion: this.bridge.adbVersion ?? "unknown",
        jobId,
        input,
        liveDeviceEffectsAcknowledged: true,
        adb: this.bridge.adbPath,
      });
      if ((input.mode === "physical" || input.appData) && !profile.root)
        throw new Error(
          "Existing root access is required for this acquisition.",
        );
      const plans: {
        name: string;
        source: string;
        command: string;
        kind: string;
        expected?: number;
      }[] = [];
      if (input.mode === "physical") {
        const size = Number(
          await this.bridge.probe(
            input.serial,
            sizeCommand(input.block, profile.rootMethod === "shell"),
          ),
        );
        if (!Number.isSafeInteger(size) || size <= 0)
          throw new Error(
            "Cannot establish block device size; refusing an unverifiable physical stream.",
          );
        plans.push({
          name: "physical.img",
          source: input.block,
          command: physicalCommand(input.block, profile.rootMethod === "shell"),
          kind: "physical",
          expected: size,
        });
      } else {
        for (const name of Object.keys(providers) as Provider[])
          plans.push({
            name: `${name}.txt`,
            source: providers[name],
            command: providerCommand(name),
            kind: `provider-${name}`,
          });
        if (input.external)
          plans.push({
            name: "shared-storage.tar",
            source: "/sdcard/",
            command: externalCommand,
            kind: "tar",
          });
        if (input.appData)
          for (const app of appCommands)
            plans.push({
              name: `${app.name}.tar`,
              source: app.command,
              command:
                profile.rootMethod === "shell"
                  ? app.command.slice(7, -1)
                  : app.command,
              kind: "tar",
            });
      }
      for (const plan of plans) {
        controller.signal.throwIfAborted();
        const disk = await statfs(item.root);
        const available = disk.bavail * disk.bsize;
        if (available < (plan.expected ?? 64 * 1024 * 1024) + 64 * 1024 * 1024)
          throw new Error(
            "Insufficient free space for acquisition and safety margin.",
          );
        const id = randomUUID();
        const path = join(item.root, "evidence", `${id}-${plan.name}`);
        const started = Date.now();
        let lastBytes = 0;
        let lastAt = started;
        let lastActivity = started;
        emit({
          phase: "Acquiring",
          source: plan.source,
          bytes: 0,
          hashBytes: 0,
          bytesPerSecond: 0,
        });
        const proc = this.bridge.stream(
          input.serial,
          plan.command,
          controller.signal,
        );
        item.audit.append("source_started", {
          jobId,
          evidenceId: id,
          source: plan.source,
          command: proc.command,
          expectedBytes: plan.expected ?? null,
        });
        const idle = setInterval(() => {
          if (Date.now() - lastActivity > 120000)
            controller.abort(new Error("Acquisition stalled for 120 seconds."));
        }, 5000);
        let status: Evidence["status"] = "complete";
        let error: string | null = null;
        let verifiedDigest: Digests | null = null;
        try {
          const digest = await writeHashed(
            proc.stream,
            path,
            (bytes) => {
              lastActivity = Date.now();
              if (lastActivity - lastAt >= 250) {
                emit({
                  bytes,
                  hashBytes: bytes,
                  bytesPerSecond:
                    ((bytes - lastBytes) * 1000) / (lastActivity - lastAt),
                });
                lastAt = lastActivity;
                lastBytes = bytes;
              }
            },
            controller.signal,
          );
          await proc.completion;
          emit({
            phase: "Verifying saved bytes",
            bytes: digest.bytes,
            hashBytes: digest.bytes,
            bytesPerSecond: 0,
          });
          const diskDigest = await hashFile(path);
          if (
            diskDigest.sha256 !== digest.sha256 ||
            diskDigest.md5 !== digest.md5 ||
            diskDigest.bytes !== digest.bytes
          )
            throw new Error(
              "Saved evidence differs from the acquisition stream.",
            );
          verifiedDigest = diskDigest;
          if (plan.expected && digest.bytes !== plan.expected)
            throw new Error(
              `Physical stream size mismatch: expected ${plan.expected}, received ${digest.bytes}.`,
            );
          if (!digest.bytes)
            throw new Error("The device returned an empty stream.");
          if (
            plan.kind.startsWith("provider-") &&
            digest.bytes < 2 * 1024 * 1024 &&
            /(?:SecurityException|Permission Denial|Error while accessing provider|Unknown URI|Exception occurred)/i.test(
              readFileSync(path, "utf8"),
            )
          )
            throw new Error(
              "Content provider rejected the read; the original response has been preserved.",
            );
        } catch (e) {
          failed = true;
          status = existsSync(path) ? "partial" : "failed";
          const cause = controller.signal.aborted
            ? controller.signal.reason
            : e;
          error = cause instanceof Error ? cause.message : String(cause);
        } finally {
          clearInterval(idle);
          proc.stop();
        }
        if (existsSync(path)) {
          const digest = verifiedDigest ?? (await hashFile(path));
          const record: Evidence = {
            id,
            relative_path: `evidence/${basename(path)}`,
            source: plan.source,
            kind: plan.kind,
            ...digest,
            status,
            created_utc: new Date().toISOString(),
            error,
          };
          item.store.register(record);
          await chmod(path, 0o400);
          item.audit.append("source_finished", {
            jobId,
            record,
            durationMs: Date.now() - started,
          });
        } else
          item.audit.append("source_failed", {
            jobId,
            evidenceId: id,
            source: plan.source,
            error,
          });
        if (controller.signal.aborted) controller.signal.throwIfAborted();
      }
      item.audit.append("acquisition_finished", {
        jobId,
        status: failed ? "with_errors" : "complete",
      });
      emit({
        phase: failed ? "Finished with source errors" : "Acquisition complete",
        status: failed ? "failed" : "complete",
        bytesPerSecond: 0,
      });
    } catch (error) {
      const cause = controller.signal.aborted
        ? controller.signal.reason
        : error;
      const message = cause instanceof Error ? cause.message : String(cause);
      try {
        item.audit.append("acquisition_failed", {
          jobId,
          error: message,
          cancelled: this.operatorCancelled,
          aborted: controller.signal.aborted,
        });
      } catch {
        /* The integrity error is already surfaced to the operator. */
      }
      emit({
        phase: "Acquisition stopped",
        status: this.operatorCancelled ? "cancelled" : "failed",
        error: message,
        bytesPerSecond: 0,
      });
    } finally {
      clearInterval(heartbeat);
    }
  }
}
export async function importFile(
  item: ForensicCase,
  source: string,
): Promise<Evidence> {
  item.writable();
  const id = randomUUID();
  const name = basename(source).replace(/[^A-Za-z0-9_.-]/g, "_");
  const relative_path = `evidence/${id}/${name}`;
  const path = join(item.root, relative_path);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(item.root, "evidence", id), { mode: 0o700 });
  const digest = await writeHashed(createReadStream(source), path, () => {});
  const check = await hashFile(path);
  if (check.sha256 !== digest.sha256 || check.md5 !== digest.md5)
    throw new Error("Import readback verification failed.");
  const kind = /\.tar$/i.test(name)
    ? "tar"
    : /\.(?:db|sqlite|sqlite3)$/i.test(name)
      ? "sqlite"
      : /\.json$/i.test(name)
        ? "json"
        : /\.xml$/i.test(name)
          ? "xml"
          : /\.(?:pb|protobuf|bin)$/i.test(name)
            ? "protobuf"
            : "file";
  const record: Evidence = {
    id,
    relative_path,
    source,
    kind,
    ...digest,
    status: "complete",
    created_utc: new Date().toISOString(),
    error: null,
  };
  item.store.register(record);
  await chmod(path, 0o400);
  item.audit.append("evidence_imported", { record });
  return record;
}
