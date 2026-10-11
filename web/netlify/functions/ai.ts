import type { Config, Context } from "@netlify/functions";
import OpenAI from "openai";
import { localReview } from "../../../shared/aiReview";
import type { CaseBundle, ReviewRequest, ReviewResponse } from "../../../shared/types";
import { readEnv } from "./netlify-env";

const MODEL = "gpt-4o-mini";

const SYSTEM = [
  "You are the OpenForensic review assistant.",
  "Use only the case JSON in the user message.",
  "Do not invent messages, phone numbers, times, or people.",
  "If the case does not contain the answer, say that it does not.",
  "Do not suggest a lock-screen bypass, root exploit, encryption bypass, or any acquisition the case does not already hold.",
  "Write in plain sentences an examiner can read.",
].join(" ");

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const request = await req.json() as ReviewRequest;
  const bundle = request.caseBundle;
  if (!bundle?.summary?.id) {
    return Response.json({ message: "Review needs the case records that are already open." }, { status: 400 });
  }
  const fallback = localReview(request, bundle);
  const gateway = await gatewayReview(request, bundle);
  return Response.json(gateway ?? fallback);
};

async function gatewayReview(request: ReviewRequest, bundle: CaseBundle): Promise<ReviewResponse | null> {
  const apiKey = readEnv("OPENAI_API_KEY");
  const baseURL = readEnv("OPENAI_BASE_URL");
  if (!apiKey || !baseURL) return null;
  try {
    const client = new OpenAI({ apiKey, baseURL });
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(request, bundle) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) return null;
    return {
      text,
      provider: "netlify-ai-gateway",
      model: MODEL,
      label: `Netlify AI Gateway · ${MODEL}. Answers are limited to records already in this case.`,
    };
  } catch {
    return null;
  }
}

function userPrompt(request: ReviewRequest, bundle: CaseBundle): string {
  const payload = {
    summary: bundle.summary,
    contacts: bundle.contacts,
    messages: bundle.messages,
    calls: bundle.calls,
    media: bundle.media.map((item) => ({ sourcePath: item.sourcePath, kind: item.kind, note: item.note, acquiredAt: item.acquiredAt })),
  };
  const taskLine = request.task === "ask"
    ? `Question: ${request.question ?? ""}`
    : request.task === "summarize_thread"
      ? `Summarize thread ${request.threadId ?? "(none selected)"}.`
      : request.task === "explain_timeline"
        ? "Explain the timeline in order."
        : "Draft a short report from these records only.";
  return `${taskLine}\n\nCase JSON:\n${JSON.stringify(payload).slice(0, 120000)}`;
}

export const config: Config = {
  path: "/api/ai",
  method: "POST",
};
