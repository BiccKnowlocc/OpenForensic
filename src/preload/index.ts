import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI, Progress } from "../shared/types";
const invoke = (channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(`forensic:${channel}`, ...args);
const api: DesktopAPI = {
  closeCase: () => invoke("close-case"),
  sanitizationPrepare: (input) => invoke("sanitization-prepare", input),
  sanitizationStart: (input) => invoke("sanitization-start", input),
  sanitizationJobs: () => invoke("sanitization-jobs"),
  sanitizationCancel: () => invoke("sanitization-cancel"),
  sanitizationCleanup: (id) => invoke("sanitization-cleanup", id),
  sanitizationExport: (id) => invoke("sanitization-export", id),
  onSanitization: (callback) => {
    const listener = (
      _event: unknown,
      job: import("../shared/types").SanitizationJob,
    ) => callback(job);
    ipcRenderer.on("forensic:sanitization", listener);
    return () => ipcRenderer.removeListener("forensic:sanitization", listener);
  },
  tools: () => invoke("tools"),
  selectTool: (name) => invoke("select-tool", name),
  restartBridge: () => invoke("restart-bridge"),
  diagnostics: () => invoke("diagnostics"),
  devices: () => invoke("devices"),
  inspect: (serial) => invoke("inspect", serial),
  blocks: (serial) => invoke("blocks", serial),
  createCase: (input) => invoke("create-case", input),
  openCase: () => invoke("open-case"),
  currentCase: () => invoke("current-case"),
  stats: () => invoke("stats"),
  evidence: () => invoke("evidence"),
  messages: (query) => invoke("messages", query),
  threads: () => invoke("threads"),
  candidates: (offset) => invoke("candidates", offset),
  audit: () => invoke("audit"),
  acquire: (input) => invoke("acquire", input),
  cancel: () => invoke("cancel"),
  importEvidence: () => invoke("import"),
  parseEvidence: (id) => invoke("parse", id),
  verify: () => invoke("verify"),
  seal: () => invoke("seal"),
  ai: (input) => invoke("ai", input),
  exportReport: (aiId) => invoke("report", aiId),
  media: (id) => invoke("media", id),
  onProgress: (callback) => {
    const listener = (_event: unknown, progress: Progress) =>
      callback(progress);
    ipcRenderer.on("forensic:progress", listener);
    return () => ipcRenderer.removeListener("forensic:progress", listener);
  },
};
contextBridge.exposeInMainWorld("forensic", api);
