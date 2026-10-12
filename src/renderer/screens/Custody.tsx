import { useEffect, useState } from "react";
import { formatEastern } from "../../../shared/names";
import type { CaseBundle, VerifyReport } from "../../../shared/types";
import { useApi } from "../api-context";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ErrorBlock } from "./states";

export function Custody({ bundle }: { bundle: CaseBundle }) {
  const api = useApi();
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    if (!api.verifyCase || api.mode !== "desktop") return;
    setChecking(true);
    setError(null);
    try {
      setReport(await api.verifyCase(bundle.summary.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check the saved files.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { void check(); }, [bundle.summary.id]);

  function printReport() {
    document.body.classList.add("printing-custody");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-custody"), { once: true });
    window.print();
  }

  const acquisition = bundle.manifest.acquisition === "partial" ? "Partial" : bundle.manifest.acquisition === "complete" ? "Complete" : "Not recorded";
  const posture = bundle.manifest.device?.posture;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Hashes and times for this case folder. Times are US Eastern.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking || api.mode !== "desktop"}>{checking ? "Checking…" : "Check saved files"}</Button>
          <Button size="sm" onClick={printReport}>Print custody report</Button>
        </div>
      </div>
      {api.mode !== "desktop" ? <p className="no-print text-xs text-muted">The viewer can print the report. Comparing files to the manifest runs in the desktop app, where the case folder lives.</p> : null}
      {error ? <div className="no-print"><ErrorBlock message={error} onRetry={() => void check()} /></div> : null}
      {report ? (
        <div className="no-print rounded border border-line p-3 text-sm">
          <p>{formatEastern(report.checkedAt)} · {report.message}</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {report.items.map((item) => (
              <li key={`${item.localPath}-${item.sourcePath}`} className={item.status === "match" ? "text-moss" : item.status === "skipped" ? "text-muted" : "text-danger"}>
                {item.status} · {item.localPath || item.sourcePath} · {item.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <article id="custody-report" className="space-y-4 rounded-md border border-line bg-panel p-4">
        <header>
          <p className="text-[11px] uppercase tracking-wide text-muted">OpenForensic custody report</p>
          <h2 className="mt-1 font-serif text-3xl">{bundle.summary.name}</h2>
          <p className="mt-1 text-sm text-muted">{bundle.summary.operator} · opened {formatEastern(bundle.summary.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={bundle.manifest.acquisition === "partial" ? "danger" : "moss"}>{acquisition}</Badge>
            {bundle.summary.sample ? <Badge>Sample</Badge> : null}
          </div>
        </header>
        {posture ? (
          <section>
            <h3 className="text-sm font-medium">Device posture</h3>
            <p className="mt-1 text-sm">{posture.model} · Android {posture.android} · patch {posture.securityPatch} · {posture.encryption} · credential {posture.credential}</p>
          </section>
        ) : null}
        <section>
          <h3 className="text-sm font-medium">Manifest</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Source</th>
                  <th className="py-1 pr-3 font-medium">Saved</th>
                  <th className="py-1 pr-3 font-medium">Bytes</th>
                  <th className="py-1 pr-3 font-medium">MD5</th>
                  <th className="py-1 pr-3 font-medium">SHA-256</th>
                  <th className="py-1 font-medium">Acquired</th>
                </tr>
              </thead>
              <tbody>
                {bundle.manifest.items.map((item) => (
                  <tr key={`${item.sourcePath}-${item.localPath}`} className="border-t border-line align-top">
                    <td className="py-2 pr-3">{item.sourcePath}</td>
                    <td className="py-2 pr-3 font-mono">{item.localPath || item.status}</td>
                    <td className="py-2 pr-3 font-mono">{item.bytes}</td>
                    <td className="py-2 pr-3 font-mono break-all">{item.md5 || "—"}</td>
                    <td className="py-2 pr-3 font-mono break-all">{item.sha256 || "—"}</td>
                    <td className="py-2 whitespace-nowrap">{formatEastern(item.acquiredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h3 className="text-sm font-medium">Audit log</h3>
          <ol className="mt-2 space-y-1 font-mono text-xs text-muted">
            {bundle.audit.map((event) => (
              <li key={event.id}>{formatEastern(event.at)} · {event.action} · {event.detail}</li>
            ))}
          </ol>
        </section>
      </article>
    </div>
  );
}
