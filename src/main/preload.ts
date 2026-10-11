import { contextBridge, ipcRenderer } from "electron";
import type { ExaminerApi, ExtractEvent } from "../../shared/types";

const api: ExaminerApi = {
  mode: "desktop",
  listCases: () => ipcRenderer.invoke("cases:list"),
  getCase: (id) => ipcRenderer.invoke("cases:get", id),
  createCase: (input) => ipcRenderer.invoke("cases:create", input),
  archiveCase: (id) => ipcRenderer.invoke("cases:archive", id),
  pickCaseFolder: () => ipcRenderer.invoke("cases:pick"),
  deviceStatus: () => ipcRenderer.invoke("device:status"),
  extract: (caseId) => ipcRenderer.invoke("extract:start", caseId),
  wipeFreeSpace: (caseId) => ipcRenderer.invoke("wipe:start", caseId),
  removeWipeFiles: (caseId) => ipcRenderer.invoke("wipe:clear", caseId),
  stopWipe: () => ipcRenderer.invoke("wipe:stop"),
  subscribe: (callback) => {
    const listener = (_event: unknown, payload: ExtractEvent) => callback(payload);
    ipcRenderer.on("extract:event", listener);
    return () => ipcRenderer.removeListener("extract:event", listener);
  },
  review: (input) => ipcRenderer.invoke("ai:review", input),
  search: (caseId, query) => ipcRenderer.invoke("case:search", caseId, query),
  publishToAtlas: (caseId) => ipcRenderer.invoke("atlas:publish", caseId),
};

contextBridge.exposeInMainWorld("examiner", api);
