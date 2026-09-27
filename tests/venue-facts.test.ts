import assert from "node:assert/strict";
import test from "node:test";
import { listableToday, reopensLabel, spendLabel, venueFacts } from "../lib/venue-facts.ts";

const bare = {
  category: "cafe", minimum_age: 0, phone: null, website: null, licensed: null, dress_code: null, parking: null,
  reservations: null, halal_friendly: null, vegetarian_options: null, spend_pp_aed: null, good_to_know: null,
  facts_checked_on: null, facts_sources: null,
};

test("no facts, no rows and no Checked line", () => {
  assert.deepEqual(venueFacts(bare), { rows: [], checked: null });
});

test("only known facts become rows, each linked to the source that says it", () => {
  const { rows, checked } = venueFacts({
    ...bare,
    licensed: true,
    dress_code: "Beach chic",
    parking: "Valet AED 50",
    website: "https://www.covebeach.com/",
    facts_checked_on: "2026-09-27",
    facts_sources: [
      { fact: "Dress code at the beach club is beach chic", url: "https://www.covebeach.com/terms" },
      { fact: "Alcohol served from 12pm", url: "https://whatson.ae/x" },
      { fact: "Valet parking AED 50", url: "javascript:alert(1)" },
    ],
  });
  assert.deepEqual(rows.map((row) => [row.label, row.value, row.source]), [
    ["Alcohol", "Serves alcohol", "https://whatson.ae/x"],
    ["Dress code", "Beach chic", "https://www.covebeach.com/terms"],
    ["Parking", "Valet AED 50", null], // its only source is not http(s)
    ["Website", "covebeach.com", null],
  ]);
  assert.equal(checked, "Checked September 2026");
});

test("an age rule shows even without sourced facts", () => {
  assert.deepEqual(venueFacts({ ...bare, minimum_age: 21 }).rows.map((row) => row.value), ["21+, bring ID"]);
});

test("spend reads in words, never a dash", () => {
  assert.equal(spendLabel("150-300"), "AED 150 to 300 each");
  assert.equal(spendLabel("500+"), "AED 500 and up, each");
  assert.equal(spendLabel("<40"), "Under AED 40 each");
  assert.equal(spendLabel("0"), "Free");
  assert.equal(spendLabel("150"), "About AED 150 each");
  assert.equal(spendLabel("ask"), null);
});

test("Reopens shows only while the date is after today in Dubai", () => {
  assert.equal(reopensLabel("2026-10-31", "2026-09-27"), "Reopens 31 October 2026");
  assert.equal(reopensLabel("2026-09-27", "2026-09-27"), null);
  assert.equal(reopensLabel(null, "2026-09-27"), null);
});

test("listable filters drop retired curated rows and future reopenings", () => {
  const seen: string[] = [];
  const query = { or(filters: string) { seen.push(filters); return query; } };
  listableToday(query, "2026-09-27");
  assert.deepEqual(seen, ["source.neq.curated,visibility.neq.private", "reopens_on.is.null,reopens_on.lte.2026-09-27"]);
});
