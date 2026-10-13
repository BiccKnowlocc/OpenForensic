import { useState } from "react";
import type { CaseBundle, ReviewTask } from "../../../shared/types";
import { threadTitle } from "../../../shared/names";
import { useApi } from "../api-context";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { EmptyBlock, ErrorBlock } from "./states";

export function Review({ bundle, threadId }: { bundle: CaseBundle; threadId: string | null }) {
  const api = useApi();
  const [question, setQuestion] = useState("Who mentioned the gray sedan and the plate?");
  const [text, setText] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: ReviewTask) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.review({
        task,
        caseId: bundle.summary.id,
        question,
        threadId: threadId ?? undefined,
        caseBundle: bundle,
      });
      setText(response.text);
      setLabel(response.label);
      setProvider(response.provider);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        <p className="text-sm text-muted">Review uses records already in this case. It will not invent messages or suggest a bypass.</p>
        <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Question about this case" />
        <div className="flex flex-col gap-2">
          <Button onClick={() => void run("ask")} disabled={loading || !question.trim()}>Ask about this case</Button>
          <Button variant="outline" onClick={() => void run("summarize_thread")} disabled={loading || !threadId}>Summarize {threadId ? threadTitle(bundle, threadId) : "a thread"}</Button>
          <Button variant="outline" onClick={() => void run("explain_timeline")} disabled={loading}>Explain the timeline</Button>
          <Button variant="outline" onClick={() => void run("draft_report")} disabled={loading}>Draft a short report</Button>
        </div>
        {!threadId ? <p className="text-xs text-muted">Open a thread in Messages to summarize it.</p> : null}
      </div>
      <div className="rounded-md border border-line bg-panel p-4">
        {loading ? <p className="text-sm text-muted">Reviewing case records…</p> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {!loading && !text && !error ? <EmptyBlock title="No review yet" body="Ask a question, summarize the open thread, explain the timeline, or draft a short report." /> : null}
        {text ? (
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone={provider === "netlify-ai-gateway" ? "sea" : "brass"}>{provider === "netlify-ai-gateway" ? "Gateway" : "Local review"}</Badge>
            </div>
            {label ? <p className="mb-3 text-xs text-muted">{label}</p> : null}
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{text}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
