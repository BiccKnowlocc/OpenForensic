import { useEffect, useState } from "react";
import {
  Eraser,
  ShieldAlert,
  RefreshCw,
  Square,
  Download,
  CheckCircle2,
} from "lucide-react";
import type {
  CaseInfo,
  Device,
  SanitizationPlan,
  SanitizationJob,
} from "../shared/types";

const api = window.forensic;
const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
const running = (job: SanitizationJob) =>
  job.status === "running" || job.status === "cleaning";

export default function Sanitization({
  caseInfo,
  devices,
  disabled,
  closeCase,
}: {
  caseInfo: CaseInfo | null;
  devices: Device[];
  disabled: boolean;
  closeCase(): void;
}) {
  const [serial, setSerial] = useState("");
  const [limitGiB, setLimit] = useState(0);
  const [plan, setPlan] = useState<SanitizationPlan | null>(null);
  const [operator, setOperator] = useState("");
  const [authority, setAuthority] = useState("");
  const [typedSerial, setTypedSerial] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [jobs, setJobs] = useState<SanitizationJob[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = jobs.find(running);
  const locked = disabled || pending || !!caseInfo || !!active;
  useEffect(() => {
    if (!devices.some((d) => d.id === serial))
      setSerial(devices.find((d) => d.state === "device")?.id || "");
  }, [devices, serial]);
  useEffect(() => {
    setPlan(null);
    setTypedSerial("");
    setAcknowledged(false);
  }, [serial, limitGiB]);
  useEffect(() => {
    let mounted = true;
    void api
      .sanitizationJobs()
      .then((list) => {
        if (mounted) setJobs(list);
      })
      .catch((e) => {
        if (mounted) setError(String(e));
      });
    const stop = api.onSanitization((job) =>
      setJobs((list) =>
        [job, ...list.filter((j) => j.id !== job.id)].sort((a, b) =>
          b.startedUtc.localeCompare(a.startedUtc),
        ),
      ),
    );
    return () => {
      mounted = false;
      stop();
    };
  }, []);
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="sanitization">
      <div className="notice-box sanitize-warning">
        <ShieldAlert size={22} />
        <div>
          <strong>Preserve current user files · best-effort cleanup</strong>
          <p>
            This mode creates and removes its own temporary files. It does not
            reset the phone or delete your existing files. It cannot guarantee
            that deleted data is gone forever: flash remapping, private app
            databases, and the safety reserve remain outside its reach.
          </p>
        </div>
      </div>
      {caseInfo && (
        <div className="panel">
          <h2>Close the evidence case first</h2>
          <p>
            Sanitization is separate from acquisition and examination. Closing
            the case keeps its evidence and custody records in the case folder.
          </p>
          <button
            className="button secondary"
            disabled={disabled || pending}
            onClick={closeCase}
          >
            Close case for sanitization
          </button>
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <div className="acquisition-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              <Eraser size={18} /> Free-space cleanup
            </h2>
            <span className="badge">Existing files retained</span>
          </div>
          <label>
            Phone or tablet
            <select
              value={serial}
              disabled={locked}
              onChange={(e) => setSerial(e.target.value)}
            >
              <option value="">Connect an authorized USB device</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id} disabled={d.state !== "device"}>
                  {d.id} · {d.state}
                </option>
              ))}
            </select>
          </label>
          <label>
            Temporary write limit
            <select
              value={limitGiB}
              disabled={locked}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={0}>All safe available space, up to 512 GiB</option>
              <option value={1}>1 GiB</option>
              <option value={5}>5 GiB</option>
              <option value={10}>10 GiB</option>
              <option value={25}>25 GiB</option>
            </select>
          </label>
          <button
            className="button secondary"
            disabled={locked || !serial}
            onClick={() =>
              void run(async () => {
                setPlan(await api.sanitizationPrepare({ serial, limitGiB }));
              })
            }
          >
            <RefreshCw size={15} /> Assess storage and power
          </button>
          {plan && (
            <>
              <div className="device-profile">
                <strong>
                  {plan.device.manufacturer} {plan.device.model}
                </strong>
                <span>
                  Android {plan.device.androidVersion} · encryption{" "}
                  {plan.device.encryptionState} ({plan.device.encryptionType})
                </span>
                <span>
                  Free: {size(plan.device.freeBytes)} · safety reserve:{" "}
                  {size(plan.reserveBytes)}
                </span>
                <span>Temporary write target: {size(plan.targetBytes)}</span>
                <span>
                  Battery {plan.device.battery.level}% ·{" "}
                  {plan.device.battery.temperatureC.toFixed(1)}°C · connected to
                  power
                </span>
              </div>
              <label>
                Operator name
                <input
                  value={operator}
                  maxLength={200}
                  disabled={locked}
                  onChange={(e) => setOperator(e.target.value)}
                />
              </label>
              <label>
                Ownership or authorization
                <textarea
                  value={authority}
                  maxLength={4000}
                  rows={3}
                  disabled={locked}
                  onChange={(e) => setAuthority(e.target.value)}
                  placeholder="Record why you are authorized to sanitize this device"
                />
              </label>
              <label>
                Type the phone serial to confirm: {plan.device.serial}
                <input
                  value={typedSerial}
                  disabled={locked}
                  onChange={(e) => setTypedSerial(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="sanitize-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={locked}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>
                  I have a current backup and accept that permanent deletion is
                  not verified. Storage pressure can make Android clear its own
                  caches. SD cards, cloud copies, and private app database
                  remnants are excluded.
                </span>
              </label>
              <button
                className="button sanitize-button"
                disabled={
                  locked ||
                  !acknowledged ||
                  typedSerial !== plan.device.serial ||
                  !operator.trim() ||
                  !authority.trim()
                }
                onClick={() =>
                  void run(async () => {
                    const id = await api.sanitizationStart({
                      token: plan.token,
                      operator,
                      authority,
                      typedSerial,
                      acknowledged,
                    });
                    if (id) {
                      setPlan(null);
                      setAcknowledged(false);
                      setJobs(await api.sanitizationJobs());
                    }
                  })
                }
              >
                <Eraser size={15} /> Start free-space cleanup
              </button>
            </>
          )}
          <p className="muted small">
            A minimum of 2 GiB or 5% of the volume stays free, whichever is
            larger, plus a transfer margin. Writes use fresh random data and
            exclusive file creation. Avoid using the phone during cleanup.
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Cleanup progress and receipts</h2>
            <span className="badge">Local records</span>
          </div>
          {!jobs.length && (
            <p className="muted">
              No cleanup has run. Assessing a device does not write temporary
              files.
            </p>
          )}
          {jobs.map((job) => (
            <article className="sanitize-job" key={job.id}>
              <div className="row">
                <strong>{job.plan.device.model}</strong>
                <span
                  className={job.status === "complete" ? "badge good" : "badge"}
                >
                  {job.status.replaceAll("_", " ")}
                </span>
              </div>
              <p>{job.phase}</p>
              <progress
                max={job.plan.targetBytes}
                value={job.bytesVerified}
                aria-label="Verified temporary-file progress"
              />
              <dl>
                <dt>USB serial</dt>
                <dd>{job.plan.device.serial}</dd>
                <dt>Sent / verified</dt>
                <dd>
                  {size(job.bytesSent)} / {size(job.bytesVerified)}
                </dd>
                <dt>Write target</dt>
                <dd>{size(job.plan.targetBytes)}</dd>
                <dt>Throughput</dt>
                <dd>{size(job.bytesPerSecond * 60)} per minute</dd>
                <dt>Temporary files</dt>
                <dd>{job.cleanupComplete ? "Removed" : "Cleanup pending"}</dd>
                <dt>Permanent erasure</dt>
                <dd>Not verified</dd>
                <dt>Started</dt>
                <dd>{job.startedUtc}</dd>
              </dl>
              {job.error && <p className="notice-box">{job.error}</p>}
              <div className="sanitize-actions">
                {job.status === "running" && (
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await api.sanitizationCancel();
                      })
                    }
                  >
                    <Square size={14} /> Stop and remove temporary files
                  </button>
                )}
                {!running(job) && !job.cleanupComplete && (
                  <button
                    className="button secondary"
                    disabled={locked}
                    onClick={() =>
                      void run(async () => {
                        await api.sanitizationCleanup(job.id);
                        setJobs(await api.sanitizationJobs());
                      })
                    }
                  >
                    <RefreshCw size={14} /> Remove leftover temporary files
                  </button>
                )}
                {job.receiptPath && (
                  <button
                    className="button secondary"
                    disabled={disabled || pending || !!active}
                    onClick={() =>
                      void run(async () => {
                        const path = await api.sanitizationExport(job.id);
                        if (path) setNotice(`Receipt exported: ${path}`);
                      })
                    }
                  >
                    <Download size={14} /> Export receipt
                  </button>
                )}
              </div>
              {job.cleanupComplete && (
                <p className="muted small">
                  <CheckCircle2 size={13} /> Temporary-file cleanup is
                  confirmed. This does not prove destruction of previously
                  deleted data.
                </p>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
