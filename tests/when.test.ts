import assert from "node:assert/strict";
import test from "node:test";
import { whenLabel, whenPicksValid, whenSuggestions } from "../lib/when.ts";

// Sunday 27 Sep 2026, 12:13 in Dubai.
const now = new Date("2026-09-27T08:13:00Z");

test("suggestions: the next evenings at 8pm and the weekend, in Dubai time", () => {
  assert.deepEqual(whenSuggestions(now).map(whenLabel), [
    "Sun 27 Sept, 8pm", "Mon 28 Sept, 8pm", "Tue 29 Sept, 8pm", "Fri 2 Oct, 8pm", "Sat 3 Oct, 1pm",
  ]);
});

test("tonight is skipped once 8pm is under an hour away", () => {
  const late = new Date("2026-09-27T15:30:00Z"); // 19:30 in Dubai
  assert.equal(whenLabel(whenSuggestions(late)[0]), "Mon 28 Sept, 8pm");
});

test("the host offers none, or two to four future times within 60 days", () => {
  const [a, b, c, d, e] = whenSuggestions(now);
  assert.equal(whenPicksValid([], now), true);
  assert.equal(whenPicksValid([a], now), false);
  assert.equal(whenPicksValid([a, b], now), true);
  assert.equal(whenPicksValid([a, b, c, d], now), true);
  assert.equal(whenPicksValid([a, b, c, d, e], now), false);
  assert.equal(whenPicksValid([a, a], now), false);
  assert.equal(whenPicksValid([a, "2026-09-01T16:00:00.000Z"], now), false);
});
