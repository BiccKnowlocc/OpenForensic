import assert from "node:assert/strict";
import test from "node:test";
import { buildDevicePosture, describeCredential, describeEncryption } from "./devicePosture";

test("encryption is only what getprop reported", () => {
  assert.equal(describeEncryption("", ""), "not reported");
  assert.equal(describeEncryption("encrypted", "file"), "encrypted (file)");
  assert.equal(describeEncryption("encrypted", ""), "encrypted");
  assert.equal(describeEncryption("unencrypted", "file"), "unencrypted");
});

test("a screen credential is set, unset, or not reported", () => {
  assert.equal(describeCredential(""), "not reported");
  assert.equal(describeCredential("User 0\n  credential type: NONE\n"), "not set");
  assert.equal(describeCredential("CredentialType: PIN\n"), "set");
  assert.equal(describeCredential("mCredentialType=-1\n"), "not set");
  assert.equal(describeCredential("mCredentialType=3\n"), "set");
  assert.equal(describeCredential("credential enabled: false\n"), "not set");
  assert.equal(describeCredential("User 0 credential type: NONE\nUser 10 credential type: PASSWORD\n"), "set");
  assert.equal(describeCredential("password handle: abc\n"), "not reported");
});

test("the posture card keeps missing facts honest", () => {
  const posture = buildDevicePosture({
    serial: "emulator-5554",
    model: "Pixel 8",
    android: "15",
    securityPatch: "",
    cryptoState: "encrypted",
    cryptoType: "block",
    lockSettings: "no credential line here",
  });
  assert.equal(posture.model, "Pixel 8");
  assert.equal(posture.android, "15");
  assert.equal(posture.securityPatch, "not reported");
  assert.equal(posture.encryption, "encrypted (block)");
  assert.equal(posture.credential, "not reported");
});
