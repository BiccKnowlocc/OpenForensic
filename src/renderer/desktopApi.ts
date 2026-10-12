import type { ExaminerApi } from "../../shared/types";

function bridge(): ExaminerApi {
  const api = window.examiner;
  if (!api) throw new Error("The desktop bridge is missing. Start OpenForensic with npm run dev.");
  return api;
}

export const desktopApi: ExaminerApi = {
  mode: "desktop",
  listCases: () => bridge().listCases(),
  getCase: (id) => bridge().getCase(id),
  createCase: (input) => bridge().createCase(input),
  archiveCase: (id) => bridge().archiveCase(id),
  pickCaseFolder: () => bridge().pickCaseFolder?.() ?? Promise.resolve(null),
  deviceStatus: () => bridge().deviceStatus(),
  extract: (caseId) => bridge().extract(caseId),
  wipeFreeSpace: (caseId) => bridge().wipeFreeSpace(caseId),
  removeWipeFiles: (caseId) => bridge().removeWipeFiles(caseId),
  stopWipe: () => bridge().stopWipe(),
  subscribe: (callback) => bridge().subscribe(callback),
  review: (input) => bridge().review(input),
  search: (caseId, query) => bridge().search(caseId, query),
  verifyCase: (caseId) => bridge().verifyCase?.(caseId) ?? Promise.reject(new Error("File check runs in the desktop app.")),
  mediaSrc: (caseId, localPath) => bridge().mediaSrc?.(caseId, localPath) ?? null,
  publishToAtlas: (caseId) => bridge().publishToAtlas?.(caseId) ?? Promise.resolve({ ok: false, message: "Atlas publish is not available." }),
};
