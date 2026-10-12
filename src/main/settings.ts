import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";

export type ToolName = "adb" | "python";
type Paths = Partial<Record<ToolName, string>>;

export function resolveAdbPath(saved?: string): string {
  if (process.env.OPENFORENSIC_ADB) return process.env.OPENFORENSIC_ADB;
  if (saved) return saved;
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  const candidates = roots
    .filter((r): r is string => !!r)
    .map((r) =>
      join(
        r,
        "platform-tools",
        process.platform === "win32" ? "adb.exe" : "adb",
      ),
    );
  if (process.platform === "win32") {
    candidates.push(
      join(
        process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
        "Android",
        "Sdk",
        "platform-tools",
        "adb.exe",
      ),
      "C:\\Android\\platform-tools\\adb.exe",
    );
  } else {
    candidates.push(
      join(
        homedir(),
        process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk",
        "platform-tools",
        "adb",
      ),
    );
  }
  return candidates.find((path) => existsSync(path)) || "adb";
}

export class ToolSettings {
  private paths: Paths = {};
  constructor(private file: string) {
    if (existsSync(file)) {
      const data: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Invalid tool settings. Choose the tool paths again.");
      for (const name of ["adb", "python"] as const) {
        const path = (data as Paths)[name];
        if (
          typeof path === "string" &&
          path.length <= 32768 &&
          isAbsolute(path)
        )
          this.paths[name] = path;
      }
    }
  }
  get adb(): string {
    return resolveAdbPath(this.paths.adb);
  }
  get python(): string {
    return process.env.OPENFORENSIC_PYTHON || this.paths.python || "python";
  }
  save(name: ToolName, path: string): void {
    if (!isAbsolute(path))
      throw new Error("Select an absolute executable path.");
    const next = { ...this.paths, [name]: path };
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = this.file + ".tmp";
    writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", {
      mode: 0o600,
    });
    renameSync(temporary, this.file);
    this.paths = next;
  }
}
