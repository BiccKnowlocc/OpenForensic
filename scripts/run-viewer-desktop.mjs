import { readFile, writeFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const metadata = JSON.parse(await readFile("package.json", "utf8"));
await access("out-viewer/main/index.js");
await writeFile(
  "out-viewer/package.json",
  JSON.stringify(
    {
      name: metadata.name,
      version: metadata.version,
      productName: "OpenForensic",
      main: "main/index.js",
    },
    null,
    2,
  ) + "\n",
);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  createRequire(import.meta.url)("electron"),
  [resolve("out-viewer")],
  { stdio: "inherit", windowsHide: true, env },
);
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
