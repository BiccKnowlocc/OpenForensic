import type { ExaminerApi } from "../../shared/types";

declare global {
  interface Window {
    examiner?: ExaminerApi;
  }
}

export {};
