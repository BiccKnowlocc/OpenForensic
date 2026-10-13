import assert from "node:assert/strict";
import test from "node:test";
import { describeAcquisition, MIN_ESTIMATE_BYTES, MIN_ESTIMATE_MS } from "./acquisitionEstimate";
import { formatEastern } from "./names";

test("Eastern labels follow the clock, not a fixed offset", () => {
  const winter = formatEastern("2026-01-15T17:00:00.000Z");
  const summer = formatEastern("2026-07-15T16:00:00.000Z");
  assert.match(winter, /12:00/);
  assert.match(winter, /\bEST\b/);
  assert.equal(winter.includes("EDT"), false);
  assert.match(summer, /12:00/);
  assert.match(summer, /\bEDT\b/);
  assert.equal(summer.includes("EST"), false);
});

test("remaining stays estimating until throughput is real", () => {
  const early = describeAcquisition({
    status: "running",
    bytesDone: 1024,
    bytesExpected: 5_000_000,
    elapsedMs: 500,
  });
  assert.equal(early.remainingLabel, "Estimating");
  assert.equal(early.throughputLabel, "Estimating");
  assert.match(early.elapsedLabel, /s/);

  const ready = describeAcquisition({
    status: "running",
    bytesDone: MIN_ESTIMATE_BYTES * 2,
    bytesExpected: MIN_ESTIMATE_BYTES * 4,
    elapsedMs: MIN_ESTIMATE_MS,
  });
  assert.match(ready.throughputLabel, /\/s$/);
  assert.match(ready.remainingLabel, /^about /);
  assert.equal(ready.hashRatio, 0.5);
});

test("the timer stops when the pull finishes or drops", () => {
  const done = describeAcquisition({
    status: "done",
    bytesDone: MIN_ESTIMATE_BYTES * 2,
    bytesExpected: MIN_ESTIMATE_BYTES * 2,
    elapsedMs: 12_000,
  });
  assert.equal(done.remainingLabel, "Done");
  assert.equal(done.elapsedLabel, "12s");

  const stopped = describeAcquisition({
    status: "stopped",
    bytesDone: MIN_ESTIMATE_BYTES * 2,
    bytesExpected: MIN_ESTIMATE_BYTES * 8,
    elapsedMs: 12_000,
  });
  assert.equal(stopped.remainingLabel, "Stopped");
  assert.equal(stopped.elapsedLabel, "12s");
});
