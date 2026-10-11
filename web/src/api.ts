import { localReview } from "../../shared/aiReview";
import { searchBundle } from "../../shared/search";
import sample from "../../shared/sample-case.json";
import type { CaseBundle, CaseListResponse, CaseSummary, ExaminerApi, ReviewRequest } from "../../shared/types";

const sampleBundle = sample as CaseBundle;
const cache = new Map<string, CaseBundle>([[sampleBundle.summary.id, sampleBundle]]);

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

export const webApi: ExaminerApi = {
  mode: "web",
  async listCases() {
    try {
      const response = await fetch("/api/cases");
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as CaseListResponse;
      if (!data.cases.some((item) => item.id === sampleBundle.summary.id)) {
        data.cases = [sampleBundle.summary, ...data.cases];
      }
      return data;
    } catch (error) {
      return {
        atlas: false,
        atlasError: error instanceof Error ? error.message : "The case service did not respond.",
        cases: [sampleBundle.summary],
      };
    }
  },
  async getCase(id) {
    if (cache.has(id)) return cache.get(id)!;
    const response = await fetch(`/api/cases/${id}`);
    if (!response.ok) throw new Error(await readError(response));
    const bundle = await response.json() as CaseBundle;
    cache.set(id, bundle);
    return bundle;
  },
  async createCase(input) {
    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(await readError(response));
    const summary = await response.json() as CaseSummary;
    cache.delete(summary.id);
    return summary;
  },
  async archiveCase(id) {
    const response = await fetch(`/api/cases/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "archive" }) });
    if (!response.ok) throw new Error(await readError(response));
    cache.delete(id);
  },
  async deviceStatus() {
    return {
      adbFound: false,
      devices: [],
      message: "This viewer does not talk to USB. Acquisition runs in the desktop app on the examiner machine.",
    };
  },
  async extract() {
    return { ok: false, message: "Logical extraction runs in the desktop app, with an authorized phone plugged in." };
  },
  async wipeFreeSpace() {
    return { ok: false, message: "Free-space wipe runs in the desktop app. It writes junk files only after USB debugging is authorized, and only under /sdcard/OpenForensic/free-space-wipe." };
  },
  async removeWipeFiles() {
    return { ok: false, message: "Removing wipe files runs in the desktop app, on the same authorized phone." };
  },
  async stopWipe() {
    return undefined;
  },
  subscribe() {
    return () => undefined;
  },
  async review(input: ReviewRequest) {
    const bundle = input.caseBundle ?? await this.getCase(input.caseId);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, caseBundle: bundle }),
      });
      if (!response.ok) throw new Error(await readError(response));
      return await response.json();
    } catch {
      return localReview({ ...input, caseBundle: bundle }, bundle);
    }
  },
  async search(caseId, query) {
    const bundle = await this.getCase(caseId);
    return searchBundle(bundle, query);
  },
};
