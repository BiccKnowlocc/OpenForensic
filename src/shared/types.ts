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
export interface DesktopAPI {
  tools(): Promise<{ adb: string; python: string; aiModels: string[] }>;
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
declare global {
  interface Window {
    forensic: DesktopAPI;
  }
}
