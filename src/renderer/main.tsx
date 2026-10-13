import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { desktopApi } from "./desktopApi";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={desktopApi} />
  </StrictMode>,
);
