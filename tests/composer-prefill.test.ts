import assert from "node:assert/strict";
import test from "node:test";
import { checkedPrefill } from "../lib/composer-prefill.ts";

const draft = { key: "draft", boardName: "", category: "dinner", origin: "marina", title: "Friday", maxBudget: 200, radiusKm: 20, smartQuery: "" };

test("a draft keeps what the composer offers this account", () => {
  assert.deepEqual(checkedPrefill(draft, 25), { ...draft });
});

test("an edited draft loses what the composer wouldn't offer (security review)", () => {
  const edited = checkedPrefill({ ...draft, category: "nightlife", origin: "nowhere", maxBudget: 123, radiusKm: 999, title: "x".repeat(90) }, 18)!;
  assert.equal(edited.category, null, "21+ for an 18-year-old");
  assert.equal(edited.origin, "anywhere");
  assert.equal(edited.maxBudget, undefined);
  assert.equal(edited.radiusKm, undefined);
  assert.equal(edited.title.length, 60);
  assert.equal(checkedPrefill({ ...draft, category: "not-a-type" }, 25)!.category, null);
  assert.equal(checkedPrefill({ ...draft, maxBudget: "100" as unknown as number }, 25)!.maxBudget, undefined);
  assert.equal(checkedPrefill({ ...draft, maxBudget: null, radiusKm: null }, 25)!.maxBudget, null, "any budget is an offered choice");
});
