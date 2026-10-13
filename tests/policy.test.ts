import { describe, expect, it } from "vitest";
import {
  assertReadCommand,
  physicalCommand,
  sizeCommand,
  providerCommand,
  externalCommand,
} from "../src/main/adb/policy";
import { AuditLog } from "../src/main/integrity/audit";
import { within } from "../src/main/case";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("device command policy", () => {
  it("accepts only fixed reads and validated block streams", () => {
    for (const command of [
      providerCommand("sms"),
      externalCommand,
      physicalCommand("/dev/block/by-name/userdata"),
      sizeCommand("/dev/block/sda"),
    ])
      expect(() => assertReadCommand(command)).not.toThrow();
    for (const command of [
      "adb root",
      "rm /sdcard/x",
      "content delete --uri content://sms",
      'su -c "setenforce 0"',
      "dd if=/dev/block/sda of=/dev/block/sdb",
    ])
      expect(() => assertReadCommand(command)).toThrow();
    for (const path of [
      "/sdcard/file",
      "/dev/block/by-name/../../x",
      "/dev/block/sda;reboot",
      "/dev/block/sda'",
      "/dev/block/sda\n",
    ])
      expect(() => physicalCommand(path)).toThrow();
  });
});
describe("custody and paths", () => {
  it("rejects parent and absolute path escapes", () => {
    const root = join(tmpdir(), "cases", "A");
    expect(() => within(root, "../B/evidence")).toThrow();
    expect(() => within(root, join(tmpdir(), "outside", "file"))).toThrow();
  });
  it("detects modified events rather than silently reopening the log", () => {
    const root = mkdtempSync(join(tmpdir(), "openforensic-audit-"));
    const path = join(root, "audit.jsonl");
    try {
      const audit = new AuditLog(path);
      audit.append("created", { operator: "Examiner" });
      audit.append("collected", { bytes: 42 });
      expect(audit.verify()).toHaveLength(2);
      writeFileSync(path, readFileSync(path, "utf8").replace("42", "43"));
      expect(() => new AuditLog(path)).toThrow("integrity failure");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
