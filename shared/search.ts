import type { CallRecord, CaseBundle, CaseSearch, Contact, Message } from "./types";

export function searchBundle(bundle: CaseBundle, query: string): CaseSearch {
  const tokens = query.toLowerCase().match(/[a-z0-9+]{2,}/g) ?? [];
  if (tokens.length === 0) return { messages: [], calls: [], contacts: [] };
  return {
    messages: bundle.messages
      .filter((message) => tokens.every((token) => messageBlob(message).includes(token)))
      .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc)),
    calls: bundle.calls
      .filter((call) => tokens.every((token) => callBlob(call).includes(token)))
      .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc)),
    contacts: bundle.contacts
      .filter((contact) => tokens.every((token) => contactBlob(contact).includes(token)))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function messageBlob(message: Message): string {
  return `${message.messageText} ${message.senderId} ${message.receiverId}`.toLowerCase();
}

function callBlob(call: CallRecord): string {
  return `${call.name} ${call.number} ${call.direction}`.toLowerCase();
}

function contactBlob(contact: Contact): string {
  return `${contact.name} ${contact.number}`.toLowerCase();
}
