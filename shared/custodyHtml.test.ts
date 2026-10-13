import assert from "node:assert/strict";
import test from "node:test";
import sample from "./sample-case.json";
import { custodyReportHtml } from "./custodyHtml";
import type { CaseBundle } from "./types";

test("the custody export is a standalone HTML file with Eastern times and hashes", () => {
  const html = custodyReportHtml(sample as CaseBundle);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /Harbor Street sample/);
  assert.match(html, /cacd8dee3163e0c4ab582ec675001714d868a75077d0128146a85fefd61da44b/);
  assert.match(html, /EDT|EST/);
  assert.equal(html.includes("<script"), false);
});
