import assert from "node:assert/strict";
import test from "node:test";
import { classifyAdbFailure } from "./classify";
import { parseDeviceList } from "./adb";
import { refusePhysical } from "./physical";

test("classifies permission, encryption, and disconnect", () => {
  assert.equal(classifyAdbFailure("java.lang.SecurityException: Permission Denial: reading com.android.providers.telephony"), "permission");
  assert.equal(classifyAdbFailure("adb: device offline"), "disconnect");
  assert.equal(classifyAdbFailure("Required key not available"), "encrypted");
  assert.equal(classifyAdbFailure("No result found."), null);
});

test("device list keeps unauthorized phones out of the device state", () => {
  const text = [
    "List of devices attached",
    "R58M123ABC          unauthorized usb:1-1 transport_id:4",
    "PIXEL8             device usb:1-2 product:husky model:Pixel_8 device:husky",
  ].join("\n");
  const devices = parseDeviceList(text);
  assert.equal(devices[0].state, "unauthorized");
  assert.equal(devices[1].model, "Pixel 8");
});

test("physical acquisition is refused and does not describe a dump command", () => {
  const result = refusePhysical();
  assert.equal(result.ok, false);
  assert.equal(result.code, "out_of_scope");
  assert.equal(result.message.includes("dd of "), false);
});
