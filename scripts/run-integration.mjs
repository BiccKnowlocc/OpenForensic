import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

await mkdir("artifacts", { recursive: true });
await build({
  entryPoints: ["tests/integration.ts"],
  outfile: "artifacts/integration.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["better-sqlite3", "@devicefarmer/adbkit"],
  plugins: [
    {
      name: "sql",
      setup(builder) {
        builder.onResolve({ filter: /\.sql\?raw$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.slice(0, -4)),
          namespace: "sql",
        }));
        builder.onLoad({ filter: /.*/, namespace: "sql" }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
});
const electron = createRequire(import.meta.url)("electron");
const child = spawn(electron, ["artifacts/integration.cjs"], {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
