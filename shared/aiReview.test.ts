import assert from "node:assert/strict";
import test from "node:test";
import { localReview } from "./aiReview";
import sample from "./sample-case.json";
import type { CaseBundle } from "./types";

const bundle = sample as CaseBundle;

test("local review answers only from the sample and labels the fallback", () => {
  const response = localReview({ task: "ask", caseId: bundle.summary.id, question: "Who mentioned the gray sedan?" }, bundle);
  assert.equal(response.provider, "local-fallback");
  assert.match(response.label, /Local review/);
  assert.match(response.text, /Alex Rivera/);
  assert.match(response.text, /Gray sedan|gray sedan/);
});

test("thread summary and timeline stay inside the case", () => {
  const summary = localReview({ task: "summarize_thread", caseId: bundle.summary.id, threadId: "thread-jordan" }, bundle);
  assert.match(summary.text, /locker 14/);
  assert.equal(summary.text.includes("office laptop"), true);
  const timeline = localReview({ task: "explain_timeline", caseId: bundle.summary.id }, bundle);
  assert.match(timeline.text, /2026-10-07/);
  const missing = localReview({ task: "ask", caseId: bundle.summary.id, question: "What is the warehouse alarm code?" }, bundle);
  assert.match(missing.text, /does not contain/);
});

test("report draft identifies the sample", () => {
  const report = localReview({ task: "draft_report", caseId: bundle.summary.id }, bundle);
  assert.match(report.text, /not an acquisition/);
  assert.match(report.text, /7HBR214|Harbor Street/);
});
