import type { CaseBundle, Message } from "./types";

export function searchBundle(bundle: CaseBundle, query: string): Message[] {
  const tokens = query.toLowerCase().match(/[a-z0-9+]{2,}/g) ?? [];
  if (tokens.length === 0) return [];
  return bundle.messages
    .filter((message) => {
      const hay = `${message.messageText} ${message.senderId}`.toLowerCase();
      return tokens.every((token) => hay.includes(token));
    })
    .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
}
