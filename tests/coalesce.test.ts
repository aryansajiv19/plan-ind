import assert from "node:assert/strict";
import test from "node:test";
import { coalesce } from "../lib/coalesce.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const WAIT = 20;

test("a burst of events inside the window costs one run, not one per event", async () => {
  let runs = 0;
  const later = coalesce(async () => { runs++; }, WAIT);
  for (let i = 0; i < 25; i++) later();
  await sleep(WAIT * 3);
  assert.equal(runs, 1);
});

test("events during an in-flight run trigger exactly one follow-up, never overlap", async () => {
  let runs = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const later = coalesce(async () => {
    runs++;
    maxConcurrent = Math.max(maxConcurrent, ++concurrent);
    await sleep(WAIT * 2);
    concurrent--;
  }, WAIT);
  later();
  await sleep(WAIT + 5); // first run now in flight
  for (let i = 0; i < 10; i++) later();
  await sleep(WAIT * 6);
  assert.equal(runs, 2, "the last write must still be picked up by one trailing run");
  assert.equal(maxConcurrent, 1);
});

test("later events do not reset the window, so a busy room cannot starve the refetch", async () => {
  let runs = 0;
  const later = coalesce(async () => { runs++; }, WAIT * 2);
  const stop = Date.now() + WAIT * 5;
  while (Date.now() < stop) { later(); await sleep(WAIT / 4); }
  assert.ok(runs >= 1, `expected a run during continuous events, got ${runs}`);
});

test("cancel drops a pending run and any follow-up", async () => {
  let runs = 0;
  const later = coalesce(async () => { runs++; }, WAIT);
  later();
  later.cancel();
  later();
  await sleep(WAIT * 3);
  assert.equal(runs, 0);
});

test("a rejected run does not wedge the throttle", async () => {
  let runs = 0;
  const later = coalesce(async () => { runs++; throw new Error("network"); }, WAIT);
  later();
  await sleep(WAIT * 2);
  later();
  await sleep(WAIT * 2);
  assert.equal(runs, 2);
});
