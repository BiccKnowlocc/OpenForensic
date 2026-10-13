import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { SanitizationService } from "../src/main/sanitization/service";
import { type SanitizationTransport } from "../src/main/sanitization/transport";
import {
  GIB,
  CHUNK_BYTES,
  jobDirectory,
  chunkPath,
  writeChunkCommand,
  removeChunkCommand,
  removeDirectoryCommand,
  parseStorage,
  parseBattery,
  reserveBytes,
  safeBattery,
} from "../src/main/sanitization/policy";
import { assertReadCommand } from "../src/main/adb/policy";
import { sha256 } from "../src/main/integrity/audit";
import type { SanitizationDevice, SanitizationJob } from "../src/shared/types";

class SimulatedPhone implements SanitizationTransport {
  device: SanitizationDevice = {
    serial: "TESTPHONE",
    manufacturer: "Synthetic",
    model: "Fixture",
    fingerprint: "fixture/fingerprint",
    hardware: "fixture",
    androidVersion: "15",
    encryptionState: "encrypted",
    encryptionType: "file",
    storageRoot: "/storage/emulated/0",
    filesystem: "/dev/fuse",
    totalBytes: 64 * GIB,
    freeBytes: 16 * GIB,
    battery: { level: 90, powered: true, temperatureC: 25 },
  };
  original = new Map([
    ["DCIM/existing.jpg", "unchanged photo"],
    ["Documents/existing.txt", "unchanged document"],
  ]);
  files = new Map<string, { bytes: number; hash: string }>();
  owned = new Set<string>();
  online = true;
  disconnectOnWrite = false;
  mismatch = false;
  writes = 0;
  async assess(): Promise<SanitizationDevice> {
    if (!this.online) throw new Error("USB disconnected");
    return structuredClone(this.device);
  }
  async create(_device: SanitizationDevice, id: string) {
    this.owned.add(id);
  }
  async write(
    _device: SanitizationDevice,
    id: string,
    index: number,
    bytes: number,
    sent: (bytes: number) => void,
    signal: AbortSignal,
  ) {
    this.writes++;
    const key = chunkPath(this.device.storageRoot, id, index);
    const hash = sha256(`fixture:${index}:${bytes}`);
    this.files.set(key, { bytes, hash });
    this.device.freeBytes -= bytes;
    sent(bytes);
    signal.throwIfAborted();
    if (this.disconnectOnWrite) {
      this.online = false;
      throw new Error("USB disconnected mid-write");
    }
    return hash;
  }
  async verify(
    _device: SanitizationDevice,
    id: string,
    index: number,
    bytes: number,
    hash: string,
  ) {
    const file = this.files.get(chunkPath(this.device.storageRoot, id, index));
    if (this.mismatch || !file || file.bytes !== bytes || file.hash !== hash)
      throw new Error("Readback mismatch");
  }
  async remove(_device: SanitizationDevice, id: string, index: number) {
    if (!this.online || !this.owned.has(id))
      throw new Error("Cleanup ownership/connection failure");
    const key = chunkPath(this.device.storageRoot, id, index);
    const file = this.files.get(key);
    if (file) {
      this.device.freeBytes += file.bytes;
      this.files.delete(key);
    }
  }
  async finish(_device: SanitizationDevice, id: string) {
    if (!this.online) throw new Error("USB disconnected");
    this.owned.delete(id);
  }
}
async function fixture(
  work: (root: string, phone: SimulatedPhone) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "openforensic-sanitize-test-"));
  try {
    await work(root, new SimulatedPhone());
  } finally {
    const target = resolve(root);
    if (!target.startsWith(resolve(tmpdir(), "openforensic-sanitize-test-")))
      throw new Error("Unsafe test cleanup path");
    await rm(target, { recursive: true, force: true });
  }
}
const consent = (token: string) => ({
  token,
  operator: "Fixture operator",
  authority: "Synthetic test device",
  typedSerial: "TESTPHONE",
  acknowledged: true,
});

describe("sanitization scope and safety", () => {
  it("rejects raw devices, injected paths, invalid IDs, and escaped file indices", () => {
    const id = randomUUID();
    expect(() => jobDirectory("/dev/block/sda", id)).toThrow();
    expect(() => jobDirectory("/storage/emulated/0; rm -rf /", id)).toThrow();
    expect(() =>
      jobDirectory("/storage/emulated/0", "../../existing"),
    ).toThrow();
    expect(() => chunkPath("/storage/emulated/0", id, 0)).toThrow();
    expect(() => chunkPath("/storage/emulated/0", id, Infinity)).toThrow();
    for (const command of [
      writeChunkCommand("/storage/emulated/0", id, 1),
      removeChunkCommand("/storage/emulated/0", id, 1),
      removeDirectoryCommand("/storage/emulated/0", id),
    ]) {
      expect(() => assertReadCommand(command)).toThrow();
      expect(command).not.toContain("rm -rf");
      expect(command).toContain("owner.marker");
    }
  });
  it("reads byte counters in explicit 1024-byte units and enforces battery/heat limits", () => {
    expect(
      parseStorage(
        "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/fuse 10000 2500 7500 25% /storage/emulated\n",
      ).freeBytes,
    ).toBe(7500 * 1024);
    expect(() =>
      parseStorage("/dev/fuse 100 0 1000 0% /storage/emulated"),
    ).toThrow();
    expect(reserveBytes(16 * GIB)).toBe(2 * GIB);
    expect(reserveBytes(128 * GIB)).toBe(Math.ceil(128 * GIB * 0.05));
    const battery = parseBattery(
      "USB powered: true\n level: 75\n temperature: 310",
    );
    expect(battery.temperatureC).toBe(31);
    expect(() => safeBattery({ ...battery, level: 29 })).toThrow();
    expect(() => safeBattery({ ...battery, temperatureC: 42 })).toThrow();
    expect(() => safeBattery({ ...battery, powered: false })).toThrow();
  });
  it("refuses stale storage assessments and incorrect device confirmation before writes", async () =>
    fixture(async (root, phone) => {
      const service = new SanitizationService(root, phone, () => {});
      const plan = await service.prepare("TESTPHONE", 0.125);
      await expect(
        service.start({ ...consent(plan.token), typedSerial: "OTHER" }),
      ).rejects.toThrow(/Confirm/);
      phone.device.fingerprint = "different/device";
      await expect(service.start(consent(plan.token))).rejects.toThrow(
        /identity/,
      );
      expect(phone.writes).toBe(0);
    }));
  it("rejects low-space plans without deleting current files", async () =>
    fixture(async (root, phone) => {
      phone.device.freeBytes = GIB;
      const service = new SanitizationService(root, phone, () => {});
      await expect(service.prepare("TESTPHONE", 0)).rejects.toThrow(
        /Not enough free space/,
      );
      expect(phone.original.size).toBe(2);
      expect(phone.writes).toBe(0);
    }));
  it("verifies temporary writes, removes them, retains current files, and exports an honest receipt", async () =>
    fixture(async (root, phone) => {
      const originals = [...phone.original.entries()];
      const free = phone.device.freeBytes;
      const service = new SanitizationService(root, phone, () => {});
      const plan = await service.prepare("TESTPHONE", 0.125);
      expect(
        plan.targetBytes + plan.reserveBytes + CHUNK_BYTES,
      ).toBeLessThanOrEqual(plan.device.freeBytes);
      const id = await service.start(consent(plan.token));
      await service.settled();
      const job = service.jobs()[0];
      expect(job.status).toBe("complete");
      expect(job.cleanupComplete).toBe(true);
      expect(job.bytesVerified).toBe(0.125 * GIB);
      expect(phone.files.size).toBe(0);
      expect([...phone.original.entries()]).toEqual(originals);
      expect(phone.device.freeBytes).toBe(free);
      const receipt = service.exportReceipt(id);
      await expect(service.start(consent(plan.token))).rejects.toThrow(
        /expired/,
      );
      expect(sha256(receipt.json)).toBe(receipt.hash);
      expect(JSON.parse(receipt.json).permanentDeletionVerified).toBe(false);
      expect(JSON.parse(receipt.json).assurance).toBe("best_effort_only");
      await writeFile(job.receiptPath!, receipt.json + "tampered");
      expect(() => service.exportReceipt(id)).toThrow(/integrity/);
    }));
  it("cancels a partial transfer and removes only its own files", async () =>
    fixture(async (root, phone) => {
      let service: SanitizationService;
      service = new SanitizationService(root, phone, (job) => {
        if (job.status === "running" && job.bytesSent > 0) service.cancel();
      });
      const plan = await service.prepare("TESTPHONE", 0.125);
      await service.start(consent(plan.token));
      await service.settled();
      expect(service.jobs()[0].status).toBe("cancelled");
      expect(phone.files.size).toBe(0);
      expect(phone.original.size).toBe(2);
    }));
  it("keeps a reconnect cleanup checkpoint and rejects a different phone", async () =>
    fixture(async (root, phone) => {
      phone.disconnectOnWrite = true;
      const service = new SanitizationService(root, phone, () => {});
      const plan = await service.prepare("TESTPHONE", 0.125);
      const id = await service.start(consent(plan.token));
      await service.settled();
      expect(service.jobs()[0].status).toBe("cleanup_required");
      expect(phone.files.size).toBe(1);
      const reopened = new SanitizationService(root, phone, () => {});
      phone.online = true;
      phone.device.fingerprint = "other/device";
      await expect(reopened.cleanup(id)).rejects.toThrow(/identity/);
      expect(phone.files.size).toBe(1);
      phone.device.fingerprint = "fixture/fingerprint";
      expect((await reopened.cleanup(id)).cleanupComplete).toBe(true);
      expect(phone.files.size).toBe(0);
      expect(phone.original.size).toBe(2);
    }));
  it("stops on a readback failure and does not report verified erasure", async () =>
    fixture(async (root, phone) => {
      phone.mismatch = true;
      const service = new SanitizationService(root, phone, () => {});
      const plan = await service.prepare("TESTPHONE", 0.125);
      await service.start(consent(plan.token));
      await service.settled();
      const job = service.jobs()[0];
      expect(job.status).toBe("failed");
      expect(job.bytesVerified).toBe(0);
      expect(job.error).toMatch(/Readback/);
      expect(phone.files.size).toBe(0);
      expect(phone.original.size).toBe(2);
    }));
  it("recovers durable running state after an app restart", async () =>
    fixture(async (root, phone) => {
      const service = new SanitizationService(root, phone, () => {});
      const plan = await service.prepare("TESTPHONE", 0.125);
      const id = await service.start(consent(plan.token));
      await service.settled();
      const state = JSON.parse(
        await readFile(join(root, `${id}.state.json`), "utf8"),
      ) as SanitizationJob;
      state.status = "running";
      state.cleanupComplete = false;
      await writeFile(join(root, `${id}.state.json`), JSON.stringify(state));
      expect(
        new SanitizationService(root, phone, () => {}).jobs()[0].status,
      ).toBe("cleanup_required");
    }));
  it("retains corrupted checkpoints without stopping the rest of the application", async () =>
    fixture(async (root, phone) => {
      const path = join(root, `${randomUUID()}.state.json`);
      await writeFile(path, "broken checkpoint");
      const service = new SanitizationService(root, phone, () => {});
      expect(service.recoveryWarning).toMatch(/need review/);
      await expect(service.prepare("TESTPHONE", 1)).rejects.toThrow(
        /need review/,
      );
      expect(await readFile(path, "utf8")).toBe("broken checkpoint");
      expect(phone.writes).toBe(0);
    }));
  it("refuses automatic cleanup of an unowned directory when creation was denied", async () =>
    fixture(async (root, phone) => {
      phone.create = async () => {
        throw new Error("Directory exists or access denied");
      };
      phone.finish = async () => {
        throw new Error("Ownership marker mismatch");
      };
      const service = new SanitizationService(root, phone, () => {});
      const plan = await service.prepare("TESTPHONE", 1);
      await service.start(consent(plan.token));
      await service.settled();
      expect(service.jobs()[0].status).toBe("cleanup_required");
      expect(phone.writes).toBe(0);
      expect(phone.original.size).toBe(2);
    }));
});
