import assert from "node:assert/strict";
import test from "node:test";
import { greetingFor, pickRightNow } from "../lib/right-now.ts";

// 21:00 in Dubai.
const evening = new Date("2026-09-27T17:00:00Z");
const row = (name: string, category: string, open_till: string, photo_url: string | null = null) => ({ name, category, open_till, photo_url });

test("open now comes first, photographed first, at most two per category", () => {
  const rows = [
    row("Aa Cafe", "cafe", "4pm"),               // closed by 9pm
    row("Bb Dinner", "dinner", "11pm"),
    row("Cc Dinner", "dinner", "1am", "p.jpg"),
    row("Dd Dinner", "dinner", "12am"),
    row("Ee Bar", "nightlife", "3am"),
  ];
  assert.deepEqual(pickRightNow(rows, evening, 4).map((r) => r.name), ["Cc Dinner", "Bb Dinner", "Ee Bar", "Aa Cafe"]);
});

test("the greeting follows the Dubai clock, whoever is asking", () => {
  assert.equal(greetingFor(new Date("2026-09-27T03:30:00Z")), "Good morning"); // 07:30 Dubai
  assert.equal(greetingFor(new Date("2026-09-27T17:00:00Z")), "Good evening"); // 21:00
  assert.equal(greetingFor(new Date("2026-09-26T22:30:00Z")), "Still up");     // 02:30
});
