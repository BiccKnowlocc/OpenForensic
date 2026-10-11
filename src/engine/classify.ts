export type FailureKind = "permission" | "encrypted" | "disconnect" | "other";

export function classifyAdbFailure(text: string): FailureKind | null {
  const value = text.toLowerCase();
  if (!value.trim()) return null;
  if (
    value.includes("device offline") ||
    value.includes("device not found") ||
    value.includes("no devices") ||
    value.includes("device '" ) && value.includes("not found") ||
    value.includes("closed") && value.includes("transport")
  ) {
    return "disconnect";
  }
  if (
    value.includes("required key not available") ||
    value.includes("failed to decrypt") ||
    value.includes("file-based encryption") ||
    value.includes("encryption") && value.includes("locked")
  ) {
    return "encrypted";
  }
  if (
    value.includes("permission denial") ||
    value.includes("securityexception") ||
    value.includes("permission denied") ||
    value.includes("unauthorized") ||
    value.includes("does not have android.permission")
  ) {
    return "permission";
  }
  if (value.includes("error:") || value.includes("exception")) return "other";
  return null;
}

export function failureMessage(kind: FailureKind, source: string): string {
  if (kind === "disconnect") return `USB device disappeared while reading ${source}. Extraction stopped. Partial files already written stay in the case.`;
  if (kind === "permission") return `Permission denied for ${source}. Extraction of that source stopped. OpenForensic will not try another privilege path.`;
  if (kind === "encrypted") return `Encrypted or locked data blocked ${source}. The read stopped. There is no lock-screen or encryption bypass.`;
  return `The read of ${source} failed. The error is in the audit log.`;
}
