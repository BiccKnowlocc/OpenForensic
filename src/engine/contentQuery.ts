import type { CallDirection, CallRecord, Contact, Message } from "../../shared/types";

export function parseContentRows(text: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^Row:\s*\d+\s+(.*)$/);
    if (!match) continue;
    const record: Record<string, string> = {};
    for (const part of match[1].split(/,\s*(?=[A-Za-z0-9_.]+=)/)) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      record[part.slice(0, eq)] = part.slice(eq + 1);
    }
    rows.push(record);
  }
  return rows;
}

export function messagesFromSmsRows(rows: Array<Record<string, string>>, ownerNumber: string): Message[] {
  return rows.flatMap((row, index) => {
    const body = row.body ?? row.text ?? "";
    const address = row.address ?? row.number ?? "";
    if (!body && !address) return [];
    const sent = row.type === "2";
    const senderId = sent ? ownerNumber || "device" : address || "unknown";
    const receiverId = sent ? address || "unknown" : ownerNumber || "device";
    const millis = Number(row.date ?? row.date_sent ?? "");
    const timestampUtc = Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : new Date(0).toISOString();
    const threadKey = (address || `row-${index}`).replace(/[^\d+]/g, "") || `row-${index}`;
    return [{
      id: `sms-${row._id ?? index + 1}`,
      threadId: `thread-${threadKey}`,
      timestampUtc,
      platform: "sms" as const,
      senderId,
      receiverId,
      messageText: body,
      mediaPath: row.media || null,
      isDeletedFlag: row.deleted === "1" || row.read === "deleted",
    }];
  });
}

const callDirection: Record<string, CallDirection> = { "1": "incoming", "2": "outgoing", "3": "missed" };

export function callsFromRows(rows: Array<Record<string, string>>): CallRecord[] {
  return rows.flatMap((row, index) => {
    const number = row.number ?? row.address ?? "";
    if (!number && !row.name) return [];
    const millis = Number(row.date ?? "");
    return [{
      id: `call-${row._id ?? index + 1}`,
      timestampUtc: Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : new Date(0).toISOString(),
      number,
      name: row.name || number || "Unknown",
      direction: callDirection[row.type ?? ""] ?? "incoming",
      durationSec: Number(row.duration ?? "0") || 0,
    }];
  });
}

export function contactsFromRows(rows: Array<Record<string, string>>): Contact[] {
  return rows.flatMap((row, index) => {
    const number = row.number ?? row.data1 ?? "";
    const name = row.display_name ?? row.name ?? "";
    if (!number && !name) return [];
    return [{ id: `contact-${row._id ?? index + 1}`, name: name || number, number }];
  });
}
