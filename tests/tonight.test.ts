import assert from "node:assert/strict";
import test from "node:test";
import { tonightRows, type TonightInput } from "../lib/tonight.ts";

const base: TonightInput = {
  eventTime: "2026-10-02T16:00:00.000Z", // 8pm Dubai
  spot: { open_till: "12am", min_spend: 0, spend_pp_aed: "99-199", category: "dinner", minimum_age: 0 },
  coming: 4,
  booked: false,
  bookingOwner: null,
  weather: { at: "2026-10-02T16:00:00.000Z", tempC: 33, feelsC: 36, rainPct: 0, windKph: 10, verdict: "warm" } as TonightInput["weather"],
  travel: { minutes: 30, how: "drive (estimate)" },
  friendsBeen: 3,
  now: new Date("2026-10-02T10:00:00Z"),
};
const byKey = (input: TonightInput) => Object.fromEntries(tonightRows(input).map((r) => [r.key, r]));

test("every fact the plan has, one line each", () => {
  const rows = byKey(base);
  assert.equal(rows.open.value, "Open till 12am, fine for an 8pm start");
  assert.equal(rows.open.warn, false);
  assert.equal(rows.cost.value, "About AED 99–199 each · AED 396–796 for the 4 coming");
  assert.equal(rows.age.value, "All ages");
  assert.equal(rows.weather.value, "33°C, feels 36°C: warm");
  assert.equal(rows.booking.value, "Nobody is booking yet");
  assert.equal(rows.booking.warn, true);
  assert.equal(rows.leave.value, "7:20 pm · ≈ 30 min drive (estimate)");
  assert.equal(rows.friends.value, "3 of your friends have been");
});

test("warnings: closing before the start, an age rule, extreme heat; who's booking", () => {
  const rows = byKey({
    ...base,
    spot: { ...base.spot, open_till: "7pm", category: "shisha", minimum_age: 21 },
    weather: { ...base.weather!, verdict: "extreme-heat" },
    bookingOwner: "Omar",
  });
  assert.equal(rows.open.warn, true);
  assert.match(rows.open.value, /before your 8pm start/);
  assert.deepEqual([rows.age.value, rows.age.warn], ["21+ only", true]);
  assert.equal(rows.weather.warn, true);
  assert.equal(rows.booking.value, "Omar is booking");
  assert.equal(byKey({ ...base, booked: true, bookingOwner: "Omar" }).booking.value, "Booked by Omar");
});

test("nothing honest to say, nothing said", () => {
  const rows = byKey({ ...base, eventTime: null, spot: { ...base.spot, open_till: "", spend_pp_aed: null }, weather: null, travel: null, friendsBeen: 0 });
  assert.deepEqual(Object.keys(rows).sort(), ["age", "booking"]);
});
