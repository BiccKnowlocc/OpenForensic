import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FolderOpen, Plus } from "lucide-react";
import type { CaseListResponse, CaseSummary } from "../../../shared/types";
import { useApi } from "../api-context";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { ErrorBlock, LoadingBlock } from "./states";

export function HomeScreen() {
  const api = useApi();
  const navigate = useNavigate();
  const [data, setData] = useState<CaseListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api.listCases());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load cases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [api]);

  async function createCase() {
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.createCase({ name, operator });
      setOpen(false);
      setName("");
      setOperator("");
      navigate(`/case/${created.id}`);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Could not create the case.");
    } finally {
      setSaving(false);
    }
  }

  async function pickFolder() {
    if (!api.pickCaseFolder) return;
    setError(null);
    try {
      const opened = await api.pickCaseFolder();
      if (opened) navigate(`/case/${opened.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That folder is not an OpenForensic case.");
    }
  }

  const cases = data?.cases ?? [];
  const sample = cases.find((item) => item.sample);
  const rest = cases.filter((item) => !item.sample);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brass">OpenForensic</p>
          <h1 className="mt-2 font-serif text-4xl text-paper sm:text-5xl">Case desk</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Logical Android acquisition after the phone user has authorized USB debugging. SMS, calls, contacts, and shared media. No lock-screen bypass and no physical image.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New case</Button>
          {api.pickCaseFolder ? <Button variant="outline" onClick={() => void pickFolder()}><FolderOpen className="size-4" /> Open folder</Button> : null}
        </div>
      </header>

      {data && !data.atlas ? (
        <p className="rounded-md border border-line bg-panel px-4 py-3 text-sm text-muted">
          Atlas is not connected. The Harbor Street sample is on this machine. Set <span className="font-mono text-paper">MONGODB_URI</span> in the host environment when the OpenForensic cluster is ready. {data.atlasError ? data.atlasError : ""}
        </p>
      ) : null}
      {data?.atlas ? <p className="text-sm text-moss">Atlas project OpenForensic is connected. The viewer can read cases stored there.</p> : null}

      {loading ? <LoadingBlock label="Loading cases…" /> : null}
      {error ? <ErrorBlock message={error} onRetry={() => void load()} /> : null}

      {!loading && !error && cases.length === 0 ? (
        <EmptyCases />
      ) : null}

      {sample ? <SampleCard item={sample} /> : null}

      {rest.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-muted">Cases</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rest.map((item) => <CaseCard key={item.id} item={item} />)}
          </ul>
        </section>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New case">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void createCase();
            }}
          >
            <label className="block text-sm text-muted">
              Case name
              <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} placeholder="Harbor Street" required />
            </label>
            <label className="block text-sm text-muted">
              Operator
              <Input className="mt-1" value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="Your name" required />
            </label>
            {formError ? <ErrorBlock message={formError} /> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !name.trim() || !operator.trim()}>{saving ? "Creating…" : "Create case"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyCases() {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-10 text-center">
      <p className="font-serif text-2xl">No cases yet</p>
      <p className="mt-2 text-sm text-muted">Create a case for a phone, or open the Harbor Street sample if it failed to load.</p>
    </div>
  );
}

function SampleCard({ item }: { item: CaseSummary }) {
  return (
    <Link to={`/case/${item.id}`} className="block rounded-lg border border-brass/40 bg-panel p-5 hover:border-brass">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Sample</Badge>
        <Badge tone="muted">No phone</Badge>
      </div>
      <h2 className="mt-3 font-serif text-3xl">{item.name}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Synthetic SMS, calls, contacts, and shared-media placeholders with real hashes. Timeline, chat, and review work with nothing plugged in. This is not an acquisition.
      </p>
    </Link>
  );
}

function CaseCard({ item }: { item: CaseSummary }) {
  return (
    <li>
      <Link to={`/case/${item.id}`} className="block rounded-md border border-line bg-panel p-4 hover:border-brass/60">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-xl">{item.name}</h3>
          {item.status === "archived" ? <Badge tone="muted">Archived</Badge> : null}
        </div>
        <p className="mt-2 text-xs text-muted">{item.operator} · {item.deviceLabel}</p>
      </Link>
    </li>
  );
}
