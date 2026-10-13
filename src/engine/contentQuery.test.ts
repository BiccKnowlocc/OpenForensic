import assert from "node:assert/strict";
import test from "node:test";
import { callsFromRows, contactsFromRows, messagesFromSmsRows, parseContentRows } from "./contentQuery";

const dump = [
  "Row: 0 _id=10, address=+14155550142, body=Can you meet at the Harbor Street lot, Saturday?, date=1760000000000, type=1, deleted=0, media=",
  "Row: 1 _id=11, address=+14155550142, body=Saturday 6pm works, date=1760000100000, type=2, deleted=1, media=",
].join("\n");

test("content query parser keeps commas inside the body", () => {
  const rows = parseContentRows(dump);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].body, "Can you meet at the Harbor Street lot, Saturday?");
  assert.equal(rows[1].type, "2");
});

test("sms rows become normalized messages", () => {
  const messages = messagesFromSmsRows(parseContentRows(dump), "+14155550100");
  assert.equal(messages[0].senderId, "+14155550142");
  assert.equal(messages[0].receiverId, "+14155550100");
  assert.equal(messages[1].senderId, "+14155550100");
  assert.equal(messages[1].isDeletedFlag, true);
  assert.equal(messages[0].platform, "sms");
});

test("call and contact rows map", () => {
  const calls = callsFromRows(parseContentRows("Row: 0 _id=1, number=+14155550198, name=Jordan Hale, date=1760000000000, duration=12, type=2"));
  assert.equal(calls[0].direction, "outgoing");
  assert.equal(calls[0].durationSec, 12);
  const contacts = contactsFromRows(parseContentRows("Row: 0 _id=3, display_name=Alex Rivera, number=+14155550142"));
  assert.equal(contacts[0].name, "Alex Rivera");
});
