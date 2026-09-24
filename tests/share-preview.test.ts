import assert from "node:assert/strict";
import test from "node:test";
import {
  GENERIC_PLAN_TITLE,
  isPlanId,
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
