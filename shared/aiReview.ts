import { easternDateKey, formatEastern, partyName, threadTitle } from "./names";
import type { CallRecord, CaseBundle, Message, ReviewRequest, ReviewResponse } from "./types";

const STOP = new Set([
  "the", "a", "an", "about", "what", "who", "when", "where", "did", "does", "is", "are", "to", "of",
  "and", "or", "in", "on", "for", "this", "that", "case", "message", "messages", "text", "texts",
  "with", "from", "was", "were", "be", "it", "at", "by", "as", "if", "do", "how", "why", "which",
]);

export function localReview(request: ReviewRequest, bundle: CaseBundle): ReviewResponse {
  const text = answer(request, bundle);
  return {
    text,
    provider: "local-fallback",
    model: null,
    label: "Local review — Netlify AI Gateway unreachable. Answers use only records already in this case.",
  };
}

function answer(request: ReviewRequest, bundle: CaseBundle): string {
  if (request.task === "summarize_thread") return summarizeThread(bundle, request.threadId);
  if (request.task === "explain_timeline") return explainTimeline(bundle);
  if (request.task === "draft_report") return draftReport(bundle);
  return ask(bundle, request.question ?? "");
}

function ask(bundle: CaseBundle, question: string): string {
  const tokens = tokensOf(question);
  if (tokens.length === 0) {
    return "Ask a question about people, times, or words that appear in this case. The reviewer will not look outside these records.";
  }
  const messages = rankMessages(bundle.messages, tokens);
  const calls = bundle.calls.filter((call) => overlap(callBlob(call), tokens) > 0);
  const contacts = bundle.contacts.filter((contact) => overlap(`${contact.name} ${contact.number}`, tokens) > 0);
  const media = bundle.media.filter((item) => overlap(`${item.note} ${item.sourcePath}`, tokens) > 0);
  if (messages.length === 0 && calls.length === 0 && contacts.length === 0 && media.length === 0) {
    return "The case does not contain that. No message, call, contact, or media note matched the question.";
  }
  const lines = ["From the records already in this case:"];
  for (const message of messages.slice(0, 4)) {
    lines.push(
      `- ${formatEastern(message.timestampUtc)} SMS, ${partyName(bundle, message.senderId)} to ${partyName(bundle, message.receiverId)}: "${message.messageText}"${message.isDeletedFlag ? " (deleted flag)" : ""}`,
    );
  }
  for (const call of calls.slice(0, 3)) {
    lines.push(
      `- ${formatEastern(call.timestampUtc)} ${call.direction} call with ${call.name} (${call.number}), ${call.durationSec}s.`,
    );
  }
  for (const contact of contacts.slice(0, 3)) {
    lines.push(`- Contact ${contact.name}, ${contact.number}.`);
  }
  for (const item of media.slice(0, 3)) {
    lines.push(`- Media ${item.sourcePath}: ${item.note}`);
  }
  return lines.join("\n");
}

function summarizeThread(bundle: CaseBundle, threadId: string | undefined): string {
  if (!threadId) return "Select a thread first. The summary stays inside that thread.";
  const messages = bundle.messages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
  if (messages.length === 0) return "That thread has no messages in this case.";
  const title = threadTitle(bundle, threadId);
  const first = messages[0];
  const last = messages[messages.length - 1];
  const deleted = messages.filter((message) => message.isDeletedFlag).length;
  const lines = [
    `${title} thread, ${messages.length} SMS, ${formatEastern(first.timestampUtc)} to ${formatEastern(last.timestampUtc)}.`,
    deleted ? `${deleted} message has a deleted flag and is still in the provider result.` : "No deleted flag in this thread.",
    "What the messages say:",
  ];
  for (const message of messages) {
    lines.push(`- ${partyName(bundle, message.senderId)}: "${message.messageText}"`);
  }
  return lines.join("\n");
}

function explainTimeline(bundle: CaseBundle): string {
  const events = timelineRows(bundle);
  if (events.length === 0) return "This case has no timeline events yet.";
  const byDay = new Map<string, string[]>();
  for (const event of events) {
    const day = easternDateKey(event.at);
    const list = byDay.get(day) ?? [];
    list.push(event.line);
    byDay.set(day, list);
  }
  const lines = ["Timeline from the records in this case, oldest first. Times are US Eastern."];
  for (const [day, rows] of byDay) {
    lines.push("", day);
    for (const row of rows) lines.push(`- ${row}`);
  }
  return lines.join("\n");
}

function draftReport(bundle: CaseBundle): string {
  const { summary } = bundle;
  const parties = bundle.contacts.map((contact) => `${contact.name} (${contact.number})`).join("; ");
  return [
    `Short review draft — ${summary.name}`,
    summary.sample ? "This is the labeled sample case. It is not an acquisition from a phone." : `Operator: ${summary.operator}. Device: ${summary.deviceLabel}.`,
    "",
    `People: ${parties || "none recorded"}.`,
    `SMS: ${bundle.messages.length}. Calls: ${bundle.calls.length}. Shared media items: ${bundle.media.length}.`,
    "",
    "Narrative from the records:",
    explainTimeline(bundle),
    "",
    "This draft uses only records already in the case. It is not a final examiner report, and it does not add facts from outside the case.",
  ].join("\n");
}

export function timelineRows(bundle: CaseBundle): { at: string; line: string }[] {
  const rows: { at: string; line: string }[] = [];
  for (const message of bundle.messages) {
    rows.push({
      at: message.timestampUtc,
      line: `${formatEastern(message.timestampUtc)} SMS ${partyName(bundle, message.senderId)} → ${partyName(bundle, message.receiverId)}: ${message.messageText}`,
    });
  }
  for (const call of bundle.calls) {
    rows.push({
      at: call.timestampUtc,
      line: `${formatEastern(call.timestampUtc)} ${call.direction} call ${call.name} (${call.durationSec}s)`,
    });
  }
  for (const item of bundle.media) {
    rows.push({
      at: item.acquiredAt,
      line: `${formatEastern(item.acquiredAt)} media ${item.sourcePath}`,
    });
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

function tokensOf(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9+]{3,}/g) ?? []).filter((token) => !STOP.has(token));
}

function overlap(value: string, tokens: string[]): number {
  const hay = value.toLowerCase();
  return tokens.reduce((score, token) => score + (hay.includes(token) ? 1 : 0), 0);
}

function rankMessages(messages: Message[], tokens: string[]): Message[] {
  return messages
    .map((message) => ({ message, score: overlap(`${message.messageText} ${message.senderId} ${message.receiverId}`, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.message.timestampUtc.localeCompare(b.message.timestampUtc))
    .map((item) => item.message);
}

function callBlob(call: CallRecord): string {
  return `${call.name} ${call.number} ${call.direction}`;
}
