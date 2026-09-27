import assert from "node:assert/strict";
import test from "node:test";
import { googleCalUrl, icsHref } from "../lib/calendar.ts";
import { fromDubaiInput, toDubaiInput } from "../lib/dubai-phase.ts";

const plan = { id: "p1", title: "Friday, finally", event_time: "2026-10-02T16:00:00.000Z" };
const spot = { name: "Bu Qtair", area: "Umm Suqeim", address: null, latitude: 25.1515, longitude: 55.1972, google_place_id: null };
const url = "https://plan-ind.vercel.app/plan/p1";
const ics = (s: typeof spot) => decodeURIComponent(icsHref(plan, s, url)!.split(",").slice(1).join(","));

test("a Dubai wall time saves as that instant wherever the host is", () => {
  assert.equal(fromDubaiInput("2026-10-02T20:00"), "2026-10-02T16:00:00.000Z");
  assert.equal(toDubaiInput("2026-10-02T16:00:00.000Z"), "2026-10-02T20:00");
  assert.equal(fromDubaiInput(""), null);
  assert.equal(fromDubaiInput("20:00"), null);
});

test("the calendar location routes: the address, else the coordinates", () => {
  assert.match(ics(spot), /^LOCATION:25\.1515\\,55\.1972$/m);
  assert.match(ics({ ...spot, address: "Fishing Harbour 2, Umm Suqeim" }), /^LOCATION:Fishing Harbour 2\\, Umm Suqeim$/m);
  assert.match(ics({ ...spot, latitude: null, longitude: null }), /^LOCATION:Bu Qtair\\, Umm Suqeim$/m);
});

test("the description carries the plan and the Maps link, one escaped line per fact", () => {
  const text = ics(spot);
  const description = text.split("\r\n").find((line) => line.startsWith("DESCRIPTION:"))!;
  assert.ok(description.includes(`The plan: ${url}\\nDirections: https://www.google.com/maps/search/`));
  assert.equal(text.split("\r\n").filter((line) => line.startsWith("DESCRIPTION")).length, 1, "no raw newline breaks the property");
  assert.match(text, /^SUMMARY:Bu Qtair\. Friday\\, finally$/m);
});

test("the Google link has the same location and description", () => {
  const params = new URL(googleCalUrl(plan, spot, url)!).searchParams;
  assert.equal(params.get("location"), "25.1515,55.1972");
  assert.ok(params.get("details")!.startsWith(`The plan: ${url}\nDirections: https://www.google.com/maps/`));
  assert.equal(params.get("dates"), "20261002T160000Z/20261002T180000Z");
  assert.equal(googleCalUrl({ ...plan, event_time: null }, spot, url), null);
});
