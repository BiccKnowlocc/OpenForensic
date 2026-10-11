export type ReviewTask = "ask" | "summarize_thread" | "explain_timeline" | "draft_report";

export type ReviewProvider = "netlify-ai-gateway" | "local-fallback";

export type Message = {
  id: string;
  threadId: string;
  timestampUtc: string;
  platform: "sms";
  senderId: string;
  receiverId: string;
  messageText: string;
  mediaPath: string | null;
  isDeletedFlag: boolean;
};

export type CallDirection = "incoming" | "outgoing" | "missed";

export type CallRecord = {
  id: string;
  timestampUtc: string;
  number: string;
  name: string;
  direction: CallDirection;
  durationSec: number;
};

export type Contact = {
  id: string;
  name: string;
  number: string;
};

export type MediaKind = "image" | "download" | "recording";

export type MediaItem = {
  id: string;
  sourcePath: string;
  localPath: string;
  kind: MediaKind;
  bytes: number;
  md5: string;
  sha256: string;
  note: string;
  acquiredAt: string;
};

export type ManifestItem = {
  sourcePath: string;
  localPath: string;
  md5: string;
  sha256: string;
  bytes: number;
  acquiredAt: string;
  status: "hashed" | "failed";
  error?: string;
};

export type DeviceFingerprint = {
  serial: string;
  model: string;
  android: string;
  selinux: string;
  rooted: boolean;
  state: "device" | "unauthorized" | "offline" | "missing";
};

export type EvidenceManifest = {
  caseId: string;
  operator: string;
  createdAt: string;
  device: DeviceFingerprint | null;
  items: ManifestItem[];
};

export type AuditLevel = "info" | "error";

export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  detail: string;
  level: AuditLevel;
};

export type CaseSummary = {
  id: string;
  name: string;
  operator: string;
  createdAt: string;
  sample: boolean;
  status: "open" | "archived";
  deviceLabel: string;
  ownerName: string;
  ownerNumber: string;
};

export type CaseBundle = {
  summary: CaseSummary;
  messages: Message[];
  calls: CallRecord[];
  contacts: Contact[];
  media: MediaItem[];
  manifest: EvidenceManifest;
  audit: AuditEvent[];
};

export type DeviceStatus = {
  adbFound: boolean;
  devices: DeviceFingerprint[];
  message: string;
};

export type SourceStatus = "waiting" | "reading" | "hashed" | "failed" | "stopped";

export type ExtractEvent = {
  type: "source" | "log" | "done" | "error";
  source?: string;
  status?: SourceStatus;
  message: string;
};

export type ReviewRequest = {
  task: ReviewTask;
  caseId: string;
  question?: string;
  threadId?: string;
  caseBundle?: CaseBundle;
};

export type ReviewResponse = {
  text: string;
  provider: ReviewProvider;
  model: string | null;
  label: string;
};

export type CaseListResponse = {
  atlas: boolean;
  atlasError: string | null;
  cases: CaseSummary[];
};

export type ExaminerApi = {
  mode: "desktop" | "web";
  listCases: () => Promise<CaseListResponse>;
  getCase: (id: string) => Promise<CaseBundle>;
  createCase: (input: { name: string; operator: string }) => Promise<CaseSummary>;
  archiveCase: (id: string) => Promise<void>;
  pickCaseFolder?: () => Promise<CaseSummary | null>;
  deviceStatus: () => Promise<DeviceStatus>;
  extract: (caseId: string) => Promise<{ ok: boolean; message: string }>;
  wipeFreeSpace: (caseId: string) => Promise<{ ok: boolean; message: string }>;
  removeWipeFiles: (caseId: string) => Promise<{ ok: boolean; message: string }>;
  stopWipe: () => Promise<void>;
  subscribe: (callback: (event: ExtractEvent) => void) => () => void;
  review: (input: ReviewRequest) => Promise<ReviewResponse>;
  search: (caseId: string, query: string) => Promise<Message[]>;
  publishToAtlas?: (caseId: string) => Promise<{ ok: boolean; message: string }>;
};
