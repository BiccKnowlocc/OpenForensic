import { formatEastern } from "./names";
import type { CaseBundle } from "./types";

export function custodyReportHtml(bundle: CaseBundle): string {
  const { summary, manifest, audit } = bundle;
  const acquisition = manifest.acquisition === "partial" ? "Partial" : manifest.acquisition === "complete" ? "Complete" : "Not recorded";
  const posture = manifest.device?.posture;
  const rows = manifest.items.map((item) => `<tr>
<td>${escapeHtml(item.sourcePath)}</td>
<td>${escapeHtml(item.localPath || item.status)}</td>
<td>${item.bytes}</td>
<td>${escapeHtml(item.md5 || "—")}</td>
<td>${escapeHtml(item.sha256 || "—")}</td>
<td>${escapeHtml(formatEastern(item.acquiredAt))}</td>
</tr>`).join("\n");
  const log = audit.map((event) => `<li>${escapeHtml(formatEastern(event.at))} · ${escapeHtml(event.action)} · ${escapeHtml(event.detail)}</li>`).join("\n");
  const postureLine = posture
    ? `<p>${escapeHtml(posture.model)} · Android ${escapeHtml(posture.android)} · patch ${escapeHtml(posture.securityPatch)} · ${escapeHtml(posture.encryption)} · credential ${escapeHtml(posture.credential)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Custody report — ${escapeHtml(summary.name)}</title>
<style>
body { font-family: Georgia, serif; color: #1a1a1a; margin: 2rem; }
h1 { font-size: 1.8rem; margin-bottom: 0.2rem; }
p, li { font-family: "IBM Plex Sans", sans-serif; font-size: 0.95rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
th, td { border-top: 1px solid #ccc; text-align: left; vertical-align: top; padding: 0.4rem 0.5rem 0.4rem 0; word-break: break-all; }
th { font-weight: 600; }
.muted { color: #444; }
</style>
</head>
<body>
<p class="muted">OpenForensic custody report. Times are US Eastern (EDT or EST).</p>
<h1>${escapeHtml(summary.name)}</h1>
<p>${escapeHtml(summary.operator)} · opened ${escapeHtml(formatEastern(summary.createdAt))}</p>
<p>Acquisition: ${escapeHtml(acquisition)}${summary.sample ? " · Sample" : ""}</p>
${postureLine}
<h2>Manifest</h2>
<table>
<thead><tr><th>Source</th><th>Saved</th><th>Bytes</th><th>MD5</th><th>SHA-256</th><th>Acquired</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<h2>Audit log</h2>
<ol>
${log}
</ol>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
