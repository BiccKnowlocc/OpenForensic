import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  net,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import { randomUUID } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z, type ZodType } from "zod";
import { DeviceBridge, collect } from "./adb/client";
import { AcquisitionService, importFile } from "./acquisition";
import { ForensicCase, realWithin } from "./case";
import { ParserBridge } from "../engine/parser_bridge";
import { EvidenceAI, models } from "./ai";
import { reportHtml } from "./report";
import { hashFile } from "./integrity/hashStream";
import type { CaseInfo } from "../shared/types";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
  {
    scheme: "ofmedia",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
if (!app.requestSingleInstanceLock()) app.quit();
let window: BrowserWindow;
let current: ForensicCase | null = null;
let busy = false;
const bridge = new DeviceBridge();
const ai = new EvidenceAI();
const mediaTokens = new Map<string, string>();
const acquisition = new AcquisitionService(bridge, (p) => {
  if (window && !window.isDestroyed())
    window.webContents.send("forensic:progress", p);
});
const caseItem = (): ForensicCase => {
  if (!current) throw new Error("Create or open a case first.");
  return current;
};
const idle = (): void => {
  if (busy || acquisition.active)
    throw new Error("Finish or cancel the current operation first.");
};
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  idle();
  busy = true;
  try {
    return await work();
  } finally {
    busy = false;
  }
}
function sender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url;
  const expected = process.env.ELECTRON_RENDERER_URL;
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !url ||
    (expected
      ? new URL(url).origin !== new URL(expected).origin
      : new URL(url).protocol !== "app:" ||
        new URL(url).host !== "openforensic")
  )
    throw new Error("Untrusted IPC sender.");
}
function handle(
  channel: string,
  schema: ZodType,
  callback: (value: any) => unknown,
): void {
  ipcMain.handle(`forensic:${channel}`, async (event, value) => {
    sender(event);
    return await callback(schema.parse(value));
  });
}
const nothing = z.undefined();
const serial = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_.:-]+$/);
function useCase(root: string): CaseInfo {
  const next = new ForensicCase(root);
  current?.store.close();
  current = next;
  mediaTokens.clear();
  return next.info;
}

app
  .whenReady()
  .then(async () => {
    const parser = new ParserBridge(
      app.isPackaged
        ? join(process.resourcesPath, "engine")
        : join(app.getAppPath(), "src", "engine"),
    );
    const renderer = join(__dirname, "../renderer");
    protocol.handle("app", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== "openforensic")
          return new Response("Denied", { status: 403 });
        const file = await realWithin(
          renderer,
          decodeURIComponent(url.pathname).replace(/^\//, "") || "index.html",
        );
        return await net.fetch(pathToFileURL(file).toString());
      } catch {
        return new Response("Missing asset", { status: 404 });
      }
    });
    protocol.handle("ofmedia", async (request) => {
      const url = new URL(request.url);
      const token = url.pathname.replace(/^\//, "");
      const file = mediaTokens.get(token);
      if (!current || !file || url.host !== "case")
        return new Response("Denied", { status: 403 });
      return net.fetch(pathToFileURL(file).toString(), {
        headers: request.headers,
      });
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    handle("tools", nothing, async () => {
      const [adb, python, aiModels] = await Promise.all([
        collect(bridge.adbPath, ["version"])
          .then((s) => s.split("\n")[0])
          .catch((e) => String(e)),
        collect(parser.python, ["--version"]).catch((e) => String(e)),
        models().catch(() => []),
      ]);
      return { adb, python, aiModels };
    });
    handle("devices", nothing, () => bridge.devices());
    handle("inspect", serial, (s) =>
      exclusive(async () => {
        const profile = await bridge.inspect(s);
        if (current && !current.sealed)
          current.audit.append("device_inspected", { profile });
        return profile;
      }),
    );
    handle("blocks", serial, (s) => exclusive(() => bridge.blocks(s)));
    handle(
      "create-case",
      z.object({
        name: z.string().trim().min(1).max(200),
        operator: z.string().trim().min(1).max(200),
        authority: z.string().trim().min(1).max(4000),
      }),
      (input) =>
        exclusive(async () => {
          const result = await dialog.showOpenDialog(window, {
            title: "Choose parent folder for the new case",
            properties: ["openDirectory", "createDirectory"],
          });
          if (result.canceled) return null;
          const root = join(
            result.filePaths[0],
            `${input.name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 70)}-${randomUUID().slice(0, 8)}`,
          );
          const item = ForensicCase.create(root, input);
          current?.store.close();
          current = item;
          mediaTokens.clear();
          return item.info;
        }),
    );
    handle("open-case", nothing, () =>
      exclusive(async () => {
        const result = await dialog.showOpenDialog(window, {
          title: "Open case folder",
          properties: ["openDirectory"],
        });
        return result.canceled ? null : useCase(result.filePaths[0]);
      }),
    );
    handle("current-case", nothing, () => current?.info ?? null);
    handle("stats", nothing, () => caseItem().store.stats());
    handle("evidence", nothing, () => caseItem().store.evidence());
    handle(
      "messages",
      z.object({
        search: z.string().max(1000),
        platform: z.string().max(128),
        thread: z.string().max(8192),
        offset: z.number().int().min(0).max(10000000),
        limit: z.number().int().min(1).max(300),
      }),
      (q) => caseItem().store.messages(q),
    );
    handle("threads", nothing, () => caseItem().store.threads());
    handle("candidates", z.number().int().min(0).max(10000000), (offset) =>
      caseItem().store.candidates(offset),
    );
    handle("audit", nothing, () => caseItem().audit.read());
    handle(
      "acquire",
      z.object({
        serial,
        mode: z.enum(["logical", "physical"]),
        external: z.boolean(),
        appData: z.boolean(),
        block: z.string().max(256),
        acknowledged: z.boolean(),
      }),
      (input) => {
        idle();
        return acquisition.start(caseItem(), input);
      },
    );
    handle("cancel", nothing, () => acquisition.cancel());
    handle("import", nothing, () =>
      exclusive(async () => {
        const item = caseItem();
        item.writable();
        const result = await dialog.showOpenDialog(window, {
          title: "Import acquired artifacts (select databases and exports)",
          properties: ["openFile", "multiSelections"],
        });
        if (result.canceled) return 0;
        const paths = new Set(result.filePaths);
        for (const path of result.filePaths)
          for (const suffix of ["-wal", "-shm"])
            if (existsSync(path + suffix)) paths.add(path + suffix);
        for (const path of paths) await importFile(item, path);
        return paths.size;
      }),
    );
    handle("parse", z.string().uuid(), (id) =>
      exclusive(() => parser.parse(caseItem(), id)),
    );
    handle("verify", nothing, () => exclusive(() => caseItem().verify()));
    handle("seal", nothing, () => exclusive(() => caseItem().seal()));
    handle(
      "ai",
      z.object({
        kind: z.enum(["question", "thread", "report"]),
        question: z.string().max(4000),
        thread: z.string().max(8192),
        model: z.string().min(1).max(256),
      }),
      (input) => exclusive(() => ai.ask(caseItem(), input)),
    );
    handle("report", z.string().max(128), (aiId) =>
      exclusive(async () => {
        const item = caseItem();
        const html = reportHtml(item, aiId);
        const result = await dialog.showSaveDialog(window, {
          title: "Export examiner report",
          defaultPath: join(item.root, "reports", `report-${Date.now()}.html`),
          filters: [
            { name: "HTML", extensions: ["html"] },
            { name: "PDF", extensions: ["pdf"] },
          ],
        });
        if (result.canceled || !result.filePath) return null;
        if (/\.pdf$/i.test(result.filePath)) {
          const report = new BrowserWindow({
            show: false,
            webPreferences: {
              sandbox: true,
              nodeIntegration: false,
              contextIsolation: true,
            },
          });
          report.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
          try {
            await report.loadURL(
              "data:text/html;charset=utf-8," + encodeURIComponent(html),
            );
            writeFileSync(
              result.filePath,
              await report.webContents.printToPDF({
                printBackground: true,
                pageSize: "A4",
              }),
              { flag: "wx" },
            );
          } finally {
            report.destroy();
          }
        } else
          writeFileSync(result.filePath, html, { flag: "wx", mode: 0o600 });
        if (!item.sealed)
          item.audit.append("report_exported", {
            path: result.filePath,
            aiId: aiId || null,
          });
        return result.filePath;
      }),
    );
    handle("media", z.number().int().positive(), async (id) => {
      const item = caseItem();
      const row = item.store.db
        .prepare("SELECT media_path FROM messages WHERE id=?")
        .get(id) as { media_path: string | null } | undefined;
      if (
        !row?.media_path ||
        !/\.(?:jpg|jpeg|png|webp|mp3|m4a|wav|ogg|mp4|webm|amr)$/i.test(
          row.media_path,
        )
      )
        return null;
      const file = await realWithin(item.root, row.media_path);
      const registered = item.store.db
        .prepare("SELECT sha256 FROM derived_files WHERE relative_path=?")
        .get(row.media_path) as { sha256: string } | undefined;
      if (!registered || (await hashFile(file)).sha256 !== registered.sha256)
        throw new Error("Media derivative failed integrity verification.");
      const token = randomUUID();
      if (mediaTokens.size >= 500)
        mediaTokens.delete(mediaTokens.keys().next().value!);
      mediaTokens.set(token, file);
      return `ofmedia://case/${token}`;
    });
    function createWindow(): void {
      window = new BrowserWindow({
        width: 1440,
        height: 940,
        minWidth: 1050,
        minHeight: 700,
        show: process.env.OPENFORENSIC_TEST_HIDE !== "1",
        title: "OpenForensic",
        backgroundColor: "#10161f",
        webPreferences: {
          preload: join(__dirname, "../preload/index.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.removeMenu();
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.on("close", (event) => {
        if (busy || acquisition.active) {
          event.preventDefault();
          dialog.showMessageBoxSync(window, {
            type: "info",
            message:
              "An operation is running. Cancel acquisition or wait for processing before closing.",
          });
        }
      });
      void window.loadURL(
        process.env.ELECTRON_RENDERER_URL || "app://openforensic/index.html",
      );
    }
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox("OpenForensic startup failed", String(error));
    app.quit();
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => current?.store.close());
