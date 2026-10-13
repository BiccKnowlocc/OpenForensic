import assert from "node:assert/strict";
import test from "node:test";
import { parseStatLines } from "./adb";

test("stat lines keep the path after the size", () => {
  const files = parseStatLines("209 /sdcard/DCIM/Camera/IMG 2041.svg\n126 /sdcard/Download/locker-note.txt\n");
  assert.equal(files[0].bytes, 209);
  assert.equal(files[0].path, "/sdcard/DCIM/Camera/IMG 2041.svg");
  assert.equal(files[1].bytes, 126);
});
