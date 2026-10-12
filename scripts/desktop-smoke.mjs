import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, rm, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "openforensic-desktop-"));
await mkdir(join(root, "cases"));
const fixture = join(root, "synthetic.tar");
await writeFile(
  join(root, "messages.json"),
  JSON.stringify([
    {
      platform: "SMS",
      timestamp_utc: "2024-06-18T09:14:00Z",
      sender_id: "Synthetic Avery",
      receiver_id: "Synthetic Jordan",
      message_text:
        "Reference fixture: meeting scheduled for 14:00. This is synthetic test data.",
      thread_id: "fixture-01",
      media_path: "photo.png",
    },
    {
      platform: "SMS",
      timestamp_utc: "2024-06-18T09:16:00Z",
      sender_id: "Synthetic Jordan",
      receiver_id: "Synthetic Avery",
      message_text: "Reference fixture: confirmed. Bring the project notes.",
      thread_id: "fixture-01",
    },
    {
      platform: "WhatsApp",
      timestamp_utc: "2024-06-18T11:22:00Z",
      sender_id: "Synthetic Avery",
      receiver_id: "Synthetic Casey",
      message_text:
        "Reference fixture: the updated document is ready for review.",
      thread_id: "fixture-02",
      media_path: "audio.wav",
    },
  ]),
);
const archive = spawnSync(
  process.env.OPENFORENSIC_PYTHON || "python",
  [
    "-c",
    `import sys,tarfile,base64,wave;from pathlib import Path
p=Path(sys.argv[1])
(p/'photo.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X6xkAAAAASUVORK5CYII='))
with wave.open(str(p/'audio.wav'),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(bytes(4410))
with tarfile.open(p/'synthetic.tar','w') as t:
 for n in ['messages.json','photo.png','audio.wav']:t.add(p/n,arcname=n)
`,
    root,
  ],
  { encoding: "utf8", windowsHide: true },
);
assert.equal(
  archive.status,
  0,
  archive.stderr || "Python fixture generation failed",
);
await mkdir("artifacts", { recursive: true });
const env = {
  ...process.env,
  OPENFORENSIC_TEST_HIDE: "1",
  // This workflow exercises synthetic case material. Keep device discovery
  // from starting a host daemon whose inherited pipes can delay test exit.
  OPENFORENSIC_ADB: join(root, "no-device-bridge"),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_RENDERER_URL;
let desktop;
try {
  desktop = await electron.launch({
    executablePath:
      process.env.OPENFORENSIC_EXECUTABLE ||
      createRequire(import.meta.url)("electron"),
    args: [
      ...(process.env.OPENFORENSIC_EXECUTABLE ? [] : ["."]),
      `--user-data-dir=${join(root, "profile")}`,
    ],
    env,
    timeout: 30000,
  });
  await desktop.evaluate(
    ({ dialog }, input) => {
      dialog.showOpenDialog = async (_window, options) => ({
        canceled: false,
        filePaths: options.title.startsWith("Import")
          ? [input.fixture]
          : [input.folder],
      });
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: input.report,
      });
    },
    { folder: join(root, "cases"), fixture, report: join(root, "report.pdf") },
  );
  const page = await desktop.firstWindow();
  const metadata = createRequire(import.meta.url)("../package.json");
  assert.equal(
    await desktop.evaluate(({ app }) => app.getVersion()),
    metadata.version,
  );
  await page
    .getByText(`Open source · v${metadata.version}`, { exact: true })
    .waitFor();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.getByRole("heading", { name: "Begin with a case" }).waitFor();
  await page
    .getByRole("button", { name: "Check system tools", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "System tools and connections" })
    .waitFor();
  await page
    .getByRole("button", { name: "Choose ADB executable", exact: true })
    .waitFor();
  const toolStatus = await page.evaluate(() => window.forensic.tools());
  assert.ok(toolStatus.adbPath);
  assert.ok(toolStatus.pythonPath);
  assert.ok(toolStatus.aiStatus);
  await page
    .getByRole("button", { name: "Close system tools", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Device sanitization", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Free-space cleanup", exact: true })
    .waitFor();
  assert.ok(
    (await page.locator(".sanitize-warning").textContent()).includes(
      "cannot guarantee",
    ),
  );
  assert.deepEqual(
    await page.evaluate(() => window.forensic.sanitizationJobs()),
    [],
  );
  await page.getByRole("button", { name: "Acquisition", exact: true }).click();
  await page
    .getByRole("button", { name: "Create a case", exact: true })
    .click();
  await page
    .getByLabel("Case name", { exact: true })
    .fill("Synthetic validation case");
  await page.getByLabel("Examiner / operator").fill("Test examiner");
  await page
    .getByLabel("Collection authority and scope")
    .fill("Generated synthetic fixture; no device or personal data.");
  await page
    .getByRole("button", { name: "Choose folder and create case" })
    .click();
  await page.getByRole("button", { name: "Import artifacts" }).waitFor();
  const providers = page.getByLabel(
    "Capture SMS, MMS, call log, and contacts providers",
  );
  assert.equal(await providers.isChecked(), true);
  await providers.uncheck();
  assert.equal(await providers.isChecked(), false);
  assert.equal(
    await page.getByLabel("Archive shared storage (/sdcard)").isChecked(),
    true,
  );
  await page.getByRole("button", { name: "Import artifacts" }).click();
  await page.getByRole("button", { name: "Parse & carve" }).waitFor();
  await page.getByRole("button", { name: "Parse & carve" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "3 new messages" })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Conversations", exact: true })
    .click();
  await page.locator(".message-bubble").first().waitFor();
  assert.equal(await page.locator(".message-bubble").count(), 3);
  await page.waitForFunction(
    () => document.querySelector(".message-media")?.naturalWidth === 1,
  );
  await page.waitForFunction(
    () => document.querySelector("audio")?.readyState >= 1,
  );
  await page
    .getByRole("textbox", { name: "Search all conversations" })
    .fill("scheduled");
  await page.waitForFunction(
    () => document.querySelectorAll(".message-bubble").length === 1,
  );
  await page
    .getByRole("textbox", { name: "Search all conversations" })
    .fill("");
  await page.waitForFunction(
    () => document.querySelectorAll(".message-bubble").length === 3,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.OPENFORENSIC_SCREENSHOTS === "1")
    await page.screenshot({
      path: "artifacts/conversations.png",
      fullPage: false,
    });
  await page
    .getByRole("button", { name: "Integrity & custody", exact: true })
    .click();
  await page.getByRole("button", { name: "Verify case", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Verification passed" })
    .waitFor({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Report exported" })
    .waitFor({ timeout: 30000 });
  const { stat } = await import("node:fs/promises");
  assert.ok((await stat(join(root, "report.pdf"))).size > 1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.OPENFORENSIC_SCREENSHOTS === "1")
    await page.screenshot({ path: "artifacts/custody.png", fullPage: false });
  assert.deepEqual(errors, []);
  const existingCase = await page.evaluate(() => window.forensic.currentCase());
  await page
    .getByRole("button", { name: "Device sanitization", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Close the evidence case first",
      exact: true,
    })
    .waitFor();
  const refusal = await page.evaluate(async () => {
    try {
      await window.forensic.sanitizationPrepare({
        serial: "SYNTHETIC",
        limitGiB: 1,
      });
      return "unexpectedly allowed";
    } catch (error) {
      return String(error);
    }
  });
  assert.ok(refusal.includes("Close the evidence case"));
  await page
    .getByRole("button", { name: "Close case for sanitization", exact: true })
    .click();
  await page.waitForFunction(
    async () => (await window.forensic.currentCase()) === null,
  );
  assert.ok((await stat(join(existingCase.root, "case_store.db"))).size > 0);
  assert.deepEqual(
    await page.evaluate(() => window.forensic.sanitizationJobs()),
    [],
  );
  if (process.env.OPENFORENSIC_SCREENSHOTS === "1")
    await page.screenshot({
      path: "artifacts/sanitization.png",
      fullPage: false,
    });
  assert.deepEqual(errors, []);
  console.log(
    "Desktop smoke passed: actual Electron IPC, case creation, verified tar import, parser, timeline/search, verified image/audio media protocols, custody verification, PDF export, no renderer errors. Screenshots contain synthetic test data only.",
  );
} finally {
  if (desktop) await desktop.close();
  await rm(root, { recursive: true, force: true });
}
