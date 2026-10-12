import { useEffect, useState, type ReactNode } from "react";
import {
  Fingerprint,
  Cable,
  MessagesSquare,
  Search,
  ScanLine,
  Sparkles,
  ShieldCheck,
  FolderOpen,
  Plus,
  ArrowDownToLine,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileCheck2,
  X,
  ChevronRight,
  LockKeyhole,
  FileText,
  Activity,
} from "lucide-react";
import type {
  CaseInfo,
  Stats,
  Device,
  DeviceProfile,
  Evidence,
  Message,
  Candidate,
  Progress,
  AiResult,
  Audit,
} from "../shared/types";

const api = window.forensic;
const formatBytes = (bytes: number) => {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(i ? 1 : 0)} ${units[i]}`;
};
const date = (stamp: string | null) =>
  stamp ? stamp.replace("T", " ").replace("Z", " UTC") : "Timestamp unknown";
const tabs = [
  { id: "acquire", title: "Acquisition", icon: Cable },
  { id: "timeline", title: "Conversations", icon: MessagesSquare },
  { id: "recovery", title: "Recovered candidates", icon: ScanLine },
  { id: "ai", title: "AI assistant", icon: Sparkles },
  { id: "custody", title: "Integrity & custody", icon: ShieldCheck },
] as const;
type Tab = (typeof tabs)[number]["id"];
function Button({
  children,
  onClick,
  disabled = false,
  secondary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={secondary ? "button secondary" : "button"}
    >
      {children}
    </button>
  );
}
function Media({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setUrl(null);
    if (message.media_path)
      void api
        .media(message.id)
        .then((u) => {
          if (active) setUrl(u);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [message.id, message.media_path]);
  if (!url) return null;
  if (/\.(?:mp3|m4a|wav|ogg|amr)$/i.test(message.media_path!))
    return <audio controls preload="metadata" src={url} />;
  if (/\.(?:mp4|webm)$/i.test(message.media_path!))
    return <video controls preload="metadata" src={url} />;
  return (
    <img
      className="message-media"
      src={url}
      alt="Acquired message attachment"
      loading="lazy"
    />
  );
}
export default function App() {
  const [tab, setTab] = useState<Tab>("acquire");
  const [caseInfo, setCase] = useState<CaseInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [serial, setSerial] = useState("");
  const [profile, setProfile] = useState<DeviceProfile | null>(null);
  const [tools, setTools] = useState<{
    adb: string;
    python: string;
    aiModels: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sealed, setSealed] = useState(false);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [authority, setAuthority] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mode, setMode] = useState<"logical" | "physical">("logical");
  const [external, setExternal] = useState(true);
  const [appData, setAppData] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [block, setBlock] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [thread, setThread] = useState("");
  const [offset, setOffset] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [threads, setThreads] = useState<
    { thread_id: string; platform: string; count: number }[]
  >([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateOffset, setCandidateOffset] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(
    null,
  );
  const [audit, setAudit] = useState<Audit[]>([]);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState("");
  const acquiring = progress?.status === "running";
  const disabled = busy || acquiring;
  async function refresh() {
    const active = await api.currentCase();
    setCase(active);
    if (active) {
      const [s, e, t, a] = await Promise.all([
        api.stats(),
        api.evidence(),
        api.threads(),
        api.audit(),
      ]);
      setStats(s);
      setEvidence(e);
      setThreads(t);
      setAudit(a);
      setSealed(a.at(-1)?.action === "case_seal");
    }
  }
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function refreshTools() {
    const t = await api.tools();
    setTools(t);
    setModel((current) =>
      t.aiModels.includes(current) ? current : (t.aiModels[0] ?? ""),
    );
  }
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
    void refreshTools().catch((e) => setError(String(e)));
    const stop = api.onProgress((p) => {
      setProgress(p);
      if (p.error) setError(p.error);
      if (p.status !== "running")
        void refresh().catch((e) => setError(String(e)));
    });
    return stop;
  }, []);
  useEffect(() => {
    let mounted = true;
    async function detect() {
      try {
        const list = await api.devices();
        if (mounted) {
          setDevices(list);
          setSerial((current) =>
            list.some((d) => d.id === current)
              ? current
              : (list.find((d) => d.state === "device")?.id ?? ""),
          );
        }
      } catch {
        if (mounted) setDevices([]);
      }
    }
    void detect();
    const timer = setInterval(() => {
      if (!busy && !acquiring) void detect();
    }, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [busy, acquiring]);
  useEffect(() => {
    setProfile(null);
    setBlocks([]);
    setBlock("");
  }, [serial]);
  useEffect(() => {
    if (!caseInfo || tab !== "timeline") return;
    let active = true;
    const timer = setTimeout(() => {
      void api
        .messages({ search, platform, thread, offset, limit: 100 })
        .then((m) => {
          if (active) {
            setMessages(m);
            setSelectedMessage(m[0] ?? null);
          }
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [caseInfo, tab, search, platform, thread, offset, stats?.messages]);
  useEffect(() => {
    if (!caseInfo || tab !== "recovery") return;
    let active = true;
    void api
      .candidates(candidateOffset)
      .then((c) => {
        if (active) {
          setCandidates(c);
          setSelectedCandidate(c[0] ?? null);
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
    };
  }, [caseInfo, tab, candidateOffset, stats?.candidates]);
  async function openCase() {
    const next = await api.openCase();
    if (next) {
      setThread("");
      setOffset(0);
      setCandidateOffset(0);
      setProgress(null);
      setAiResult(null);
      setSearch("");
      setPlatform("");
      setTab("acquire");
    }
  }
  const inspect = () =>
    run(async () => {
      const p = await api.inspect(serial);
      setProfile(p);
      if (p.root) {
        const list = await api.blocks(serial).catch(() => []);
        setBlocks(list);
        setBlock(list[0] ?? "");
      }
    });
  const analyze = (kind: "question" | "thread" | "report") =>
    run(async () => {
      const result = await api.ai({ kind, question, thread, model });
      setAiResult(result);
    });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Fingerprint size={25} />
          </div>
          <div>
            <strong>OpenForensic</strong>
            <span>EXAMINER WORKSTATION</span>
          </div>
        </div>
        <div className="case-tag">
          <span className="eyebrow">ACTIVE CASE</span>
          <strong>{caseInfo?.name ?? "No case open"}</strong>
          <small>
            {caseInfo
              ? caseInfo.operator
              : "Evidence stays on this workstation"}
          </small>
          {sealed && (
            <span className="badge good">
              <LockKeyhole size={12} /> Sealed
            </span>
          )}
        </div>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={18} />
              <span>{t.title}</span>
              {t.id === "recovery" && !!stats?.candidates && (
                <small>{stats.candidates}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <span /> LOCAL EVIDENCE STORAGE
          </div>
          <p>
            Open source · v0.1.0
            <br />
            UTC timestamps throughout
          </p>
          <button
            className="text-button"
            disabled={disabled}
            onClick={() => run(refreshTools)}
          >
            <RefreshCw size={13} /> Check system tools
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <strong>{caseInfo?.name ?? "Getting started"}</strong>
          </div>
          <div className="top-actions">
            <Button secondary disabled={disabled} onClick={() => run(openCase)}>
              <FolderOpen size={15} /> Open case
            </Button>
            <Button
              secondary
              disabled={disabled}
              onClick={() => setCreate(true)}
            >
              <Plus size={15} /> New case
            </Button>
          </div>
        </header>
        <div className="workspace">
          <div className="page-title">
            <div>
              <span className="eyebrow">
                {tab === "acquire"
                  ? "PRESERVE · ACQUIRE · VERIFY"
                  : "EXAMINE · CORROBORATE · DOCUMENT"}
              </span>
              <h1>{tabs.find((t) => t.id === tab)!.title}</h1>
              <p>
                {tab === "acquire"
                  ? "Capture authorized Android evidence with a verifiable chain of custody."
                  : tab === "timeline"
                    ? "Follow conversations across applications and trace each record to its source."
                    : tab === "recovery"
                      ? "Inspect recovered bytes with explicit provenance and uncertainty."
                      : tab === "ai"
                        ? "Ask questions and draft findings using your locally installed model."
                        : "Review byte integrity, acquisition history, and the case seal."}
              </p>
            </div>
            {busy && (
              <span className="badge">
                <RefreshCw className="spin" size={13} /> Processing
              </span>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                <X size={16} />
              </button>
            </div>
          )}
          {!caseInfo ? (
            <div className="welcome">
              <Fingerprint size={42} />
              <h2>Begin with a case</h2>
              <p>
                Record the examiner and collection authority before acquiring or
                importing evidence. Raw captures, parsed artifacts, and custody
                records stay in the case folder you choose.
              </p>
              <div>
                <Button onClick={() => setCreate(true)}>
                  <Plus size={16} /> Create a case
                </Button>
                <Button secondary onClick={() => run(openCase)}>
                  <FolderOpen size={16} /> Open an existing case
                </Button>
              </div>
              <div className="setup-status">
                <span>
                  <strong>ADB</strong>
                  {tools?.adb ?? "Checking tools…"}
                </span>
                <span>
                  <strong>Python</strong>
                  {tools?.python ?? "Checking tools…"}
                </span>
                <span>
                  <strong>Local AI</strong>
                  {tools?.aiModels.length
                    ? `${tools.aiModels.length} model(s) installed`
                    : "Ollama is optional; install a local model to enable AI"}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="metrics">
                <div>
                  <span>Evidence items</span>
                  <strong>{stats?.evidence.toLocaleString() ?? "0"}</strong>
                  <small>{formatBytes(stats?.bytes ?? 0)} preserved</small>
                </div>
                <div>
                  <span>Normalized messages</span>
                  <strong>{stats?.messages.toLocaleString() ?? "0"}</strong>
                  <small>
                    {stats?.platforms.map((p) => p.platform).join(" · ") ||
                      "Parse an acquired artifact"}
                  </small>
                </div>
                <div>
                  <span>Recovery candidates</span>
                  <strong>{stats?.candidates.toLocaleString() ?? "0"}</strong>
                  <small>Require examiner interpretation</small>
                </div>
                <div>
                  <span>Custody events</span>
                  <strong>{audit.length}</strong>
                  <small>
                    {sealed ? "Case manifest sealed" : "Hash-chained audit log"}
                  </small>
                </div>
              </div>
              {tab === "acquire" && (
                <>
                  <div className="acquisition-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>
                          <Cable size={18} /> Device acquisition
                        </h2>
                        <span className="badge">{devices.length} detected</span>
                      </div>
                      {tools &&
                        !tools.adb.startsWith("Android Debug Bridge") && (
                          <div className="notice-box">
                            The device bridge is unavailable. Install Android
                            SDK Platform Tools or set its executable path before
                            acquisition. Imported evidence can still be
                            examined.
                          </div>
                        )}
                      {tools && !tools.python.startsWith("Python ") && (
                        <div className="notice-box">
                          Python is unavailable. Install Python 3.11 or newer or
                          set its executable path before parsing artifacts.
                        </div>
                      )}
                      <label>
                        Connected device
                        <select
                          value={serial}
                          onChange={(e) => setSerial(e.target.value)}
                          disabled={disabled}
                        >
                          <option value="">Select an authorized device</option>
                          {devices.map((d) => (
                            <option value={d.id} key={d.id}>
                              {d.id} · {d.state}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="row">
                        <Button
                          secondary
                          disabled={!serial || disabled}
                          onClick={inspect}
                        >
                          <ScanLine size={15} /> Inspect device
                        </Button>
                        <span className="muted small">
                          USB detection refreshes automatically
                        </span>
                      </div>
                      {profile && (
                        <div className="device-profile">
                          <strong>
                            {profile.manufacturer} {profile.model}
                          </strong>
                          <span>
                            Android {profile.androidVersion} ·{" "}
                            {profile.buildType} · SELinux {profile.selinux}
                          </span>
                          <span className={profile.root ? "accent" : "muted"}>
                            {profile.root
                              ? "Existing root access available"
                              : "Logical acquisition only"}
                          </span>
                          <code>{profile.fingerprint}</code>
                          <span>
                            Clock offset:{" "}
                            {profile.clockOffsetSeconds?.toFixed(1) ??
                              "unknown"}{" "}
                            seconds (approximate; timestamps are not adjusted)
                          </span>
                        </div>
                      )}
                      <div className="mode-switch">
                        <button
                          className={mode === "logical" ? "selected" : ""}
                          onClick={() => setMode("logical")}
                          disabled={disabled}
                        >
                          Logical acquisition
                        </button>
                        <button
                          className={mode === "physical" ? "selected" : ""}
                          onClick={() => setMode("physical")}
                          disabled={disabled}
                        >
                          Physical stream
                        </button>
                      </div>
                      {mode === "logical" ? (
                        <div className="checks">
                          <p>
                            SMS, MMS, call log, and contacts provider responses
                            are captured independently. Android may deny
                            provider access.
                          </p>
                          <label>
                            <input
                              type="checkbox"
                              checked={external}
                              onChange={(e) => setExternal(e.target.checked)}
                              disabled={disabled}
                            />{" "}
                            Archive shared storage (/sdcard)
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={appData}
                              onChange={(e) => setAppData(e.target.checked)}
                              disabled={disabled || !profile?.root}
                            />{" "}
                            Capture WhatsApp and telephony app databases with
                            existing root
                          </label>
                        </div>
                      ) : (
                        <>
                          <label>
                            Raw block device
                            <select
                              value={block}
                              onChange={(e) => setBlock(e.target.value)}
                              disabled={disabled}
                            >
                              <option value="">
                                Choose an inventoried partition
                              </option>
                              {blocks.map((b) => (
                                <option key={b}>{b}</option>
                              ))}
                            </select>
                          </label>
                          <p className="muted small">
                            Requires existing root and a verifiable device size.
                            Encrypted partition bytes remain encrypted;
                            filesystem interpretation is a separate examination.
                          </p>
                        </>
                      )}
                      <div className="notice-box">
                        Live ADB reads and root checks may trigger Android logs
                        or prompts. Application commands are restricted to
                        reads; hardware write blocking is unavailable.
                        Inspecting a device also performs these read probes.
                        Enable USB debugging and authorize this workstation on
                        the device before proceeding.
                      </div>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={acknowledged}
                          onChange={(e) => setAcknowledged(e.target.checked)}
                          disabled={disabled}
                        />{" "}
                        I have recorded collection authority and acknowledge the
                        effects of live acquisition.
                      </label>
                      <Button
                        disabled={
                          disabled ||
                          sealed ||
                          !profile ||
                          profile.serial !== serial ||
                          !acknowledged ||
                          (mode === "physical" && (!profile.root || !block))
                        }
                        onClick={() =>
                          run(async () => {
                            await api.acquire({
                              serial,
                              mode,
                              external,
                              appData,
                              block,
                              acknowledged,
                            });
                          })
                        }
                      >
                        <Play size={15} /> Start acquisition
                      </Button>
                    </section>
                    <section className="panel monitor">
                      <div className="panel-heading">
                        <h2>
                          <Activity size={18} /> Live monitor
                        </h2>
                        <span className={`badge ${acquiring ? "good" : ""}`}>
                          {acquiring
                            ? "Acquiring"
                            : (progress?.status ?? "Ready")}
                        </span>
                      </div>
                      <div className="monitor-primary">
                        <span>BYTES RECEIVED</span>
                        <strong>{formatBytes(progress?.bytes ?? 0)}</strong>
                        <p>{progress?.phase ?? "Awaiting acquisition"}</p>
                      </div>
                      <div className="monitor-values">
                        <div>
                          <span>Throughput</span>
                          <strong>
                            {formatBytes(progress?.bytesPerSecond ?? 0)}/s
                          </strong>
                        </div>
                        <div>
                          <span>Hash input</span>
                          <strong>
                            {formatBytes(progress?.hashBytes ?? 0)}
                          </strong>
                        </div>
                      </div>
                      <div className="hash-track">
                        <ShieldCheck size={18} />
                        <div>
                          <strong>SHA-256 + MD5</strong>
                          <span>
                            One streaming pass · disk readback verification
                          </span>
                        </div>
                      </div>
                      <dl>
                        <dt>Source</dt>
                        <dd>{progress?.source ?? "No active source"}</dd>
                        <dt>Last heartbeat UTC</dt>
                        <dd>
                          {progress?.heartbeatUtc
                            ? date(progress.heartbeatUtc)
                            : "Awaiting device connection"}
                        </dd>
                        <dt>Job identifier</dt>
                        <dd>{progress?.jobId ?? "No active job"}</dd>
                      </dl>
                      {acquiring && (
                        <Button
                          secondary
                          onClick={() =>
                            run(async () => {
                              await api.cancel();
                            })
                          }
                        >
                          <Square size={14} /> Cancel and retain partial
                          evidence
                        </Button>
                      )}
                      <p className="muted small monitor-note">
                        On a disconnect, captured bytes are retained and marked
                        partial. Saved files are never reported complete without
                        verification.
                      </p>
                    </section>
                  </div>
                  <section className="panel evidence-panel">
                    <div className="panel-heading">
                      <h2>Evidence register</h2>
                      <Button
                        secondary
                        disabled={disabled || sealed}
                        onClick={() =>
                          run(async () => {
                            const count = await api.importEvidence();
                            setNotice(
                              `${count} evidence file(s) imported and verified. Database WAL/SHM companions are included when present.`,
                            );
                          })
                        }
                      >
                        <ArrowDownToLine size={15} /> Import artifacts
                      </Button>
                    </div>
                    {evidence.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Artifact / source</th>
                              <th>Status</th>
                              <th>Size</th>
                              <th>SHA-256</th>
                              <th>Examination</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evidence.map((e) => (
                              <tr key={e.id}>
                                <td>
                                  <strong>
                                    {e.relative_path.split("/").at(-1)}
                                  </strong>
                                  <small>{e.source}</small>
                                  {e.error && (
                                    <small className="danger">{e.error}</small>
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`badge ${e.status === "complete" ? "good" : "warn"}`}
                                  >
                                    {e.status}
                                  </span>
                                </td>
                                <td className="nowrap">
                                  {formatBytes(e.bytes)}
                                </td>
                                <td>
                                  <code title={e.sha256}>
                                    {e.sha256.slice(0, 16)}…
                                  </code>
                                </td>
                                <td>
                                  <button
                                    className="text-button"
                                    disabled={
                                      disabled ||
                                      sealed ||
                                      e.status !== "complete" ||
                                      e.kind === "physical"
                                    }
                                    onClick={() =>
                                      run(async () => {
                                        const result = await api.parseEvidence(
                                          e.id,
                                        );
                                        setNotice(
                                          `${result.messages} new messages; ${result.candidates} new candidates. ${result.warnings.join(" · ")}`,
                                        );
                                      })
                                    }
                                  >
                                    Parse & carve <ChevronRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="empty-inline">
                        Acquire an authorized device or import a database, JSON
                        export, XML, Protobuf, or tar archive.
                      </p>
                    )}
                  </section>
                </>
              )}
              {tab === "timeline" && (
                <>
                  <div className="search-bar">
                    <Search size={18} />
                    <input
                      aria-label="Search all conversations"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setOffset(0);
                      }}
                      placeholder="Search messages, participants, and platforms"
                    />
                    <select
                      aria-label="Filter platform"
                      value={platform}
                      onChange={(e) => {
                        setPlatform(e.target.value);
                        setOffset(0);
                      }}
                    >
                      <option value="">All platforms</option>
                      {stats?.platforms.map((p) => (
                        <option key={p.platform}>{p.platform}</option>
                      ))}
                    </select>
                  </div>
                  <div className="conversation-layout">
                    <section className="thread-list">
                      <button
                        className={!thread ? "selected" : ""}
                        onClick={() => {
                          setThread("");
                          setOffset(0);
                        }}
                      >
                        <strong>Unified timeline</strong>
                        <small>All parsed conversations</small>
                      </button>
                      {threads.map((t) => (
                        <button
                          key={`${t.platform}:${t.thread_id}`}
                          className={thread === t.thread_id ? "selected" : ""}
                          onClick={() => {
                            setThread(t.thread_id);
                            setOffset(0);
                          }}
                        >
                          <span className="eyebrow">
                            {t.platform} · {t.count} records
                          </span>
                          <strong>{t.thread_id}</strong>
                        </button>
                      ))}
                    </section>
                    <section className="chat-panel">
                      <div className="panel-heading">
                        <h2>{thread || "Unified timeline"}</h2>
                        <span className="muted small">
                          UTC · {offset + 1}–{offset + messages.length}
                        </span>
                      </div>
                      <div className="chat-scroll">
                        {messages.length ? (
                          messages.map((m) => (
                            <article
                              key={m.id}
                              className={`message-bubble ${m.sender_id === "device" ? "outgoing" : ""} ${selectedMessage?.id === m.id ? "focused" : ""}`}
                              onClick={() => setSelectedMessage(m)}
                            >
                              <div>
                                <strong>{m.sender_id}</strong>
                                <span>{m.platform}</span>
                              </div>
                              <p>
                                {m.message_text || "Media or non-text message"}
                              </p>
                              <Media message={m} />
                              <footer>
                                {date(m.timestamp_utc)}{" "}
                                {m.is_deleted_flag === 1 && (
                                  <span className="danger">
                                    {" "}
                                    · App-marked deleted/unsent
                                  </span>
                                )}
                              </footer>
                              <small>
                                [M:{m.id}] · confidence {m.confidence}
                              </small>
                            </article>
                          ))
                        ) : (
                          <p className="empty-inline">
                            No parsed messages match this view. Parse an
                            acquired artifact or refine your search.
                          </p>
                        )}
                      </div>
                      <div className="pagination">
                        <Button
                          secondary
                          disabled={!offset}
                          onClick={() => setOffset(Math.max(0, offset - 100))}
                        >
                          Previous
                        </Button>
                        <Button
                          secondary
                          disabled={messages.length < 100}
                          onClick={() => setOffset(offset + 100)}
                        >
                          Next 100
                        </Button>
                      </div>
                    </section>
                    <aside className="record-inspector">
                      <h2>Record provenance</h2>
                      {selectedMessage ? (
                        <>
                          <span className="badge">
                            [M:{selectedMessage.id}]
                          </span>
                          <dl>
                            <dt>Evidence ID</dt>
                            <dd>{selectedMessage.evidence_id}</dd>
                            <dt>Source locator</dt>
                            <dd>{selectedMessage.source_locator}</dd>
                            <dt>Sender → receiver</dt>
                            <dd>
                              {selectedMessage.sender_id} →{" "}
                              {selectedMessage.receiver_id}
                            </dd>
                            <dt>Deletion status</dt>
                            <dd>
                              {selectedMessage.is_deleted_flag === 1
                                ? "Application-marked"
                                : selectedMessage.is_deleted_flag === null
                                  ? "Unknown"
                                  : "Live/exported record"}
                            </dd>
                            <dt>Media</dt>
                            <dd>
                              {selectedMessage.media_path ??
                                "No acquired media resolved"}
                            </dd>
                          </dl>
                          <p className="muted small">
                            Account identifiers do not establish the identity of
                            a person.
                          </p>
                        </>
                      ) : (
                        <p className="muted small">
                          Select a record to inspect its evidence reference.
                        </p>
                      )}
                    </aside>
                  </div>
                </>
              )}
              {tab === "recovery" && (
                <>
                  <div className="notice-box">
                    Recovered candidates can contain false positives or records
                    still present in live tables. Freelist location suggests
                    deallocation; it does not establish deletion time or table
                    identity. A valid WAL frame is a page version, not proof of
                    a deleted message.
                  </div>
                  <div className="recovery-layout">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Candidate inventory</h2>
                        <span className="badge">{stats?.candidates} total</span>
                      </div>
                      <div className="candidate-scroll">
                        {candidates.length ? (
                          candidates.map((c) => (
                            <button
                              key={c.id}
                              className={`candidate-row ${selectedCandidate?.id === c.id ? "selected" : ""}`}
                              onClick={() => setSelectedCandidate(c)}
                            >
                              <span className="badge warn">
                                {c.origin.replaceAll("_", " ")}
                              </span>
                              <strong>{c.source_locator}</strong>
                              <small>Confidence: {c.confidence}</small>
                            </button>
                          ))
                        ) : (
                          <p className="empty-inline">
                            No candidates have been recovered. Parse a plaintext
                            SQLite database with its WAL or a captured app
                            archive.
                          </p>
                        )}
                      </div>
                      <div className="pagination">
                        <Button
                          secondary
                          disabled={!candidateOffset}
                          onClick={() =>
                            setCandidateOffset(
                              Math.max(0, candidateOffset - 100),
                            )
                          }
                        >
                          Previous
                        </Button>
                        <Button
                          secondary
                          disabled={candidates.length < 100}
                          onClick={() =>
                            setCandidateOffset(candidateOffset + 100)
                          }
                        >
                          Next 100
                        </Button>
                      </div>
                    </section>
                    <section className="panel candidate-detail">
                      <h2>Candidate inspection</h2>
                      {selectedCandidate ? (
                        <>
                          <dl>
                            <dt>Evidence ID</dt>
                            <dd>{selectedCandidate.evidence_id}</dd>
                            <dt>Location</dt>
                            <dd>{selectedCandidate.source_locator}</dd>
                            <dt>Interpretation limit</dt>
                            <dd>{selectedCandidate.note}</dd>
                          </dl>
                          <h3>Decoded column values</h3>
                          <pre>
                            {JSON.stringify(
                              JSON.parse(selectedCandidate.values_json),
                              null,
                              2,
                            )}
                          </pre>
                          <h3>Preserved candidate bytes (hex)</h3>
                          <pre className="hex">
                            {selectedCandidate.raw_hex
                              .match(/.{1,32}/g)
                              ?.join("\n")}
                          </pre>
                        </>
                      ) : (
                        <p className="muted">
                          Choose a candidate to inspect its decoded values and
                          byte offset.
                        </p>
                      )}
                    </section>
                  </div>
                </>
              )}
              {tab === "ai" && (
                <div className="ai-layout">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        <Sparkles size={18} /> Local evidence assistant
                      </h2>
                      <span className="badge good">Local Ollama</span>
                    </div>
                    <label>
                      Installed model
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        disabled={disabled}
                      >
                        <option value="">Select a local model</option>
                        {tools?.aiModels.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </label>
                    {!tools?.aiModels.length && (
                      <p className="notice-box">
                        Start Ollama on this computer and install a text model.
                        Refresh system tools to detect it. Evidence is sent only
                        to the loopback service at 127.0.0.1:11434.
                      </p>
                    )}
                    <label>
                      Question
                      <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        rows={5}
                        placeholder="Ask about a participant, phrase, or event in the parsed messages"
                      />
                    </label>
                    <Button
                      disabled={
                        disabled || sealed || !model || !question.trim()
                      }
                      onClick={() => analyze("question")}
                    >
                      <Search size={15} /> Ask using matching evidence
                    </Button>
                    <hr />
                    <label>
                      Thread to summarize
                      <select
                        value={thread}
                        onChange={(e) => setThread(e.target.value)}
                      >
                        <option value="">Choose a thread</option>
                        {threads.map((t) => (
                          <option
                            key={`${t.platform}:${t.thread_id}`}
                            value={t.thread_id}
                          >
                            {t.thread_id} ({t.count})
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="row">
                      <Button
                        secondary
                        disabled={disabled || sealed || !model || !thread}
                        onClick={() => analyze("thread")}
                      >
                        Summarize thread
                      </Button>
                      <Button
                        secondary
                        disabled={
                          disabled || sealed || !model || !stats?.messages
                        }
                        onClick={() => analyze("report")}
                      >
                        <FileText size={15} /> Draft report
                      </Button>
                    </div>
                    <p className="muted small">
                      Retrieval is lexical and context is limited to 300 records
                      / 22,000 characters. Report drafts use the earliest
                      chronological records. AI never changes evidence or
                      classifies carved fragments as verified messages.
                    </p>
                  </section>
                  <section className="panel ai-output">
                    <div className="panel-heading">
                      <h2>Examiner draft</h2>
                      <Button
                        secondary
                        disabled={disabled}
                        onClick={() =>
                          run(async () => {
                            const path = await api.exportReport(
                              aiResult?.id ?? "",
                            );
                            if (path) setNotice(`Report exported: ${path}`);
                          })
                        }
                      >
                        <ArrowDownToLine size={15} /> Export HTML / PDF
                      </Button>
                    </div>
                    {aiResult ? (
                      <>
                        <div className="notice-box">
                          AI-assisted draft · Human verification required.
                          Citation IDs are checked against supplied records;
                          this does not validate the accuracy of a claim.
                        </div>
                        <p className="muted small">
                          {aiResult.model} · {date(aiResult.createdUtc)} ·{" "}
                          {aiResult.sourceIds.length} source records
                          {aiResult.truncated ? " · Context truncated" : ""}
                        </p>
                        <pre>{aiResult.text}</pre>
                        <div className="source-chips">
                          {aiResult.sourceIds.map((id) => (
                            <span key={id}>[M:{id}]</span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="ai-empty">
                        <Sparkles size={28} />
                        <h3>Evidence-backed assistance</h3>
                        <p>
                          Ask a question, summarize a thread, or draft a report.
                          Each accepted response includes record citations and
                          is retained in the examination history.
                        </p>
                      </div>
                    )}
                  </section>
                </div>
              )}
              {tab === "custody" && (
                <>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        <ShieldCheck size={18} /> Case integrity
                      </h2>
                      <span className={`badge ${sealed ? "good" : ""}`}>
                        {sealed ? "Sealed" : "Examination open"}
                      </span>
                    </div>
                    <p className="muted">
                      Verify every evidence file, the custody chain, and any
                      sealed manifest. Sealing freezes this case in the
                      application and writes evidence_manifest.json plus its
                      SHA-256 digest. Preserve that digest independently to
                      anchor the seal.
                    </p>
                    <div className="row">
                      <Button
                        disabled={disabled}
                        onClick={() =>
                          run(async () => {
                            const v = await api.verify();
                            if (!v.ok) throw new Error(v.problems.join("\n"));
                            setNotice(
                              "Verification passed: evidence sizes and both hashes match; custody chain and available seal are valid.",
                            );
                          })
                        }
                      >
                        <FileCheck2 size={16} /> Verify case
                      </Button>
                      <Button
                        secondary
                        disabled={disabled || sealed}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Seal this case? Acquisition, imports, parsing, and AI runs will be disabled. Export reports first. Keep the manifest digest outside this folder.",
                            )
                          )
                            void run(async () => {
                              const path = await api.seal();
                              setNotice(`Case sealed: ${path}`);
                            });
                        }}
                      >
                        <LockKeyhole size={15} /> Seal case
                      </Button>
                      <Button
                        secondary
                        disabled={disabled}
                        onClick={() =>
                          run(async () => {
                            const path = await api.exportReport(
                              aiResult?.id ?? "",
                            );
                            if (path) setNotice(`Report exported: ${path}`);
                          })
                        }
                      >
                        <FileText size={15} /> Export report
                      </Button>
                    </div>
                    <dl>
                      <dt>Case identifier</dt>
                      <dd>{caseInfo.id}</dd>
                      <dt>Collection authority</dt>
                      <dd>{caseInfo.authority}</dd>
                      <dt>Case folder</dt>
                      <dd>{caseInfo.root}</dd>
                      <dt>Audit head SHA-256</dt>
                      <dd>{audit.at(-1)?.hash ?? "No events"}</dd>
                    </dl>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Custody and examination history</h2>
                      <span className="muted small">
                        Append-only application log · UTC
                      </span>
                    </div>
                    <div className="audit-list">
                      {[...audit].reverse().map((a) => (
                        <details key={a.sequence}>
                          <summary>
                            <span className="audit-number">
                              {String(a.sequence).padStart(3, "0")}
                            </span>
                            <strong>{a.action.replaceAll("_", " ")}</strong>
                            <time>{date(a.timestamp_utc)}</time>
                          </summary>
                          <pre>{JSON.stringify(a.details, null, 2)}</pre>
                          <small>Event SHA-256: {a.hash}</small>
                        </details>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <ShieldCheck size={13} /> Evidence is preserved locally.
            Interpretation and attribution require examiner review.
          </footer>
        </div>
      </main>
      {create && (
        <div className="modal-overlay">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const next = await api.createCase({
                  name,
                  operator,
                  authority,
                });
                if (next) {
                  setCreate(false);
                  setAiResult(null);
                  setProgress(null);
                  setThread("");
                  setOffset(0);
                  setCandidateOffset(0);
                  setTab("acquire");
                }
              });
            }}
          >
            <div className="panel-heading">
              <h2>Create an examination case</h2>
              <button
                type="button"
                onClick={() => setCreate(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="muted">
              Choose a parent folder after entering the case details.
            </p>
            <label>
              Case name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label>
              Examiner / operator
              <input
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label>
              Collection authority and scope
              <textarea
                value={authority}
                onChange={(e) => setAuthority(e.target.value)}
                required
                maxLength={4000}
                rows={4}
              />
            </label>
            <button
              className="button"
              type="submit"
              disabled={
                busy || !name.trim() || !operator.trim() || !authority.trim()
              }
            >
              <FolderOpen size={15} /> Choose folder and create case
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
