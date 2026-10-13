import netlify from "@netlify/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { localFunctionsPlugin } from "./devApi";

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    react(),
    tailwindcss(),
    localFunctionsPlugin(),
    // The Netlify plugin bundles functions for deploy. Local serve uses devApi
    // because this environment's edge-functions Deno binary rejects --allow-scripts.
    ...(command === "build" ? [netlify()] : []),
  ],
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
}));
