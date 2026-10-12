import { ForensicCase } from "./case";
import type { Message } from "../shared/types";
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function reportHtml(item: ForensicCase, aiId: string): string {
  const run = aiId
    ? (item.store.db.prepare("SELECT * FROM ai_runs WHERE id=?").get(aiId) as
        | {
            response: string;
            source_ids_json: string;
            model: string;
            created_utc: string;
            truncated: number;
          }
        | undefined)
    : undefined;
  if (aiId && !run)
    throw new Error("The selected AI draft is not in this case.");
  const records = run
    ? (JSON.parse(run.source_ids_json) as number[]).map(
        (id) =>
          item.store.db
            .prepare("SELECT * FROM messages WHERE id=?")
            .get(id) as Message,
      )
    : [];
  const evidence = item.store.evidence();
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>OpenForensic examination report</title>
    <style>body{font:14px/1.6 system-ui;margin:48px;color:#17212b}h1{font-size:28px}h2{margin-top:32px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{padding:8px;border:1px solid #ccd2d8;text-align:left;word-break:break-word}pre{white-space:pre-wrap;font:13px/1.7 system-ui}.notice{padding:16px;background:#f2f4f6}@media print{body{margin:18mm}tr{break-inside:avoid}}</style>
    <h1>OpenForensic examination report</h1><p>Case ${escapeHtml(item.info.name)} · ${escapeHtml(item.info.id)}</p>
    <p>Operator: ${escapeHtml(item.info.operator)}<br>Authority recorded: ${escapeHtml(item.info.authority)}<br>Generated UTC: ${new Date().toISOString()}</p>
    <div class="notice">Examiner draft. Hashes demonstrate byte consistency, not authorship or truth. Live ADB acquisition can cause device-side logging and cannot guarantee hardware write blocking. Carved fragments and WAL versions require independent interpretation. No encryption or lock-screen bypass is performed.</div>
    <h2>Evidence register</h2><table><tr><th>ID / Source</th><th>Status / Bytes</th><th>SHA-256 / MD5</th></tr>${evidence.map((e) => `<tr><td>${escapeHtml(e.id)}<br>${escapeHtml(e.source)}</td><td>${escapeHtml(e.status)}<br>${e.bytes}</td><td>${escapeHtml(e.sha256)}<br>${escapeHtml(e.md5)}</td></tr>`).join("")}</table>
    <h2>Examination coverage</h2><p>${item.store.stats().messages} normalized messages; ${item.store.stats().candidates} recovered candidates. Provider text serialization, unsupported schemas, missing media and acquisition errors may limit interpretation. Audit events: ${item.audit.read().length}. Audit head: ${escapeHtml(item.audit.read().at(-1)?.hash)}</p>
    ${run ? `<h2>AI-assisted draft</h2><p>Local model: ${escapeHtml(run.model)} · UTC ${escapeHtml(run.created_utc)} · Context limited: ${run.truncated ? "yes" : "no"}. Citation IDs are validated; factual accuracy must be reviewed by an examiner.</p><pre>${escapeHtml(run.response)}</pre><h2>Source appendix</h2>${records.map((m) => `<p><strong>[M:${m.id}] ${escapeHtml(m.timestamp_utc)} · ${escapeHtml(m.platform)}</strong><br>${escapeHtml(m.sender_id)} → ${escapeHtml(m.receiver_id)}<br>${escapeHtml(m.message_text)}<br>Evidence ${escapeHtml(m.evidence_id)} · ${escapeHtml(m.source_locator)} · confidence ${escapeHtml(m.confidence)}</p>`).join("")}` : ""}
    </html>`;
}
