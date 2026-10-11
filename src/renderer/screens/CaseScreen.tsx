import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { CaseBundle } from "../../../shared/types";
import { useApi } from "../api-context";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Chat } from "./Chat";
import { Monitor } from "./Monitor";
import { Review } from "./Review";
import { Timeline } from "./Timeline";
import { ErrorBlock, LoadingBlock } from "./states";

export function CaseScreen() {
  const api = useApi();
  const { id = "" } = useParams();
  const [bundle, setBundle] = useState<CaseBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBundle(await api.getCase(id));
    } catch (caught) {
      setBundle(null);
      setError(caught instanceof Error ? caught.message : "Could not open that case.");
    } finally {
      setLoading(false);
    }
  }, [api, id]);

  useEffect(() => { void load(); }, [load]);

  async function archive() {
    setArchiveError(null);
    try {
      await api.archiveCase(id);
      setArchiveOpen(false);
      await load();
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : "Could not archive the case.");
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-paper"><ArrowLeft className="size-4" /> Cases</Link>
        {bundle ? (
          <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)} disabled={bundle.summary.sample || bundle.summary.status === "archived"}>
            {bundle.summary.status === "archived" ? "Archived" : "Archive"}
          </Button>
        ) : null}
      </div>
      {loading ? <LoadingBlock label="Opening case…" /> : null}
      {error ? <ErrorBlock message={error} onRetry={() => void load()} /> : null}
      {bundle ? (
        <>
          <header>
            <div className="flex flex-wrap items-center gap-2">
              {bundle.summary.sample ? <Badge>Sample</Badge> : <Badge tone="moss">Case</Badge>}
              {bundle.summary.status === "archived" ? <Badge tone="muted">Archived</Badge> : null}
            </div>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{bundle.summary.name}</h1>
            <p className="mt-1 text-sm text-muted">{bundle.summary.operator} · {bundle.summary.deviceLabel}</p>
          </header>
          <Tabs defaultValue="monitor" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="monitor">Monitor</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="review">Review</TabsTrigger>
            </TabsList>
            <TabsContent value="monitor" className="pt-4"><Monitor bundle={bundle} onChange={() => void load()} /></TabsContent>
            <TabsContent value="timeline" className="pt-4"><Timeline bundle={bundle} /></TabsContent>
            <TabsContent value="messages" className="pt-4"><Chat bundle={bundle} threadId={threadId} onThread={(id) => setThreadId(id)} /></TabsContent>
            <TabsContent value="review" className="pt-4"><Review bundle={bundle} threadId={threadId} /></TabsContent>
          </Tabs>
        </>
      ) : null}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent title="Archive this case">
          <p className="text-sm text-muted">The folder, evidence manifest, and audit log stay. Archived cases remain openable.</p>
          {archiveError ? <div className="mt-3"><ErrorBlock message={archiveError} /></div> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void archive()}>Archive</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
