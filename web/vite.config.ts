import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { localFunctionsPlugin } from "./devApi";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss(), localFunctionsPlugin()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
      "@renderer": fileURLToPath(new URL("../src/renderer", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 41773,
    strictPort: true,
  },
});
