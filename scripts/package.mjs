import { readFileSync, existsSync, realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const version = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version;
if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version))
  throw new Error("Invalid package version.");

const processCheck = `
$ErrorActionPreference = 'Stop'
$targetFolder = [IO.Path]::GetFullPath($env:OPENFORENSIC_PACKAGE_TARGET).TrimEnd('\\') + '\\'
$blocked = @(Get-CimInstance Win32_Process -Filter "name = 'OpenForensic.exe'" | Where-Object {
  !$_.ExecutablePath -or $_.ExecutablePath.StartsWith($targetFolder, [StringComparison]::OrdinalIgnoreCase)
} | Select-Object ProcessId, ExecutablePath)
ConvertTo-Json -InputObject $blocked -Compress
`;

export function validatePackageTarget(name) {
  if (!/^release(?:-[A-Za-z0-9.-]+)?$/.test(name))
    throw new Error(
      "Package output must be a release folder name inside this repository.",
    );
  const target = resolve(root, name);
  const within = relative(root, target);
  if (!within || within.startsWith(".." + sep) || isAbsolute(within))
    throw new Error("Package output escaped the repository.");
  if (existsSync(target)) {
    const actual = realpathSync(target);
    if (
      (process.platform === "win32" ? actual.toLowerCase() : actual) !==
      (process.platform === "win32" ? target.toLowerCase() : target)
    )
      throw new Error("Packaging into a linked directory is refused.");
    if (process.platform === "win32") {
      const output = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", processCheck],
        {
          windowsHide: true,
          encoding: "utf8",
          timeout: 15000,
          env: { ...process.env, OPENFORENSIC_PACKAGE_TARGET: target },
        },
      );
      const blocked = JSON.parse(output.trim() || "[]");
      if (!Array.isArray(blocked) || blocked.length)
        throw new Error(
          `Packaging refused: OpenForensic is running from ${target}, or its location could not be verified. Close that version or choose a different release folder before packaging. No package files were removed.`,
        );
    } else {
      throw new Error(
        `Package output already exists: ${target}. Choose a new release folder with --output-name=release-<name> to preserve the previous bundle.`,
      );
    }
  }
  return target;
}

async function main() {
  const args = process.argv.slice(2);
  const override = args.find((arg) => arg.startsWith("--output-name="));
  const name =
    override?.slice("--output-name=".length) || `release-v${version}`;
  if (
    args.some(
      (arg) =>
        arg !== "--dir" &&
        arg !== "--check" &&
        !arg.startsWith("--output-name="),
    )
  )
    throw new Error(
      "Supported packaging options: --dir, --check, --output-name=release-<name>.",
    );
  const target = validatePackageTarget(name);
  if (args.includes("--check")) {
    console.log(`Packaging preflight passed: ${target}`);
    return;
  }
  const cli = require.resolve("electron-builder/out/cli/cli.js");
  const child = spawn(
    process.execPath,
    [
      cli,
      ...(args.includes("--dir") ? ["--dir"] : []),
      `--config.directories.output=${name}`,
    ],
    {
      cwd: root,
      shell: false,
      windowsHide: true,
      stdio: "inherit",
    },
  );
  await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? accept() : reject(new Error(`Packaging failed (${code}).`)),
    );
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
