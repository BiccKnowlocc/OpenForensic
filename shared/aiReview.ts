import { formatUtc, partyName, threadTitle } from "./names";
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
    label: "Local review \u2014 Netlify AI Gateway unreachable. Answers use only records already in this case.",
  };
}
