import assert from "node:assert/strict";
import test from "node:test";
import {
  fitForEvent,
  formatClock,
  hoursLabel,
  openStatus,
  parseOpenTill,
} from "../lib/open-hours.ts";
import { dubaiMinuteOfDay } from "../lib/dubai-phase.ts";

// Dubai is UTC+4 with no DST: "HH:MM Dubai" on a fixed date.
const dubai = (hhmm: string, day = "2026-09-25") => new Date(`${day}T${hhmm}:00+04:00`);

test("dubaiMinuteOfDay reads the Dubai clock, not the machine's", () => {
  assert.equal(dubaiMinuteOfDay(new Date("2026-09-25T20:30:00Z")), 30); // 00:30 Dubai
  assert.equal(dubaiMinuteOfDay(dubai("23:59")), 23 * 60 + 59);
  assert.equal(dubaiMinuteOfDay(dubai("00:00")), 0);
});

test("parses every closing-time shape in the catalogue", () => {
  assert.deepEqual(parseOpenTill("12am"), { kind: "clock", minute: 0 });
  assert.deepEqual(parseOpenTill("1am"), { kind: "clock", minute: 60 });
  assert.deepEqual(parseOpenTill("1:30am"), { kind: "clock", minute: 90 });
  assert.deepEqual(parseOpenTill("11:30pm"), { kind: "clock", minute: 23 * 60 + 30 });
  assert.deepEqual(parseOpenTill("12pm"), { kind: "clock", minute: 12 * 60 });
  assert.deepEqual(parseOpenTill("6pm"), { kind: "clock", minute: 18 * 60 });
});

test("tolerates case, spacing, dots, prefixes and 24-hour clocks", () => {
  assert.deepEqual(parseOpenTill(" 2 AM "), { kind: "clock", minute: 120 });
  assert.deepEqual(parseOpenTill("1.30am"), { kind: "clock", minute: 90 });
  assert.deepEqual(parseOpenTill("till 11pm"), { kind: "clock", minute: 23 * 60 });
  assert.deepEqual(parseOpenTill("Open until midnight"), { kind: "clock", minute: 0 });
  assert.deepEqual(parseOpenTill("noon"), { kind: "clock", minute: 12 * 60 });
  assert.deepEqual(parseOpenTill("23:00"), { kind: "clock", minute: 23 * 60 });
  assert.deepEqual(parseOpenTill("24:00"), { kind: "clock", minute: 0 });
});

test("'late' and 24-hour venues are recognised but carry no clock", () => {
  assert.deepEqual(parseOpenTill("late"), { kind: "late" });
  assert.deepEqual(parseOpenTill("Till late"), { kind: "late" });
  assert.deepEqual(parseOpenTill("24h"), { kind: "all-day" });
  assert.deepEqual(parseOpenTill("24 hours"), { kind: "all-day" });
});

test("malformed listings parse to null, never a guessed time", () => {
  for (const raw of ["", "  ", null, undefined, "Flexible", "13pm", "0am", "1:75am", "25:00", "24:30", "1am-3am", "ish"]) {
    assert.equal(parseOpenTill(raw), null, String(raw));
  }
});

test("formatClock is the compact form the catalogue uses", () => {
  assert.equal(formatClock(0), "12am");
  assert.equal(formatClock(60), "1am");
  assert.equal(formatClock(90), "1:30am");
  assert.equal(formatClock(12 * 60), "12pm");
  assert.equal(formatClock(21 * 60 + 5), "9:05pm");
  assert.equal(formatClock(24 * 60 + 60), "1am");
});

test("hoursLabel normalises the listing and keeps unknown text honest", () => {
  assert.equal(hoursLabel("1 AM"), "Open till 1am");
  assert.equal(hoursLabel("late"), "Open late");
  assert.equal(hoursLabel("24/7"), "Open 24 hours");
  assert.equal(hoursLabel("Flexible"), "Hours: Flexible");
  assert.equal(hoursLabel(""), null);
});

test("openStatus: well before closing it only repeats the listing", () => {
  // 2pm at a 1am bar: it may not have opened. Never "Open now".
  assert.deepEqual(openStatus("1am", dubai("14:00")), { kind: "listed", label: "Open till 1am" });
  assert.deepEqual(openStatus("1am", dubai("23:59")), { kind: "listed", label: "Open till 1am" });
  // 06:00 is where the service day starts: a fresh day, not "closed".
  assert.equal(openStatus("11pm", dubai("06:00"))?.kind, "listed");
});

test("openStatus: the last hour wraps across midnight", () => {
  assert.deepEqual(openStatus("1am", dubai("00:20")), { kind: "closing-soon", minutes: 40, label: "Closes in 40 min" });
  assert.deepEqual(openStatus("12am", dubai("23:15")), { kind: "closing-soon", minutes: 45, label: "Closes in 45 min" });
  assert.deepEqual(openStatus("11pm", dubai("22:00"))?.kind, "closing-soon");
  assert.equal(openStatus("11pm", dubai("21:59"))?.kind, "listed");
  assert.equal(openStatus("1:30am", dubai("01:29"))?.kind, "closing-soon");
});

test("openStatus: closed from closing time until 06:00, across midnight", () => {
  assert.deepEqual(openStatus("1am", dubai("01:00")), { kind: "closed", label: "Closed now" });
  assert.equal(openStatus("1am", dubai("05:59"))?.kind, "closed");
  assert.equal(openStatus("11pm", dubai("23:30"))?.kind, "closed");
  assert.equal(openStatus("11pm", dubai("02:00"))?.kind, "closed");
  assert.equal(openStatus("12am", dubai("00:00"))?.kind, "closed");
  // A daytime venue is shut all evening.
  assert.equal(openStatus("6pm", dubai("21:00"))?.kind, "closed");
  assert.equal(openStatus("6pm", dubai("17:30"))?.kind, "closing-soon");
});

test("openStatus makes no clock claim for late, all-day, 6am or unknown listings", () => {
  assert.deepEqual(openStatus("late", dubai("03:00")), { kind: "listed", label: "Open late" });
  assert.deepEqual(openStatus("24h", dubai("03:00")), { kind: "listed", label: "Open 24 hours" });
  assert.equal(openStatus("6am", dubai("05:30"))?.kind, "listed");
  assert.equal(openStatus("6am", dubai("07:00"))?.kind, "listed");
  assert.deepEqual(openStatus("Flexible", dubai("03:00")), { kind: "listed", label: "Hours: Flexible" });
  assert.equal(openStatus("", dubai("03:00")), null);
});

test("fitForEvent: an evening start well before closing is fine", () => {
  assert.deepEqual(fitForEvent("1am", dubai("21:00")), { kind: "fits", label: "Open till 1am, fine for a 9pm start" });
  assert.equal(fitForEvent("12am", dubai("20:30"))?.label, "Open till 12am, fine for an 8:30pm start");
  assert.equal(fitForEvent("3am", dubai("23:00"))?.label, "Open till 3am, fine for an 11pm start");
  // A start after midnight at a 3am place still fits.
  assert.equal(fitForEvent("3am", dubai("00:30"))?.kind, "fits");
});

test("fitForEvent: warns when the start is close to or after closing", () => {
  assert.deepEqual(fitForEvent("11pm", dubai("22:15")), {
    kind: "tight",
    minutes: 45,
    label: "Closes at 11pm, only 45 min after your 10:15pm start",
  });
  assert.deepEqual(fitForEvent("11pm", dubai("23:30")), {
    kind: "after-close",
    label: "Closes at 11pm, before your 11:30pm start",
  });
  assert.equal(fitForEvent("12am", dubai("00:00"))?.kind, "after-close");
  assert.equal(fitForEvent("1am", dubai("02:00"))?.kind, "after-close");
  assert.equal(fitForEvent("6pm", dubai("19:00"))?.kind, "after-close");
});

test("fitForEvent: a daytime start at a night venue flags the unknown opening", () => {
  assert.deepEqual(fitForEvent("1am", dubai("13:00")), {
    kind: "check-opening",
    label: "Open till 1am. Check it opens by 1pm",
  });
  // A daytime venue at a daytime start: the closing time is all that matters.
  assert.equal(fitForEvent("6pm", dubai("12:00"))?.kind, "fits");
});

test("fitForEvent: no verdict without a usable clock", () => {
  assert.deepEqual(fitForEvent("late", dubai("21:00")), { kind: "listed", label: "Open late" });
  assert.equal(fitForEvent("Flexible", dubai("21:00"))?.kind, "listed");
  assert.equal(fitForEvent("1am", new Date("not a date"))?.kind, "listed");
  assert.equal(fitForEvent("", dubai("21:00")), null);
});
