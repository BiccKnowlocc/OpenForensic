export const MIB = 1024 * 1024;
export const GIB = 1024 * MIB;
export const CHUNK_BYTES = 64 * MIB;
export const MAX_TARGET_BYTES = 512 * GIB;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function storageRoot(value: string): string {
  if (!/^\/storage\/emulated\/\d+$/.test(value))
    throw new Error(
      "Only Android's primary emulated shared storage is supported. Removable/adopted storage is excluded.",
    );
  return value;
}
export function jobDirectory(root: string, id: string): string {
  if (!UUID.test(id)) throw new Error("Invalid cleanup identifier.");
  return `${storageRoot(root)}/.OpenForensic-Sanitize-${id}`;
}
export function chunkPath(root: string, id: string, index: number): string {
  if (
    !Number.isInteger(index) ||
    index < 1 ||
    index > MAX_TARGET_BYTES / CHUNK_BYTES + 1
  )
    throw new Error("Invalid cleanup file index.");
  return `${jobDirectory(root, id)}/chunk-${String(index).padStart(6, "0")}.bin`;
}
const quote = (path: string) => `'${path}'`;
function ownedDirectory(root: string, id: string): string {
  const path = quote(jobDirectory(root, id));
  const marker = quote(jobDirectory(root, id) + "/owner.marker");
  return `test ! -L ${path} && test "$(readlink -f ${path})" = ${path} && test ! -L ${marker} && test -f ${marker} && test "$(cat ${marker})" = '${id}'`;
}
export function createDirectoryCommand(root: string, id: string): string {
  const directory = quote(jobDirectory(root, id));
  return `test ! -e ${directory} && test ! -L ${directory} && mkdir ${directory} && (set -C; printf '%s' '${id}' > ${quote(jobDirectory(root, id) + "/owner.marker")})`;
}
export function writeChunkCommand(
  root: string,
  id: string,
  index: number,
): string {
  return `${ownedDirectory(root, id)} && toybox dd of=${quote(chunkPath(root, id, index))} bs=262144 conv=excl,fsync status=none`;
}
export function verifyChunkCommand(
  root: string,
  id: string,
  index: number,
): string {
  const file = quote(chunkPath(root, id, index));
  return `${ownedDirectory(root, id)} && test ! -L ${file} && test -f ${file} && wc -c < ${file} && sha256sum ${file}`;
}
export function removeChunkCommand(
  root: string,
  id: string,
  index: number,
): string {
  const file = quote(chunkPath(root, id, index));
  const directory = quote(jobDirectory(root, id));
  return `if test ! -e ${directory} && test ! -L ${directory}; then :; else ${ownedDirectory(root, id)} && if test -e ${file} || test -L ${file}; then test ! -L ${file} && test -f ${file} && test "$(readlink -f ${file})" = ${file} && rm -f -- ${file}; fi; fi`;
}
export function removeDirectoryCommand(root: string, id: string): string {
  const directory = quote(jobDirectory(root, id));
  const marker = quote(jobDirectory(root, id) + "/owner.marker");
  return `if test ! -e ${directory} && test ! -L ${directory}; then :; else ${ownedDirectory(root, id)} && test "$(ls -A ${directory})" = 'owner.marker' && rm -f -- ${marker} && rmdir ${directory}; fi`;
}
export function parseStorage(output: string): {
  totalBytes: number;
  freeBytes: number;
  filesystem: string;
} {
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\d+)\s+\d+\s+(\d+)\s+\d+%\s+\S+\s*$/.exec(
      line.trim(),
    );
    if (!match) continue;
    const totalBytes = Number(match[2]) * 1024;
    const freeBytes = Number(match[3]) * 1024;
    if (
      !Number.isSafeInteger(totalBytes) ||
      !Number.isSafeInteger(freeBytes) ||
      freeBytes < 0 ||
      freeBytes > totalBytes ||
      totalBytes <= 0
    )
      throw new Error("Invalid device storage counters.");
    return { totalBytes, freeBytes, filesystem: match[1] };
  }
  throw new Error(
    "Cannot read reliable storage counters. No cleanup will start.",
  );
}
export function reserveBytes(total: number): number {
  return Math.max(2 * GIB, Math.ceil(total * 0.05));
}
export function parseBattery(output: string): {
  level: number;
  temperatureC: number;
  powered: boolean;
} {
  const level = Number(/\blevel:\s*(\d+)/.exec(output)?.[1]);
  const temperatureC =
    Number(/\btemperature:\s*(-?\d+)/.exec(output)?.[1]) / 10;
  const powered = /(?:AC|USB|Wireless|Dock) powered:\s*true/i.test(output);
  if (
    !Number.isFinite(level) ||
    level < 0 ||
    level > 100 ||
    !Number.isFinite(temperatureC)
  )
    throw new Error("Cannot read battery safety information.");
  return { level, temperatureC, powered };
}
export function safeBattery(battery: ReturnType<typeof parseBattery>): void {
  if (!battery.powered || battery.level < 30)
    throw new Error(
      "Connect the phone to power and charge it to at least 30% before cleanup.",
    );
  if (battery.temperatureC >= 42)
    throw new Error(
      "The phone is too warm for cleanup. Let it cool below 42°C.",
    );
}
