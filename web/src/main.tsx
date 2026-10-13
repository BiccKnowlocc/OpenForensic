import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/renderer/ViewerApp";
import "../../src/renderer/index.css";
import { webApi } from "./api";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={webApi} />
  </StrictMode>,
);
