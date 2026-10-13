import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeWipeTarget, parseDfAvailableBytes, planFreeSpaceWipe, RESERVE_BYTES, WIPE_DIRECTORY } from "./freeSpaceWipe";

test("plans junk chunks and leaves a 128 MB reserve", () => {
  const free = RESERVE_BYTES + (32 * 1024 * 1024) + (8 * 1024 * 1024);
  const sizes = planFreeSpaceWipe(free);
  assert.equal(sizes.length, 2);
  assert.equal(sizes[0], 32 * 1024 * 1024);
  assert.equal(sizes[1], 8 * 1024 * 1024);
  assert.deepEqual(planFreeSpaceWipe(RESERVE_BYTES - 1), []);
});

test("reads available bytes from df -k", () => {
  const text = [
    "Filesystem     1K-blocks    Used Available Use% Mounted on",
    "/dev/fuse       52428800 1048576  51380224   2% /storage/emulated/0",
  ].join("\n");
  assert.equal(parseDfAvailableBytes(text), 51380224 * 1024);
});

test("refuses paths outside the wipe folder and block devices", () => {
  assert.doesNotThrow(() => assertSafeWipeTarget(`${WIPE_DIRECTORY}/chunk-00001.bin`));
  assert.throws(() => assertSafeWipeTarget("/sdcard"));
  assert.throws(() => assertSafeWipeTarget(`${WIPE_DIRECTORY}/../DCIM/junk.bin`));
  assert.throws(() => assertSafeWipeTarget("/dev/block/mmcblk0"));
});
