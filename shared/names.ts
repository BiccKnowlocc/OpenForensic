import type { CaseBundle } from "./types";

export function partyName(bundle: CaseBundle, id: string): string {
  if (id === "device" || id === bundle.summary.ownerNumber) return bundle.summary.ownerName;
  const contact = bundle.contacts.find((item) => item.number === id);
  return contact?.name ?? id;
}

const EASTERN = "America/New_York";

export function formatEastern(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: EASTERN,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${when} ${easternAbbrev(date)}`;
}

function easternAbbrev(date: Date): string {
  const shortName = timeZonePart(date, "short");
  if (shortName === "EST" || shortName === "EDT") return shortName;
  const longName = timeZonePart(date, "long");
  if (longName.includes("Daylight")) return "EDT";
  if (longName.includes("Standard")) return "EST";
  return shortName || longName;
}

function timeZonePart(date: Date, timeZoneName: "short" | "long"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    timeZoneName,
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "";
}

export function easternDateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function threadTitle(bundle: CaseBundle, threadId: string): string {
  const message = bundle.messages.find((item) => item.threadId === threadId);
  if (!message) return threadId;
  const other = message.senderId === bundle.summary.ownerNumber ? message.receiverId : message.senderId;
  return partyName(bundle, other);
}
