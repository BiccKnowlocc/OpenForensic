import type { CaseBundle } from "./types";

export function partyName(bundle: CaseBundle, id: string): string {
  if (id === "device" || id === bundle.summary.ownerNumber) return bundle.summary.ownerName;
  const contact = bundle.contacts.find((item) => item.number === id);
  return contact?.name ?? id;
}

export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date) + " UTC";
}

export function threadTitle(bundle: CaseBundle, threadId: string): string {
  const message = bundle.messages.find((item) => item.threadId === threadId);
  if (!message) return threadId;
  const other = message.senderId === bundle.summary.ownerNumber ? message.receiverId : message.senderId;
  return partyName(bundle, other);
}
