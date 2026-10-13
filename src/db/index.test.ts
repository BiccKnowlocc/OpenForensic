import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sample from "../../shared/sample-case.json";
import type { CaseBundle } from "../../shared/types";
import { replaceMessages, searchMessages } from "./viewer";

test("case_store.db FTS5 finds the sedan message", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "of-db-"));
  const dbPath = path.join(dir, "case_store.db");
  const bundle = sample as CaseBundle;
  await replaceMessages(dbPath, bundle.messages);
  const hits = await searchMessages(dbPath, "gray sedan");
  assert.ok(hits.some((message) => message.messageText.includes("Gray sedan")));
  const none = await searchMessages(dbPath, "wifi password");
  assert.equal(none.length, 0);
});
