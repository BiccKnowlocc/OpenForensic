import { useEffect, useMemo, useState } from "react";
import { partyName, threadTitle, formatUtc } from "../../../shared/names";
import type { CaseBundle, Message } from "../../../shared/types";
import { useApi } from "../api-context";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { EmptyBlock } from "./states";

export function Chat({
  bundle,
  threadId,
  onThread,
}: {
  bundle: CaseBundle;
  threadId: string | null;
  onThread: (id: string | null) => void;
}) {
  const api = useApi();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Message[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const threads = useMemo(() => {
    const ids = [...new Set(bundle.messages.map((message) => message.threadId))];
    return ids.map((id) => {
      const messages = bundle.messages.filter((message) => message.threadId === id);
      const last = [...messages].sort((a, b) => b.timestampUtc.localeCompare(a.timestampUtc))[0];
      return { id, title: threadTitle(bundle, id), count: messages.length, preview: last?.messageText ?? "" };
    });
  }, [bundle]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    if (desktop && threadId === null && threads[0]) onThread(threads[0].id);
  }, [threads, threadId, onThread]);

  useEffect(() => {
    if (!query.trim()) {
      setHits(null);
      setSearchError(null);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      void api.search(bundle.summary.id, query)
        .then((messages) => { setHits(messages); setSearchError(null); })
        .catch((error) => setSearchError(error instanceof Error ? error.message : "Search failed."))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, api, bundle.summary.id]);

  const messages = bundle.messages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));

  return (
    <div className="grid min-h-[28rem] gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div className={threadId ? "hidden md:block" : "block"}>
        {threads.length === 0 ? <EmptyBlock title="No messages" body="This case has no SMS yet. Run a logical extraction from an authorized phone, or open the Harbor Street sample." /> : (
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => { onThread(thread.id); setQuery(""); }}
                  className={`w-full rounded-md border px-3 py-2 text-left ${thread.id === threadId ? "border-brass bg-panel-2" : "border-line bg-panel"}`}
                >
                  <span className="block text-sm">{thread.title}</span>
                  <span className="mt-1 line-clamp-2 block text-xs text-muted">{thread.preview}</span>
                  <span className="mt-1 block text-[11px] text-muted">{thread.count} messages</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <section className={`flex min-h-0 flex-col rounded-md border border-line bg-panel ${threadId ? "" : "hidden md:flex"}`}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <button type="button" className="text-sm text-brass md:hidden" onClick={() => onThread(null)}>Threads</button>
          <h2 className="font-serif text-xl">{threadId ? threadTitle(bundle, threadId) : "Thread"}</h2>
        </div>
        <div className="border-b border-line p-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages in this case" aria-label="Search messages" />
          <p className="mt-1 text-[11px] text-muted">{api.mode === "desktop" ? "Desktop search uses SQLite FTS5 in case_store.db." : "Viewer search matches every word in the case records."}</p>
          {searching ? <p className="mt-1 text-xs text-muted">Searching…</p> : null}
          {searchError ? <p className="mt-1 text-xs text-danger">{searchError}</p> : null}
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-3">
          {query.trim() && hits && hits.length === 0 ? <EmptyBlock title="No matches" body="Nothing in this case matched that search." /> : null}
          {query.trim() && hits ? hits.map((message) => <Bubble key={message.id} bundle={bundle} message={message} />) : null}
          {!query.trim() && messages.length === 0 ? <EmptyBlock title="No thread open" body="Choose a thread. Deleted flags stay visible when the provider returned the row." /> : null}
          {!query.trim() && messages.map((message) => <Bubble key={message.id} bundle={bundle} message={message} />)}
        </div>
      </section>
    </div>
  );
}

function Bubble({ bundle, message }: { bundle: CaseBundle; message: Message }) {
  const outbound = message.senderId === bundle.summary.ownerNumber || message.senderId === "device";
  return (
    <article className={`max-w-[40rem] rounded-md border px-3 py-2 ${outbound ? "ml-auto border-brass/40 bg-brass/10" : "mr-auto border-line bg-ink"}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>{partyName(bundle, message.senderId)}</span>
        <span>{formatUtc(message.timestampUtc)}</span>
        {message.isDeletedFlag ? <Badge tone="danger">Deleted flag</Badge> : null}
      </div>
      <p className="mt-1 text-sm leading-6">{message.messageText}</p>
      {message.mediaPath ? <p className="mt-1 font-mono text-[11px] text-sea">{message.mediaPath}</p> : null}
    </article>
  );
}
