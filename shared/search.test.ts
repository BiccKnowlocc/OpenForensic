import assert from "node:assert/strict";
import test from "node:test";
import sample from "./sample-case.json";
import { searchBundle } from "./search";
import type { CaseBundle } from "./types";

const bundle = sample as CaseBundle;

test("search covers SMS, calls, and contacts in the open case", () => {
  const sedan = searchBundle(bundle, "gray sedan");
  assert.ok(sedan.messages.length > 0);
  assert.equal(sedan.calls.length, 0);

  const harbor = searchBundle(bundle, "Harbor Auto");
  assert.ok(harbor.calls.some((call) => call.name === "Harbor Auto"));
  assert.ok(harbor.contacts.some((contact) => contact.name === "Harbor Auto"));

  const empty = searchBundle(bundle, "zz");
  assert.deepEqual(empty, { messages: [], calls: [], contacts: [] });
});
