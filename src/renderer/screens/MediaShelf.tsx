import { useState } from "react";
import { previewKind } from "../../../shared/savedFiles";
import { formatEastern } from "../../../shared/names";
import type { CaseBundle, MediaItem } from "../../../shared/types";
import { useApi } from "../api-context";

export function MediaShelf({ bundle }: { bundle: CaseBundle }) {
  if (bundle.media.length === 0) {
    return <p className="text-sm text-muted">No shared-storage files have been copied into this case yet.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {bundle.media.map((item) => <MediaCard key={item.id} bundle={bundle} item={item} />)}
    </ul>
  );
}

function MediaCard({ bundle, item }: { bundle: CaseBundle; item: MediaItem }) {
  const api = useApi();
  const kind = previewKind(item.localPath);
  const src = api.mediaSrc?.(bundle.summary.id, item.localPath) ?? null;
  const [failed, setFailed] = useState(false);
  const showImage = kind === "image" && src && !failed;
  const showAudio = kind === "audio" && src && !failed;
  return (
    <li className="rounded border border-line p-3">
      <p className="text-sm">{item.note}</p>
      <p className="mt-1 font-mono text-[11px] text-muted">{item.sourcePath}</p>
      <p className="mt-1 text-[11px] text-muted">{formatEastern(item.acquiredAt)} · {item.bytes} bytes</p>
      {showImage ? <img src={src} alt={item.note} className="mt-3 max-h-56 w-full rounded bg-ink object-contain" onError={() => setFailed(true)} /> : null}
      {showAudio ? <audio className="mt-3 w-full" controls src={src} onError={() => setFailed(true)} /> : null}
      {!showImage && !showAudio ? <p className="mt-3 text-xs text-muted">{kind === "other" ? "This copied file is not a photo or an audio clip." : "The preview is not available from this screen."}</p> : null}
    </li>
  );
}
