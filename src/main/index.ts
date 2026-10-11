import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { localReview } from "../../shared/aiReview";
import type { ReviewRequest } from "../../shared/types";
import { adbAvailable, fingerprintDevice, listDevices } from "../engine/adb";
import { archiveCase, createCase, ensureSample, listCaseSummaries, openCase, openCaseDirectory } from "../engine/caseFolder";
import { runLogicalExtraction } from "../engine/extract";
import { removeWipeFiles, runFreeSpaceWipe } from "../engine/freeSpaceWipe";
import { publishBundle } from "./atlas";
import { searchMessages } from "../db/index";

const here = path.dirname(fileURLToPath(import.meta.url));
let extracting = false;
let wiping = false;
let wipeStop = false;

function casesRoot(): string {
  return process.env.OPENFORENSIC_CASES_DIR || path.join(app.getPath("userData"), "cases");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 640,
    backgroundColor: "#101614",
    title: "OpenForensic",
    webPreferences: {
      preload: path.join(here, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(path.join(here, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  await ensureSample(casesRoot());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("cases:list", async () => {
  const cases = await listCaseSummaries(casesRoot());
  return { atlas: Boolean(process.env.MONGODB_URI), atlasError: null, cases };
});

ipcMain.handle("cases:get", async (_event, id: string) => openCase(casesRoot(), id));

ipcMain.handle("cases:create", async (_event, input: { name: string; operator: string }) => createCase(casesRoot(), input));

ipcMain.handle("cases:archive", async (_event, id: string) => {
  await archiveCase(casesRoot(), id);
});

ipcMain.handle("cases:pick", async () => {
  const picked = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Open an OpenForensic case folder" });
  if (picked.canceled || !picked.filePaths[0]) return null;
  const bundle = await openCaseDirectory(picked.filePaths[0]);
  return bundle.summary;
});

ipcMain.handle("device:status", async () => {
  const found = await adbAvailable();
  if (!found) {
    return { adbFound: false, devices: [], message: "adb is not on PATH. Install Android platform-tools. The Harbor Street sample still opens." };
  }
  const devices = await listDevices();
  const authorized = devices.find((device) => device.state === "device");
  if (!authorized) {
    const message = devices.some((device) => device.state === "unauthorized")
      ? "The phone is connected, but USB debugging is not authorized. Accept the prompt on the phone. OpenForensic will not bypass it."
      : "No phone is attached. Plug in the Android phone and accept the USB debugging prompt.";
    return { adbFound: true, devices, message };
  }
  const finger = await fingerprintDevice(authorized.serial);
  const merged = devices.map((device) => device.serial === finger.serial ? finger : device);
  return {
    adbFound: true,
    devices: merged,
    message: `${finger.model} is authorized. Rooted: ${finger.rooted ? "yes" : "no"}. v1 reads SMS, calls, contacts, and shared media only.`,
  };
});

ipcMain.handle("extract:start", async (event, caseId: string) => {
  if (extracting) return { ok: false, message: "An extraction is already running." };
  const bundle = await openCase(casesRoot(), caseId);
  if (bundle.summary.sample) return { ok: false, message: "The sample is a fixture. Create a case to extract from a phone." };
  if (bundle.summary.status === "archived") return { ok: false, message: "This case is archived." };
  const devices = (await adbAvailable()) ? await listDevices() : [];
  const authorized = devices.find((device) => device.state === "device");
  if (!authorized) return { ok: false, message: "No authorized phone. Connect it and accept the USB debugging prompt." };
  extracting = true;
  const window = BrowserWindow.fromWebContents(event.sender);
  try {
    return await runLogicalExtraction({
      caseDir: path.join(casesRoot(), caseId),
      serial: authorized.serial,
      onEvent: (extractEvent) => window?.webContents.send("extract:event", extractEvent),
    });
  } finally {
    extracting = false;
  }
});

ipcMain.handle("wipe:stop", async () => {
  wipeStop = true;
});

ipcMain.handle("wipe:start", async (event, caseId: string) => {
  if (wiping || extracting) return { ok: false, message: "Wait until the current USB job finishes." };
  const bundle = await openCase(casesRoot(), caseId);
  if (bundle.summary.sample) return { ok: false, message: "The sample is a fixture. Create a case before filling free space on a phone." };
  if (bundle.summary.status === "archived") return { ok: false, message: "This case is archived." };
  const devices = (await adbAvailable()) ? await listDevices() : [];
  const authorized = devices.find((device) => device.state === "device");
  if (!authorized) return { ok: false, message: "No authorized phone or tablet. Connect it and accept the USB debugging prompt." };
  wiping = true;
  wipeStop = false;
  const window = BrowserWindow.fromWebContents(event.sender);
  try {
    return await runFreeSpaceWipe({
      caseDir: path.join(casesRoot(), caseId),
      serial: authorized.serial,
      shouldStop: () => wipeStop,
      onEvent: (extractEvent) => window?.webContents.send("extract:event", extractEvent),
    });
  } finally {
    wiping = false;
  }
});

ipcMain.handle("wipe:clear", async (_event, caseId: string) => {
  const bundle = await openCase(casesRoot(), caseId);
  if (bundle.summary.sample) return { ok: false, message: "The sample case has no wipe files." };
  const devices = (await adbAvailable()) ? await listDevices() : [];
  const authorized = devices.find((device) => device.state === "device");
  if (!authorized) return { ok: false, message: "No authorized phone or tablet is connected." };
  return removeWipeFiles({ caseDir: path.join(casesRoot(), caseId), serial: authorized.serial });
});

ipcMain.handle("ai:review", async (_event, request: ReviewRequest) => {
  const bundle = request.caseBundle ?? await openCase(casesRoot(), request.caseId);
  return localReview(request, bundle);
});

ipcMain.handle("case:search", async (_event, caseId: string, query: string) => {
  return searchMessages(path.join(casesRoot(), caseId, "case_store.db"), query);
});

ipcMain.handle("atlas:publish", async (_event, caseId: string) => {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { ok: false, message: "Set MONGODB_URI in the host environment. The connection string is not stored in the repo." };
  const bundle = await openCase(casesRoot(), caseId);
  await publishBundle(uri, bundle);
  return { ok: true, message: "Case records were copied to the OpenForensic database. Media files stayed in the local case folder." };
});
