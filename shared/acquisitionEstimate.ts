export const MIN_ESTIMATE_BYTES = 64 * 1024;
export const MIN_ESTIMATE_MS = 3_000;

export type AcquisitionStatus = "idle" | "running" | "done" | "stopped";

export type AcquisitionReadout = {
  elapsedLabel: string;
  remainingLabel: string;
  throughputLabel: string;
  hashLabel: string;
  hashRatio: number | null;
};

export function describeAcquisition(input: {
  status: AcquisitionStatus;
  bytesDone: number;
  bytesExpected: number | null;
  elapsedMs: number;
}): AcquisitionReadout {
  const elapsedMs = Math.max(0, input.elapsedMs);
  const bytesDone = Math.max(0, input.bytesDone);
  const expected = input.bytesExpected !== null && input.bytesExpected > 0 ? input.bytesExpected : null;
  const enough = elapsedMs >= MIN_ESTIMATE_MS && bytesDone >= MIN_ESTIMATE_BYTES;
  const bytesPerSecond = elapsedMs > 0 ? bytesDone / (elapsedMs / 1000) : 0;
  const hashRatio = expected === null ? null : Math.min(1, bytesDone / expected);

  return {
    elapsedLabel: input.status === "idle" ? "—" : formatDuration(elapsedMs),
    remainingLabel: remainingLabel(input.status, enough, expected, bytesDone, bytesPerSecond),
    throughputLabel: throughputLabel(input.status, enough, bytesPerSecond),
    hashLabel: hashLabel(bytesDone, expected, hashRatio),
    hashRatio,
  };
}

function remainingLabel(
  status: AcquisitionStatus,
  enough: boolean,
  expected: number | null,
  bytesDone: number,
  bytesPerSecond: number,
): string {
  if (status === "idle") return "—";
  if (status === "done") return "Done";
  if (status === "stopped") return "Stopped";
  if (!enough || expected === null || bytesPerSecond <= 0) return "Estimating";
  const left = Math.max(0, expected - bytesDone);
  return `about ${formatDuration(Math.round((left / bytesPerSecond) * 1000))}`;
}

function throughputLabel(status: AcquisitionStatus, enough: boolean, bytesPerSecond: number): string {
  if (status === "idle") return "—";
  if (!enough || bytesPerSecond <= 0) return "Estimating";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function hashLabel(bytesDone: number, expected: number | null, ratio: number | null): string {
  if (ratio === null) {
    return bytesDone > 0 ? `${formatBytes(bytesDone)} hashed` : "Waiting";
  }
  return `${Math.round(ratio * 100)}% · ${formatBytes(bytesDone)} / ${formatBytes(expected ?? 0)}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
