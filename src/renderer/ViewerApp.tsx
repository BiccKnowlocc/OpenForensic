import { HashRouter, BrowserRouter, Route, Routes } from "react-router-dom";
import type { ExaminerApi } from "../../shared/types";
import { ApiProvider } from "./api-context";
import { CaseScreen } from "./screens/CaseScreen";
import { HomeScreen } from "./screens/HomeScreen";

export function App({ api }: { api: ExaminerApi }) {
  const Router = api.mode === "desktop" ? HashRouter : BrowserRouter;
  return (
    <ApiProvider api={api}>
      <Router>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/case/:id" element={<CaseScreen />} />
          <Route path="*" element={<HomeScreen />} />
        </Routes>
      </Router>
    </ApiProvider>
  );
}
