import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import type { Audit } from "../../shared/types";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export class AuditLog {
  constructor(readonly path: string) {
    this.verify();
  }
  read(): Audit[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Audit);
  }
  verify(): Audit[] {
    const events = this.read();
    let previous = "0".repeat(64);
    events.forEach((event, index) => {
      const { hash, ...body } = event;
      if (
        event.sequence !== index + 1 ||
        event.previous_hash !== previous ||
        sha256(canonical(body)) !== hash
      )
        throw new Error(
          `Custody log integrity failure at event ${index + 1}. Preserve the case and investigate.`,
        );
      previous = hash;
    });
    return events;
  }
  append(action: string, details: unknown): Audit {
    const events = this.verify();
    const body = {
      sequence: events.length + 1,
      timestamp_utc: new Date().toISOString(),
      action,
      details,
      previous_hash: events.at(-1)?.hash ?? "0".repeat(64),
    };
    const event = { ...body, hash: sha256(canonical(body)) };
    appendFileSync(this.path, canonical(event) + "\n", { mode: 0o600 });
    const fd = openSync(this.path, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return event;
  }
}
