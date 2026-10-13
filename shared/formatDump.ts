import type { CallRecord, Contact, Message } from "./types";

function row(index: number, fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  return `Row: ${index} ${body}`;
}

export function formatSmsDump(messages: Message[]): string {
  const lines = messages.map((message, index) => {
    const type = message.senderId === message.receiverId ? "1" : message.senderId.startsWith("+") && message.receiverId.startsWith("+")
      ? messageDirection(message)
      : "1";
    const address = type === "2" ? message.receiverId : message.senderId;
    return row(index, {
      _id: String(index + 1),
      address,
      body: message.messageText,
      date: String(Date.parse(message.timestampUtc)),
      type,
      thread_id: message.threadId,
      deleted: message.isDeletedFlag ? "1" : "0",
      media: message.mediaPath ?? "",
    });
  });
  return `${lines.join("\n")}\n`;
}

function messageDirection(message: Message): "1" | "2" {
  return message.senderId === "+14155550100" ? "2" : "1";
}

export function formatCallDump(calls: CallRecord[]): string {
  const typeByDirection = { incoming: "1", outgoing: "2", missed: "3" } as const;
  const lines = calls.map((call, index) =>
    row(index, {
      _id: String(index + 1),
      number: call.number,
      name: call.name,
      date: String(Date.parse(call.timestampUtc)),
      duration: String(call.durationSec),
      type: typeByDirection[call.direction],
    }),
  );
  return `${lines.join("\n")}\n`;
}

export function formatContactDump(contacts: Contact[]): string {
  const lines = contacts.map((contact, index) =>
    row(index, {
      _id: String(index + 1),
      display_name: contact.name,
      number: contact.number,
    }),
  );
  return `${lines.join("\n")}\n`;
}
