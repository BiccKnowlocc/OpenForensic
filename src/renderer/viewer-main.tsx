import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ViewerApp";
import { desktopApi } from "./desktopApi";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={desktopApi} />
  </StrictMode>,
);
