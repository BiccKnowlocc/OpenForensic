import path from "node:path";
import type { DeviceFingerprint, ExtractEvent, ManifestItem } from "../../shared/types";
import { appendAudit } from "./auditLog";
import {
  AdbCommandError,
  contentQuery,
  fingerprintDevice,
  listSharedFiles,
  pullHashed,
  watchDevice,
  writeCommandHashed,
  assertCommandOk,
} from "./adb";
import { failureMessage } from "./classify";
import { callsFromRows, contactsFromRows, messagesFromSmsRows, parseContentRows } from "./contentQuery";
import { addManifestItem, readManifest, writeManifest } from "./manifest";
import { replaceCaseRecords, readCaseFile } from "./caseFile";
import { replaceMessages } from "../db/index";

const SOURCES = [
  { id: "sms", label: "SMS", uri: "content://sms" },
  { id: "calls", label: "Call log", uri: "content://call_log/calls" },
  { id: "contacts", label: "Contacts", uri: "content://contacts/phones" },
] as const;

const MEDIA_ROOTS = ["/sdcard/DCIM", "/sdcard/Download", "/sdcard/Recordings"] as const;

export async function runLogicalExtraction(options: {
  caseDir: string;
  serial: string;
  onEvent: (event: ExtractEvent) => void;
}): Promise<{ ok: boolean; message: string }> {
  const { caseDir, serial, onEvent } = options;
  let disconnected = false;
  const stopWatch = watchDevice(serial, () => { disconnected = true; });
  const emit = (event: ExtractEvent) => onEvent(event);
  try {
    const device = await fingerprintDevice(serial);
    const manifest = await readManifest(caseDir);
    manifest.device = device;
    await writeManifest(caseDir, manifest);
    await appendAudit(caseDir, { action: "extraction_started", detail: `Logical extraction on ${device.model} (${device.serial}). Rooted shell: ${device.rooted ? "yes, v1 still reads only logical sources" : "no"}.` });
    emit({ type: "log", message: `Device ${device.model}, Android ${device.android}, SELinux ${device.selinux}.` });

    const existing = await readCaseFile(caseDir);
    let messages = existing.messages;
    let calls = existing.calls;
    let contacts = existing.contacts;
    const media = [...existing.media];
    let bytesDone = 0;
    let bytesExpected: number | null = null;
    let unknownFiles = 0;
    const emitProgress = () => emit({
      type: "progress",
      message: "",
      bytesDone,
      bytesExpected: unknownFiles === 0 ? bytesExpected : null,
    });
    emitProgress();

    for (const source of SOURCES) {
      if (disconnected) return await stopDisconnect(caseDir, emit);
      emit({ type: "source", source: source.id, status: "reading", message: `Reading ${source.uri}` });
      try {
        const result = await contentQuery(serial, source.uri);
        if (disconnected) return await stopDisconnect(caseDir, emit);
        assertCommandOk(result, source.uri);
        const localPath = `raw/${source.id}.txt`;
        const digests = await writeCommandHashed(result, path.join(caseDir, localPath));
        const rows = parseContentRows(result.stdout);
        if (source.id === "sms") messages = messagesFromSmsRows(rows, existing.summary.ownerNumber);
        if (source.id === "calls") calls = callsFromRows(rows);
        if (source.id === "contacts") contacts = contactsFromRows(rows);
        bytesDone += digests.bytes;
        if (bytesExpected !== null) bytesExpected = bytesExpected + digests.bytes;
        emitProgress();
        await remember(caseDir, source.uri, localPath, digests, emit, source.id, source.label);
      } catch (error) {
        const outcome = await recordSourceError(caseDir, source.id, source.uri, error, emit);
        if (outcome === "stop") return { ok: false, message: failureText(error, source.uri) };
      }
    }

    for (const root of MEDIA_ROOTS) {
      if (disconnected) return await stopDisconnect(caseDir, emit);
      const sourceId = root.split("/").pop()?.toLowerCase() ?? "media";
      emit({ type: "source", source: sourceId, status: "reading", message: `Listing ${root}` });
      try {
        const files = await listSharedFiles(serial, root);
        if (files.length === 0) {
          emit({ type: "source", source: sourceId, status: "hashed", message: `${root} is empty or not present.` });
          await appendAudit(caseDir, { action: "source_empty", detail: `${root} returned no files.` });
          continue;
        }
        if (bytesExpected === null) bytesExpected = bytesDone;
        for (const file of files) {
          if (file.bytes === null) unknownFiles += 1;
          else bytesExpected += file.bytes;
        }
        emitProgress();
        for (const file of files) {
          if (disconnected) return await stopDisconnect(caseDir, emit);
          const remotePath = file.path;
          const relative = remotePath.replace(/^\/sdcard\//, "");
          const localPath = path.join("files", relative);
          const before = bytesDone;
          const digests = await pullHashed(serial, remotePath, path.join(caseDir, localPath), () => disconnected, (written) => {
            bytesDone = before + written;
            emitProgress();
          });
          bytesDone = before + digests.bytes;
          if (file.bytes === null) {
            unknownFiles = Math.max(0, unknownFiles - 1);
            if (bytesExpected !== null) bytesExpected += digests.bytes;
          }
          emitProgress();
          media.push({
            id: `media-${Buffer.from(remotePath).toString("hex").slice(0, 12)}`,
            sourcePath: remotePath,
            localPath,
            kind: root.endsWith("DCIM") ? "image" : root.endsWith("Recordings") ? "recording" : "download",
            bytes: digests.bytes,
            md5: digests.md5,
            sha256: digests.sha256,
            note: "Pulled from shared storage over authorized adb.",
            acquiredAt: new Date().toISOString(),
          });
          await remember(caseDir, remotePath, localPath, digests, emit, sourceId, remotePath);
        }
      } catch (error) {
        const outcome = await recordSourceError(caseDir, sourceId, root, error, emit);
        if (outcome === "stop") return { ok: false, message: failureText(error, root) };
      }
    }

    await replaceCaseRecords(caseDir, { messages, calls, contacts, media });
    await replaceMessages(path.join(caseDir, "case_store.db"), messages);
    await appendAudit(caseDir, { action: "extraction_completed", detail: `SMS ${messages.length}, calls ${calls.length}, contacts ${contacts.length}, media ${media.length}.` });
    if (bytesExpected === null) bytesExpected = bytesDone;
    unknownFiles = 0;
    emitProgress();
    emit({ type: "done", message: "Logical extraction finished." });
    return { ok: true, message: "Logical extraction finished." };
  } finally {
    stopWatch();
  }
}

async function remember(
  caseDir: string,
  sourcePath: string,
  localPath: string,
  digests: { md5: string; sha256: string; bytes: number },
  emit: (event: ExtractEvent) => void,
  sourceId: string,
  label: string,
) {
  const item: ManifestItem = {
    sourcePath,
    localPath,
    md5: digests.md5,
    sha256: digests.sha256,
    bytes: digests.bytes,
    acquiredAt: new Date().toISOString(),
    status: "hashed",
  };
  await addManifestItem(caseDir, item);
  await appendAudit(caseDir, { action: "source_hashed", detail: `${sourcePath} md5 ${digests.md5} sha256 ${digests.sha256}` });
  emit({ type: "source", source: sourceId, status: "hashed", message: `${label} hashed (${digests.bytes} bytes).` });
}

async function recordSourceError(
  caseDir: string,
  sourceId: string,
  source: string,
  error: unknown,
  emit: (event: ExtractEvent) => void,
): Promise<"continue" | "stop"> {
  const kind = error instanceof AdbCommandError ? error.kind : "other";
  const message = failureText(error, source);
  await appendAudit(caseDir, { action: "source_failed", level: "error", detail: message });
  await addManifestItem(caseDir, {
    sourcePath: source,
    localPath: "",
    md5: "",
    sha256: "",
    bytes: 0,
    acquiredAt: new Date().toISOString(),
    status: "failed",
    error: message,
  });
  emit({ type: "source", source: sourceId, status: "failed", message });
  if (kind === "disconnect" || kind === "encrypted") {
    emit({ type: "error", message });
    return "stop";
  }
  return "continue";
}

async function stopDisconnect(caseDir: string, emit: (event: ExtractEvent) => void) {
  const message = failureText(new AdbCommandError("disconnect", "USB device disappeared.", { code: 1, stdout: "", stderr: "device offline" }), "the phone");
  await appendAudit(caseDir, { action: "usb_disconnect", level: "error", detail: message });
  emit({ type: "error", status: "stopped", message });
  return { ok: false, message };
}

function failureText(error: unknown, source: string): string {
  if (error instanceof AdbCommandError) return failureMessage(error.kind, source);
  if (error instanceof Error && error.message.includes("ENOENT")) return "adb is not on PATH. Install Android platform-tools and connect an authorized phone.";
  return error instanceof Error ? error.message : `The read of ${source} failed.`;
}

export function deviceSummary(device: DeviceFingerprint): string {
  return `${device.model} · Android ${device.android} · ${device.serial}`;
}
