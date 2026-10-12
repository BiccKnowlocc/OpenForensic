import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeviceBridge, collect, parseDeviceList } from "../src/main/adb/client";
import { ToolSettings } from "../src/main/settings";

describe("device connection resilience", () => {
  it("handles adbkit's late socket error instead of crashing the process", () => {
    const bridge = new DeviceBridge();
    const client = (
      bridge as unknown as {
        client: { emit(name: string, error: Error): void };
      }
    ).client;
    expect(() =>
      client.emit("error", new Error("read ECONNRESET")),
    ).not.toThrow();
    expect(bridge.lastConnectionError).toBe("read ECONNRESET");
  });
  it("reports missing tools and process failures as rejected requests", async () => {
    await expect(
      collect(join(tmpdir(), "missing-openforensic-tool-72af"), []),
    ).rejects.toThrow(/installed|ENOENT/);
    await expect(
      collect(process.execPath, [
        "-e",
        "process.stderr.write('USB lost'); process.exit(7)",
      ]),
    ).rejects.toThrow(/USB lost/);
  });
  it("bounds a hung tool and preserves output from a successful process", async () => {
    await expect(
      collect(process.execPath, ["-e", "setInterval(()=>{},1000)"], 1024, 150),
    ).rejects.toThrow();
    expect(
      await collect(process.execPath, [
        "-e",
        "process.stdout.write('connected')",
      ]),
    ).toBe("connected");
  });
  it("distinguishes unauthorized, offline, and ready transports in CLI fallback", () => {
    expect(
      parseDeviceList(
        "List of devices attached\nREADY device product:test\nLOCKED unauthorized\nLOST offline\nDENIED no permissions (check rules)\n* daemon started successfully\n",
      ),
    ).toEqual([
      { id: "READY", state: "device" },
      { id: "LOCKED", state: "unauthorized" },
      { id: "LOST", state: "offline" },
      { id: "DENIED", state: "no permissions" },
    ]);
  });
  it("retains a selected tool location after reopening settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "openforensic-settings-"));
    const oldAdb = process.env.OPENFORENSIC_ADB;
    const oldPython = process.env.OPENFORENSIC_PYTHON;
    delete process.env.OPENFORENSIC_ADB;
    delete process.env.OPENFORENSIC_PYTHON;
    try {
      const file = join(root, "tool-settings.json");
      const settings = new ToolSettings(file);
      settings.save("adb", join(root, "adb.exe"));
      settings.save("python", process.execPath);
      const restored = new ToolSettings(file);
      expect(restored.adb).toBe(join(root, "adb.exe"));
      expect(restored.python).toBe(process.execPath);
      expect(JSON.parse(await readFile(file, "utf8")).adb).toBe(restored.adb);
    } finally {
      if (oldAdb !== undefined) process.env.OPENFORENSIC_ADB = oldAdb;
      if (oldPython !== undefined) process.env.OPENFORENSIC_PYTHON = oldPython;
      await rm(root, { recursive: true, force: true });
    }
  });
});
