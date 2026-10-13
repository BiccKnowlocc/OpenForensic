import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      outDir: resolve("out-viewer/main"),
      rollupOptions: { input: { index: resolve("src/main/viewerDesktop.ts") } },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      outDir: resolve("out-viewer/preload"),
      rollupOptions: {
        input: { index: resolve("src/main/preload.ts") },
        output: { format: "cjs", entryFileNames: "index.js" },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve("out-viewer/renderer"),
      rollupOptions: { input: resolve("src/renderer/viewer.html") },
    },
  },
});
