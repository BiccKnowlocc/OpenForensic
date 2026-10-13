export interface Device {
  id: string;
  state: string;
}
export interface DeviceProfile {
  serial: string;
  manufacturer: string;
  model: string;
  hardware: string;
  fingerprint: string;
  androidVersion: string;
  buildType: string;
  root: boolean;
  rootMethod: "shell" | "su" | "none";
  selinux: string;
  deviceTimeUtc: string;
  hostTimeUtc: string;
  clockOffsetSeconds: number | null;
  clockRoundTripMs: number;
  properties: Record<string, string>;
}
export interface CaseInfo {
  id: string;
  name: string;
  operator: string;
  authority: string;
  created_utc: string;
  root: string;
}
export interface Evidence {
  id: string;
  relative_path: string;
  source: string;
  kind: string;
  bytes: number;
  sha256: string;
  md5: string;
  status: "complete" | "partial" | "failed";
  created_utc: string;
  error: string | null;
}
export interface Message {
  id: number;
  evidence_id: string;
  timestamp_utc: string | null;
  platform: string;
  sender_id: string;
  receiver_id: string;
  message_text: string;
  media_path: string | null;
  is_deleted_flag: number | null;
  thread_id: string;
  source_locator: string;
  confidence: string;
}
export interface Candidate {
  id: number;
  evidence_id: string;
  source_locator: string;
  origin: string;
  confidence: string;
  values_json: string;
  raw_hex: string;
  note: string;
}
export interface Audit {
  sequence: number;
  timestamp_utc: string;
  action: string;
  details: unknown;
  previous_hash: string;
  hash: string;
}
export interface Progress {
  jobId: string;
  phase: string;
  source: string;
  bytes: number;
  bytesPerSecond: number;
  hashBytes: number;
  heartbeatUtc: string | null;
  status: "running" | "complete" | "failed" | "cancelled";
  error?: string;
}
export interface Stats {
  messages: number;
  candidates: number;
  evidence: number;
  bytes: number;
  platforms: { platform: string; count: number }[];
}
export interface Query {
  search: string;
  platform: string;
  thread: string;
  offset: number;
  limit: number;
}
export interface AiResult {
  id: string;
  text: string;
  model: string;
  sourceIds: number[];
  createdUtc: string;
  truncated: boolean;
}
export interface ToolStatus {
  adb: string;
  python: string;
  adbPath: string;
  pythonPath: string;
  aiModels: string[];
  aiStatus: string;
}
export interface DesktopAPI {
  closeCase(): Promise<void>;
  sanitizationPrepare(input: {
    serial: string;
    limitGiB: number;
  }): Promise<SanitizationPlan>;
  sanitizationStart(input: {
    token: string;
    operator: string;
    authority: string;
    typedSerial: string;
    acknowledged: boolean;
  }): Promise<string | null>;
  sanitizationJobs(): Promise<SanitizationJob[]>;
  sanitizationCancel(): Promise<void>;
  sanitizationCleanup(id: string): Promise<SanitizationJob>;
  sanitizationExport(id: string): Promise<string | null>;
  onSanitization(callback: (job: SanitizationJob) => void): () => void;
  tools(): Promise<ToolStatus>;
  selectTool(name: "adb" | "python"): Promise<boolean>;
  restartBridge(): Promise<Device[]>;
  diagnostics(): Promise<string>;
  devices(): Promise<Device[]>;
  inspect(serial: string): Promise<DeviceProfile>;
  blocks(serial: string): Promise<string[]>;
  createCase(input: {
    name: string;
    operator: string;
    authority: string;
  }): Promise<CaseInfo | null>;
  openCase(): Promise<CaseInfo | null>;
  currentCase(): Promise<CaseInfo | null>;
  stats(): Promise<Stats>;
  evidence(): Promise<Evidence[]>;
  messages(query: Query): Promise<Message[]>;
  threads(): Promise<{ thread_id: string; platform: string; count: number }[]>;
  candidates(offset: number): Promise<Candidate[]>;
  audit(): Promise<Audit[]>;
  acquire(input: {
    serial: string;
    mode: "logical" | "physical";
    external: boolean;
    providers?: boolean;
    appData: boolean;
    block: string;
    acknowledged: boolean;
  }): Promise<string>;
  cancel(): Promise<void>;
  importEvidence(): Promise<number>;
  parseEvidence(
    id: string,
  ): Promise<{ messages: number; candidates: number; warnings: string[] }>;
  verify(): Promise<{ ok: boolean; problems: string[] }>;
  seal(): Promise<string>;
  ai(input: {
    kind: "question" | "thread" | "report";
    question: string;
    thread: string;
    model: string;
  }): Promise<AiResult>;
  exportReport(aiId: string): Promise<string | null>;
  media(messageId: number): Promise<string | null>;
  onProgress(callback: (progress: Progress) => void): () => void;
}
export interface SanitizationDevice {
  serial: string;
  manufacturer: string;
  model: string;
  fingerprint: string;
  hardware: string;
  androidVersion: string;
  encryptionState: string;
  encryptionType: string;
  storageRoot: string;
  filesystem: string;
  totalBytes: number;
  freeBytes: number;
  battery: { level: number; powered: boolean; temperatureC: number };
}
export interface SanitizationPlan {
  token: string;
  expiresUtc: string;
  device: SanitizationDevice;
  reserveBytes: number;
  targetBytes: number;
  limitGiB: number;
  assurance: "best_effort_only";
}
export type SanitizationStatus =
  | "running"
  | "cleaning"
  | "complete"
  | "cancelled"
  | "failed"
  | "cleanup_required";
export interface SanitizationJob {
  id: string;
  plan: SanitizationPlan;
  operator: string;
  authority: string;
  startedUtc: string;
  updatedUtc: string;
  status: SanitizationStatus;
  phase: string;
  bytesSent: number;
  bytesVerified: number;
  bytesPerSecond: number;
  lastIndex: number;
  directoryCreated: boolean;
  cleanupComplete: boolean;
  error: string | null;
  receiptPath: string | null;
}
declare global {
  interface Window {
    forensic: DesktopAPI;
  }
}
