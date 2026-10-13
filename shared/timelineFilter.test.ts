import assert from "node:assert/strict";
import test from "node:test";
import sample from "./sample-case.json";
import { timelineRows } from "./aiReview";
import { easternDateKey } from "./names";
import { ALL, filterTimeline } from "./timelineFilter";
import type { CaseBundle } from "./types";

const events = timelineRows(sample as CaseBundle);

test("timeline filters by eastern date, sender, and platform", () => {
  const byDate = filterTimeline(events, { date: "2026-10-07", sender: ALL, platform: ALL });
  assert.ok(byDate.length > 0);
  assert.ok(byDate.every((event) => easternDateKey(event.at) === "2026-10-07"));

  const bySender = filterTimeline(events, { date: ALL, sender: "Alex Rivera", platform: "sms" });
  assert.ok(bySender.length > 0);
  assert.ok(bySender.every((event) => event.sender === "Alex Rivera" && event.platform === "sms"));

  const none = filterTimeline(events, { date: "2026-10-07", sender: "Harbor Auto", platform: "call" });
  assert.equal(none.length, 0);
});
