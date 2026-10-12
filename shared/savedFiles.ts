import type { EvidenceManifest, SavedFile } from "./types";

export function savedFromManifest(manifest: EvidenceManifest): SavedFile[] {
  return manifest.items
    .filter((item) => item.status === "hashed" && item.localPath.length > 0)
    .map((item) => ({
      sourcePath: item.sourcePath,
      localPath: item.localPath,
      bytes: item.bytes,
      sha256: item.sha256,
      acquiredAt: item.acquiredAt,
    }));
}

export function previewKind(localPath: string): "image" | "audio" | "other" {
  const ext = localPath.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic"].includes(ext)) return "image";
  if (["mp3", "m4a", "wav", "ogg", "aac", "flac", "amr", "opus"].includes(ext)) return "audio";
  return "other";
}
