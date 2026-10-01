import assert from "node:assert/strict";
import test from "node:test";
import { guestJoin, type GuestJoinDeps } from "../lib/guest.ts";
import type { GuestJoinStatus } from "../lib/types.ts";

// The guest-join route's decisions, with every side effect faked. The calls a
// fake records are the contract: no session minted before the limit passes,
// a refused guest never keeps a plan-less session.
function rig(over: Partial<GuestJoinDeps> & { joins?: GuestJoinStatus[] } = {}) {
  const calls: string[] = [];
  const joins = [...(over.joins ?? ["joined"])];
  const deps: GuestJoinDeps = {
    session: async () => "none",
    signOut: async () => void calls.push("signOut"),
    signInAnonymously: async () => (calls.push("mint"), "ok"),
    consumeLimit: async () => (calls.push("limit"), "allowed"),
    join: async () => (calls.push("join"), { result: { status: joins.shift() ?? "joined", name: "Sam" } }),
    ...over,
  };
  return { deps, calls };
}
const input = { planId: "p", name: "Sam", captchaToken: "tok", production: true };

test("a new visitor: limit, then mint, then join; 200", async () => {
  const { deps, calls } = rig();
  const r = await guestJoin(input, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(calls, ["limit", "mint", "join"]);
});

test("the limit answers before any session is minted", async () => {
  const { deps, calls } = rig({ consumeLimit: async () => "limited" });
  assert.equal((await guestJoin(input, deps)).status, 429);
  assert.ok(!calls.includes("mint"));
  const down = rig({ consumeLimit: async () => "unavailable" });
  assert.equal((await guestJoin(input, down.deps)).status, 503);
  assert.ok(!down.calls.includes("mint"));
});

test("production without a Turnstile token mints nothing", async () => {
  const { deps, calls } = rig();
  const r = await guestJoin({ ...input, captchaToken: undefined }, deps);
  assert.equal(r.status, 400);
  assert.ok(!calls.includes("mint"));
  // dev has no widget: the same request is allowed
  assert.equal((await guestJoin({ ...input, captchaToken: undefined, production: false }, rig().deps)).status, 200);
});

test("a failed captcha or a limited Auth is not read as an outage", async () => {
  assert.equal((await guestJoin(input, rig({ signInAnonymously: async () => "captcha" }).deps)).status, 400);
  assert.equal((await guestJoin(input, rig({ signInAnonymously: async () => "limited" }).deps)).status, 429);
  assert.equal((await guestJoin(input, rig({ signInAnonymously: async () => "unavailable" }).deps)).status, 503);
});

test("each refusal says what to do and ends the plan-less session it just minted", async () => {
  for (const [status, http, needsAccount] of [
    ["full", 409, true], ["age_gated", 403, true], ["removed", 403, undefined], ["limited", 429, undefined],
  ] as const) {
    const { deps, calls } = rig({ joins: [status] });
    const r = await guestJoin(input, deps);
    assert.equal(r.status, http, status);
    assert.equal((r.body as { needsAccount?: boolean }).needsAccount, needsAccount, status);
    assert.equal(calls.at(-1), "signOut", status);
  }
});

test("an unknown plan is a 404, not an outage", async () => {
  const { deps } = rig({ join: async () => ({ error: "no-plan" }) });
  assert.equal((await guestJoin(input, deps)).status, 404);
});

test("an existing guest re-enters without minting or a new token", async () => {
  const { deps, calls } = rig({ session: async () => ({ anonymous: true }), joins: ["already"] });
  const r = await guestJoin({ ...input, captchaToken: undefined }, deps);
  assert.equal(r.status, 200);
  assert.deepEqual(calls, ["limit", "join"]);
});

test("a guest of another plan is signed out and starts fresh", async () => {
  const { deps, calls } = rig({ session: async () => ({ anonymous: true }), joins: ["other_plan", "joined"] });
  assert.equal((await guestJoin(input, deps)).status, 200);
  assert.deepEqual(calls, ["limit", "join", "signOut", "mint", "join"]);
});

test("a signed-in account is sent to its account, never made a guest", async () => {
  const { deps, calls } = rig({ session: async () => ({ anonymous: false }) });
  const r = await guestJoin(input, deps);
  assert.equal(r.status, 409);
  assert.deepEqual(calls, []);
});

test("an auth outage is a 503 and mints nothing", async () => {
  const { deps, calls } = rig({ session: async () => "unavailable" });
  assert.equal((await guestJoin(input, deps)).status, 503);
  assert.deepEqual(calls, []);
});
