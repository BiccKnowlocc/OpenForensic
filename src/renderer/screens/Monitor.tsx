import { useEffect, useState } from "react";
import type { CaseBundle, DeviceStatus, ExtractEvent, SourceStatus } from "../../../shared/types";
import { formatUtc } from "../../../shared/names";
import { useApi } from "../api-context";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { ErrorBlock } from "./states";

const SOURCE_IDS = [
  { id: "sms", label: "SMS", path: "content://sms" },
  { id: "calls", label: "Call log", path: "content://call_log/calls" },
  { id: "contacts", label: "Contacts", path: "content://contacts/phones" },
  { id: "dcim", label: "DCIM", path: "/sdcard/DCIM" },
  { id: "download", label: "Download", path: "/sdcard/Download" },
  { id: "recordings", label: "Recordings", path: "/sdcard/Recordings" },
];

export function Monitor({ bundle, onChange }: { bundle: CaseBundle; onChange: () => void }) {
  const api = useApi();
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, { status: SourceStatus; message: string }>>(() => initialRows(bundle));
  const [atlasNote, setAtlasNote] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);

  async function refreshDevice() {
    setDeviceError(null);
    try {
      setDevice(await api.deviceStatus());
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Could not check adb.");
    }
  }

  useEffect(() => { void refreshDevice(); }, [bundle.summary.id]);
  useEffect(() => setRows(initialRows(bundle)), [bundle]);

  useEffect(() => {
    return api.subscribe((event: ExtractEvent) => {
      if (event.type === "source" && event.source && event.status) {
        setRows((current) => ({ ...current, [event.source!]: { status: event.status!, message: event.message } }));
      }
      if (event.type === "error") setBanner(event.message);
      if (event.type === "log" || event.type === "done") setBanner(event.message);
    });
  }, [api]);

  async function extract() {
    setRunning(true);
    setBanner(null);
    try {
      const result = await api.extract(bundle.summary.id);
      setBanner(result.message);
      if (!result.ok) setBanner(result.message);
      onChange();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Extraction failed.");
    } finally {
      setRunning(false);
      void refreshDevice();
    }
  }

  async function wipe() {
    setWiping(true);
    setBanner(null);
    try {
      const result = await api.wipeFreeSpace(bundle.summary.id);
      setBanner(result.message);
      setWipeOpen(false);
      setConfirmText("");
      onChange();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Free-space wipe failed.");
    } finally {
      setWiping(false);
    }
  }

  async function clearWipe() {
    setBanner(null);
    try {
      const result = await api.removeWipeFiles(bundle.summary.id);
      setBanner(result.message);
      onChange();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Could not remove the wipe files.");
    }
  }

  async function publish() {
    if (!api.publishToAtlas) return;
    setAtlasNote(null);
    try {
      const result = await api.publishToAtlas(bundle.summary.id);
      setAtlasNote(result.message);
    } catch (error) {
      setAtlasNote(error instanceof Error ? error.message : "Atlas publish failed.");
    }
  }

  const tone = (status: SourceStatus) => status === "failed" || status === "stopped" ? "danger" : status === "hashed" ? "moss" : status === "reading" ? "sea" : "muted";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-md border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl">Device</h2>
          <Button variant="outline" size="sm" onClick={() => void refreshDevice()}>Check USB</Button>
        </div>
        {deviceError ? <ErrorBlock message={deviceError} onRetry={() => void refreshDevice()} /> : null}
        {!device && !deviceError ? <p className="text-sm text-muted">Checking adb…</p> : null}
        {device ? (
          <div className="space-y-2 text-sm">
            <p>{device.message}</p>
            {device.devices.length === 0 ? <p className="text-muted">No authorized device in the list.</p> : null}
            <ul className="space-y-2">
              {device.devices.map((item) => (
                <li key={item.serial} className="rounded border border-line px-3 py-2 font-mono text-xs">
                  {item.serial} · {item.state} · {item.model || "model unknown"} · SELinux {item.selinux || "n/a"} · rooted {item.rooted ? "yes" : "no"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button onClick={() => void extract()} disabled={running || bundle.summary.sample || bundle.summary.status === "archived"}>
          {running ? "Extracting…" : "Start logical extraction"}
        </Button>
        {bundle.summary.sample ? <p className="text-xs text-muted">The sample is already filled in. Create a case to pull from a phone.</p> : null}
        {banner ? (banner.includes("finished") || banner.startsWith("Wrote") || banner.startsWith("Removed") || banner.includes("already within") ? <p className="text-sm text-moss">{banner}</p> : <ErrorBlock message={banner} />) : null}
        <div className="rounded border border-line p-3">
          <h3 className="text-sm font-medium">Free-space wipe</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            On an authorized Android phone or tablet, this fills shared-storage free space with junk files in /sdcard/OpenForensic/free-space-wipe until about 128 MB remains. That can overwrite deleted files on storage the shell can already write. It does not unlock the device.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setWipeOpen(true)} disabled={running || wiping || bundle.summary.sample || bundle.summary.status === "archived" || api.mode === "web"}>
              {wiping ? "Writing junk files…" : "Fill free space"}
            </Button>
            {wiping ? <Button variant="outline" onClick={() => void api.stopWipe()}>Stop wipe</Button> : null}
            <Button variant="outline" onClick={() => void clearWipe()} disabled={wiping || bundle.summary.sample || api.mode === "web"}>Remove wipe files</Button>
          </div>
          {api.mode === "web" ? <p className="mt-2 text-xs text-muted">The viewer cannot write to USB. Run the wipe from the desktop app.</p> : null}
        </div>
        {api.publishToAtlas ? <Button variant="outline" onClick={() => void publish()}>Copy case records to Atlas</Button> : null}
        {atlasNote ? <p className="text-sm text-muted">{atlasNote}</p> : null}
        <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
          <DialogContent title="Fill free space">
            <p className="text-sm leading-6 text-muted">
              This writes junk files to /sdcard/OpenForensic/free-space-wipe on the connected phone or tablet until about 128 MB is left free. Deleted files on that shared storage can be overwritten. OpenForensic will not unlock the device and will not write to block devices. Type WIPE to continue.
            </p>
            <Input className="mt-3" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="WIPE" aria-label="Type WIPE to confirm" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setWipeOpen(false)}>Cancel</Button>
              <Button variant="danger" disabled={confirmText !== "WIPE" || wiping} onClick={() => void wipe()}>{wiping ? "Writing…" : "Fill free space"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>

      <section className="space-y-3 rounded-md border border-line bg-panel p-4">
        <h2 className="font-serif text-2xl">Sources</h2>
        <ul className="space-y-2">
          {SOURCE_IDS.map((source) => {
            const row = rows[source.id] ?? { status: "waiting" as const, message: "Not read yet." };
            return (
              <li key={source.id} className="flex flex-col gap-1 rounded border border-line px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm">{source.label}</p>
                  <p className="font-mono text-[11px] text-muted">{source.path}</p>
                  <p className="text-xs text-muted">{row.message}</p>
                </div>
                <Badge tone={tone(row.status)}>{row.status}</Badge>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-2 rounded-md border border-line bg-panel p-4 lg:col-span-2">
        <h2 className="font-serif text-2xl">Audit log</h2>
        {bundle.audit.length === 0 ? <p className="text-sm text-muted">No audit events yet. Creating the case writes the first line.</p> : null}
        <ol className="max-h-72 space-y-2 overflow-auto font-mono text-xs">
          {bundle.audit.map((event) => (
            <li key={event.id} className={event.level === "error" ? "text-danger" : "text-muted"}>
              {formatUtc(event.at)} · {event.action} · {event.detail}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-md border border-line bg-panel p-4 lg:col-span-2">
        <h2 className="font-serif text-2xl">Contacts</h2>
        {bundle.contacts.length === 0 ? <p className="mt-2 text-sm text-muted">No contacts in this case yet.</p> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {bundle.contacts.map((contact) => (
              <li key={contact.id} className="rounded border border-line px-3 py-2 text-sm">
                <span className="text-paper">{contact.name}</span>
                <span className="mt-1 block font-mono text-xs text-muted">{contact.number}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function initialRows(bundle: CaseBundle): Record<string, { status: SourceStatus; message: string }> {
  const rows: Record<string, { status: SourceStatus; message: string }> = {};
  for (const item of bundle.manifest.items) {
    const id = sourceIdFor(item.sourcePath);
    if (!id) continue;
    rows[id] = {
      status: item.status === "failed" ? "failed" : "hashed",
      message: item.status === "failed" ? item.error || "Failed" : `Hashed ${item.bytes} bytes`,
    };
  }
  return rows;
}

function sourceIdFor(sourcePath: string): string | null {
  if (sourcePath.includes("content://sms")) return "sms";
  if (sourcePath.includes("call_log")) return "calls";
  if (sourcePath.includes("contacts")) return "contacts";
  if (sourcePath.includes("/DCIM")) return "dcim";
  if (sourcePath.includes("/Download")) return "download";
  if (sourcePath.includes("/Recordings")) return "recordings";
  return null;
}
