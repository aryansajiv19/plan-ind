import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanGuestName, validGuestName } from "../lib/guest-name";

test("a guest name is cleaned like the server cleans it", () => {
  assert.equal(cleanGuestName("  Dana ‎‮  Lee "), "Dana Lee"); // bidi marks gone, spaces collapsed
  assert.equal(cleanGuestName("a".repeat(45)).length, 30);
  assert.equal(cleanGuestName("\u0007\n"), "");
});

test("2 to 30 characters, after cleaning", () => {
  assert.equal(validGuestName(cleanGuestName(" D ")), false);
  assert.equal(validGuestName(cleanGuestName("Jo")), true);
  assert.equal(validGuestName(cleanGuestName("   ")), false);
});
