import { _electron as electron } from "playwright";
import { createServer } from "vite";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const root = await mkdtemp(join(tmpdir(), "openforensic-viewer-ui-"));
const require = createRequire(import.meta.url);
const metadata = require("../package.json");
const env = {
  ...process.env,
  OPENFORENSIC_CASES_DIR: join(root, "cases"),
  PATH:
    process.platform === "win32"
      ? join(process.env.SystemRoot || "C:\\Windows", "System32")
      : "",
};
for (const name of [
  "MONGODB_URI",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_RENDERER_URL",
]) {
  delete env[name];
  delete process.env[name];
}
let server;
let desktop;
async function exercise(page, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page
    .getByRole("heading", { name: "Harbor Street sample", exact: true })
    .waitFor();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Harbor Street sample",
        exact: true,
      }),
    })
    .click();
  await page
    .getByRole("heading", { name: "Harbor Street sample", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Archive", exact: true })
      .isEnabled(),
    false,
  );
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  await page.getByLabel("Filter by platform", { exact: true }).selectOption("sms");
  await page.getByLabel("Filter by date", { exact: true }).selectOption({ index: 1 });
  assert.ok((await page.locator("ol li").count()) > 0);
  await page.getByRole("tab", { name: "Messages", exact: true }).click();
  await page
    .getByLabel("Search SMS, calls, and contacts", { exact: true })
    .fill("gray sedan");
  await page.getByText("Gray sedan", { exact: false }).first().waitFor();
  await page.getByRole("tab", { name: "Review", exact: true }).click();
  await page
    .getByLabel("Question about this case")
    .fill("Who mentioned the gray sedan?");
  await page
    .getByRole("button", { name: "Ask about this case", exact: true })
    .click();
  await page.locator("pre").filter({ hasText: "Alex Rivera" }).waitFor();
  await page.getByRole("tab", { name: "Custody", exact: true }).click();
  await page.getByRole("button", { name: "Save HTML", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `${label}: sample case, timeline filters, multi-artifact search, local review, custody HTML control, and no renderer errors passed.`,
  );
}
try {
  server = await createServer({
    configFile: resolve("web/vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}`;
  const listing = await fetch(`${url}/api/cases`).then((response) =>
    response.json(),
  );
  assert.equal(listing.cases.length, 1);
  assert.equal(listing.cases[0].sample, true);
  await mkdir("artifacts", { recursive: true });
  const boot = resolve("artifacts/viewer-web-smoke.cjs");
  await writeFile(
    boot,
    `const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({show:false,width:1400,height:1000,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});w.loadURL(${JSON.stringify(url)});});app.on('window-all-closed',()=>app.quit());`,
  );
  desktop = await electron.launch({
    executablePath: require("electron"),
    args: [boot, `--user-data-dir=${join(root, "web-profile")}`],
    env,
    timeout: 30000,
  });
  await exercise(await desktop.firstWindow(), "Web viewer");
  await desktop.close();
  desktop = null;
  await server.close();
  server = null;
  await writeFile(
    "out-viewer/package.json",
    JSON.stringify({
      name: metadata.name,
      version: metadata.version,
      productName: "OpenForensic",
      main: "main/index.js",
    }),
  );
  desktop = await electron.launch({
    executablePath: require("electron"),
    args: [
      resolve("out-viewer"),
      `--user-data-dir=${join(root, "desktop-profile")}`,
    ],
    env,
    timeout: 30000,
  });
  await exercise(await desktop.firstWindow(), "Case-bundle desktop");
} finally {
  if (desktop) await desktop.close();
  if (server) await server.close();
  assert.ok(root.startsWith(join(tmpdir(), "openforensic-viewer-ui-")));
  await rm(root, { recursive: true, force: true });
}
