import { createContext, useContext } from "react";
import type { ExaminerApi } from "../../shared/types";

const ApiContext = createContext<ExaminerApi | null>(null);

export function ApiProvider({ api, children }: { api: ExaminerApi; children: React.ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): ExaminerApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("Examiner API is not available.");
  return api;
}
