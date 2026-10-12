import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { ForensicCase } from "../src/main/case";
import { importFile, AcquisitionService } from "../src/main/acquisition";
import { ParserBridge } from "../src/engine/parser_bridge";
import { reportHtml } from "../src/main/report";
import { EvidenceAI } from "../src/main/ai";
import { DeviceBridge } from "../src/main/adb/client";
import type { DeviceProfile, Progress } from "../src/shared/types";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "openforensic-integration-"));
  let item: ForensicCase | null = null;
  try {
    assert.throws(
      () => new ForensicCase(join(root, "missing-case")),
      /No files were created/,
    );
    assert.ok(
      new DeviceBridge().adbPath,
      "Native runtime must construct the adbkit bridge without import interop failures",
    );
    item = ForensicCase.create(join(root, "case"), {
      name: "Synthetic validation case",
      operator: "Test examiner",
      authority: "Synthetic fixture only",
    });
    const source = join(root, "messages.json");
    await writeFile(
      source,
      JSON.stringify([
        {
          platform: "SMS",
          timestamp_utc: "2024-01-01T12:00:00Z",
          sender_id: "Synthetic A",
          receiver_id: "Synthetic B",
          message_text: "marker <script>alert(1)</script>",
          thread_id: "synthetic",
          is_deleted_flag: 0,
        },
      ]),
    );
    const record = await importFile(item, source);
    assert.equal(record.status, "complete");
    const parser = new ParserBridge(join(process.cwd(), "src", "engine"));
    const parsed = await parser.parse(item, record.id);
    assert.equal(parsed.messages, 1);
    assert.equal(
      item.store.messages({
        search: "marker",
        platform: "",
        thread: "",
        limit: 100,
        offset: 0,
      }).length,
      1,
    );
    assert.equal(
      (await parser.parse(item, record.id)).messages,
      0,
      "Reparse must not duplicate messages",
    );
    assert.equal((await item.verify()).ok, true);
    let aiMode = "valid";
    const aiServer = createServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/api/tags")
        response.end(
          JSON.stringify({
            models: [{ name: "synthetic-test-model", digest: "0".repeat(64) }],
          }),
        );
      else if (request.url === "/api/status")
        response.end(
          JSON.stringify({ cloud: { disabled: aiMode !== "cloud" } }),
        );
      else if (request.url === "/api/show")
        response.end(
          JSON.stringify({
            model_info: { "general.architecture": "synthetic" },
          }),
        );
      else {
        request.resume();
        request.on("end", () =>
          response.end(
            JSON.stringify({
              message: {
                content: `AI examiner draft: the synthetic record contains the marker [M:${aiMode === "invalid-citation" ? "999" : "1"}].`,
              },
            }),
          ),
        );
      }
    });
    let aiAvailable = true;
    await new Promise<void>((resolve) => {
      aiServer.once("error", () => {
        aiAvailable = false;
        resolve();
      });
      aiServer.listen(11434, "127.0.0.1", resolve);
    });
    if (aiAvailable) {
      try {
        const result = await new EvidenceAI().ask(item, {
          kind: "question",
          question: "marker",
          thread: "",
          model: "synthetic-test-model",
        });
        assert.deepEqual(result.sourceIds, [1]);
        assert.ok(reportHtml(item, result.id).includes("&lt;script&gt;"));
        assert.equal(
          item.store.db.prepare("SELECT count(*) AS n FROM ai_runs").get() &&
            result.model,
          "synthetic-test-model",
        );
        aiMode = "invalid-citation";
        await assert.rejects(
          new EvidenceAI().ask(item, {
            kind: "question",
            question: "marker",
            thread: "",
            model: "synthetic-test-model",
          }),
          /citations outside/,
        );
        aiMode = "cloud";
        await assert.rejects(
          new EvidenceAI().ask(item, {
            kind: "question",
            question: "marker",
            thread: "",
            model: "synthetic-test-model",
          }),
          /Disable Ollama cloud/,
        );
      } finally {
        await new Promise<void>((resolve) => aiServer.close(() => resolve()));
      }
    } else
      console.log(
        "Local port 11434 is occupied; synthetic AI endpoint test skipped. No requests were sent to an existing service.",
      );
    const profile: DeviceProfile = {
      serial: "synthetic",
      manufacturer: "Test",
      model: "Fixture",
      hardware: "virtual",
      fingerprint: "synthetic/test",
      androidVersion: "test",
      buildType: "userdebug",
      root: true,
      rootMethod: "su",
      selinux: "Enforcing",
      deviceTimeUtc: "2024-01-01T00:00:00Z",
      hostTimeUtc: "2024-01-01T00:00:00Z",
      clockOffsetSeconds: 0,
      clockRoundTripMs: 0,
      properties: {},
    };
    const mock = {
      adbPath: "synthetic-test-only",
      ready: async () => {},
      inspect: async () => profile,
      probe: async () => "16",
      stream: (_serial: string, command: string) => ({
        stream: Readable.from([Buffer.from("short")]),
        completion: Promise.resolve(),
        stop: () => {},
        command,
      }),
    } as unknown as DeviceBridge;
    let final: Progress | null = null;
    const service = new AcquisitionService(mock, (progress) => {
      if (progress.status !== "running") final = progress;
    });
    service.start(item, {
      serial: "synthetic",
      mode: "physical",
      external: false,
      appData: false,
      block: "/dev/block/sda",
      acknowledged: true,
    });
    const deadline = Date.now() + 15000;
    while (service.active && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(service.active, false);
    assert.equal((final as Progress | null)?.status, "failed");
    const partial = item.store.evidence().find((e) => e.kind === "physical");
    assert.equal(partial?.status, "partial");
    assert.equal(partial?.bytes, 5);
    assert.ok(partial?.error?.includes("size mismatch"));
    assert.equal((await item.verify()).ok, true);
    const cancelMock = {
      ...mock,
      stream: (_serial: string, command: string) => {
        let sent = false;
        const stream = new Readable({
          read() {
            if (!sent) {
              sent = true;
              this.push(Buffer.from("partial capture"));
            }
          },
        });
        return {
          stream,
          completion: Promise.resolve(),
          stop: () => stream.destroy(),
          command,
        };
      },
    } as unknown as DeviceBridge;
    let cancelled: Progress | null = null;
    const cancellable = new AcquisitionService(cancelMock, (p) => {
      if (p.status !== "running") cancelled = p;
    });
    cancellable.start(item, {
      serial: "synthetic",
      mode: "logical",
      external: false,
      appData: false,
      block: "",
      acknowledged: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    cancellable.cancel();
    const cancelDeadline = Date.now() + 15000;
    while (cancellable.active && Date.now() < cancelDeadline)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal((cancelled as Progress | null)?.status, "cancelled");
    assert.ok(
      item.store
        .evidence()
        .some((e) => e.error?.includes("Operator cancelled")),
    );
    const manifestPath = await item.seal();
    assert.ok(
      JSON.parse(await readFile(manifestPath, "utf8")).caseDatabaseSha256,
    );
    assert.throws(() => item!.writable(), /sealed/);
    assert.equal((await item.verify()).ok, true);
    item.store.close();
    item = new ForensicCase(join(root, "case"));
    assert.equal((await item.verify()).ok, true, "Seal must survive reopening");
    const derivative = item.store.db
      .prepare("SELECT relative_path FROM derived_files LIMIT 1")
      .get() as { relative_path: string };
    await writeFile(join(item.root, derivative.relative_path), "tampered");
    assert.equal((await item.verify()).ok, false);
    console.log(
      "Integration passed: native SQLite/FTS5, import/readback, Python bridge, duplicate prevention, local AI citations/report escaping, short physical capture and operator cancellation retention, seal/reopen, derivative tamper detection.",
    );
  } finally {
    item?.store.close();
    await rm(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
