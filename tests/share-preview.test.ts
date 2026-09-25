import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERIC_PLAN_TITLE,
  isPlanId,
  eventLabel,
  parseSharePreview,
  shareCopy,
  shareMessage,
  whatsappShareUrl,
} from "../lib/share-preview.ts";

const ID = "a6ad8145-7e3f-456c-be8e-2430175d6fb6";
const NOW = Date.parse("2026-09-24T12:00:00Z");
const open = { title: "Friday dinner", status: "open", stage: "pool", deadline: "2026-09-26T16:00:00Z", host_first_name: "Sara", spot_count: 9 };

test("isPlanId gates the DB call: only a uuid passes", () => {
  assert.equal(isPlanId(ID), true);
  for (const bad of ["not-a-uuid", "", `${ID}x`, `${ID}' or 1=1`, null, undefined, 42]) assert.equal(isPlanId(bad), false);
});

test("parseSharePreview rejects anything off-shape instead of trusting it", () => {
  assert.equal(parseSharePreview(null), null);
  assert.equal(parseSharePreview({ ...open, status: "closed" }), null);
  assert.equal(parseSharePreview({ ...open, title: "   " }), null);
  const parsed = parseSharePreview({ ...open, host_first_name: " ", spot_count: "9", extra: "user-id" });
  assert.equal(parsed?.host_first_name, null);
  assert.equal(parsed?.spot_count, 0);
  assert.equal("extra" in (parsed ?? {}), false);
});

test("no preview (bad id, missing RPC, deleted plan) reads as the generic card", () => {
  const copy = shareCopy(null, NOW);
  assert.equal(copy.title, GENERIC_PLAN_TITLE);
  assert.equal(copy.state, "Vote on 9 Dubai spots");
  assert.equal(copy.host, null);
});

test("an open pool plan names the host, the spot count and a future deadline in Dubai time", () => {
  const copy = shareCopy(parseSharePreview(open), NOW);
  assert.equal(copy.host, "Sara is hosting");
  assert.equal(copy.state, "Vote on 9 Dubai spots");
  assert.match(copy.closes ?? "", /^Voting closes Sat 26 Sept?, 8:00 pm$/); // ICU spells Sep or Sept
});

test("a passed deadline and a decided plan never claim voting is open", () => {
  assert.equal(shareCopy(parseSharePreview({ ...open, deadline: "2026-09-01T00:00:00Z" }), NOW).closes, null);
  const decided = shareCopy(parseSharePreview({ ...open, status: "decided", stage: "decided" }), NOW);
  assert.match(decided.state, /^Decided/);
  assert.equal(decided.closes, null);
});

test("the WhatsApp link carries the title and the plan link, encoded", () => {
  const url = `https://plan-ind.vercel.app/plan/${ID}`;
  assert.equal(shareMessage("Dinner & drinks", url), `Help pick where we go: "Dinner & drinks"\n${url}`);
  const wa = new URL(whatsappShareUrl("Dinner & drinks", url));
  assert.equal(wa.origin, "https://wa.me");
  assert.equal(wa.searchParams.get("text"), shareMessage("Dinner & drinks", url));
});

const decidedRow = {
  ...open, status: "decided", stage: "decided", deadline: null,
  event_time: "2026-09-26T16:00:00Z", winner_name: "  Il Borro\nBistro ", winner_area: "Jumeirah",
};

test("an open plan never names a winner, even if the payload carries one", () => {
  const parsed = parseSharePreview({ ...open, winner_name: "Leak", winner_area: "Marina" });
  assert.equal(parsed?.winner_name, null);
  assert.equal(parsed?.winner_area, null);
  assert.equal(shareCopy(parsed, NOW).winner, null);
});

test("event times read in Dubai time, minutes only when they are not :00", () => {
  assert.equal(eventLabel("2026-09-26T16:00:00Z"), "Sat 26 Sep, 8 pm");
  assert.equal(eventLabel("2026-09-26T16:30:00Z"), "Sat 26 Sep, 8:30 pm");
  assert.equal(eventLabel("nonsense"), null);
  assert.equal(eventLabel(null), null);
});

test("a decided plan's card leads with the winner, its time and area", () => {
  const copy = shareCopy(parseSharePreview(decidedRow), NOW);
  assert.equal(copy.winner, "Il Borro Bistro");
  assert.equal(copy.details, "Sat 26 Sep, 8 pm · Jumeirah");
  assert.equal(copy.title, "Friday dinner");
  assert.equal(copy.description, "Sat 26 Sep, 8 pm · Jumeirah. Friday dinner is decided. Open the plan to RSVP.");
  const noTime = shareCopy(parseSharePreview({ ...decidedRow, event_time: null }), NOW);
  assert.equal(noTime.details, "Jumeirah");
});

test("a decided plan's share message announces the winner", () => {
  const url = `https://plan-ind.vercel.app/plan/${ID}`;
  const winner = { name: "Il Borro", area: "Jumeirah", eventTime: "2026-09-26T16:00:00Z" };
  assert.equal(shareMessage("Friday dinner", url, winner), `We're going to Il Borro (Jumeirah) — Sat 26 Sep, 8 pm. RSVP: ${url}`);
  assert.equal(shareMessage("Friday dinner", url, { ...winner, area: null, eventTime: null }), `We're going to Il Borro. RSVP: ${url}`);
  assert.equal(shareMessage("Friday dinner", "", winner), "We're going to Il Borro (Jumeirah) — Sat 26 Sep, 8 pm.");
  const wa = new URL(whatsappShareUrl("Friday dinner", url, winner));
  assert.equal(wa.searchParams.get("text"), shareMessage("Friday dinner", url, winner));
});
