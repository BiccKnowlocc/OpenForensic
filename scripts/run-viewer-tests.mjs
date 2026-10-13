import { build } from "esbuild";
import { mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const files = [];
for (const directory of ["shared", "src/engine", "src/db"])
  for (const name of (await readdir(directory)).sort())
    if (name.endsWith(".test.ts")) files.push(`${directory}/${name}`);
if (!files.length) throw new Error("No viewer tests found.");
await mkdir("artifacts", { recursive: true });
await build({
  stdin: {
    contents: files
      .map((file) => `import ${JSON.stringify("./" + file)};`)
      .join("\n"),
    resolveDir: resolve("."),
    loader: "ts",
  },
  outfile: "artifacts/viewer-tests.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["better-sqlite3"],
});
const child = spawn(
  createRequire(import.meta.url)("electron"),
  ["--test", "artifacts/viewer-tests.cjs"],
  {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  },
);
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
