import assert from "node:assert/strict";
import test from "node:test";
import { serial } from "../lib/serial.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("tasks run and land in call order even when a later one is faster", async () => {
  const enqueue = serial();
  const landed: string[] = [];
  await Promise.all([
    enqueue(async () => { await sleep(30); landed.push("first pick"); }),
    enqueue(async () => { await sleep(1); landed.push("re-pick"); }),
  ]);
  assert.deepEqual(landed, ["first pick", "re-pick"]);
});

test("a failed task rejects its own caller and does not block the next", async () => {
  const enqueue = serial();
  const failed = enqueue(async () => { throw new Error("boom"); });
  const next = enqueue(async () => "ok");
  await assert.rejects(failed, /boom/);
  assert.equal(await next, "ok");
});
