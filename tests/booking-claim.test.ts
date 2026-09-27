import assert from "node:assert/strict";
import test from "node:test";
import { bookingOutcome } from "../lib/booking-claim.ts";

test("a claim that lands names the claimer and says nothing", () => {
  assert.deepEqual(bookingOutcome("claim", { result: "claimed", booking_owner: "Sara" }), { patch: { booking_owner: "Sara" }, note: null });
});

test("a release that lands clears the name and says nothing", () => {
  assert.deepEqual(bookingOutcome("release", { result: "released" }), { patch: { booking_owner: null }, note: null });
});

test("each refusal says its own reason", () => {
  const taken = bookingOutcome("claim", { result: "taken", booking_owner: "Omar" });
  assert.deepEqual(taken.patch, { booking_owner: "Omar" });
  assert.match(taken.note!.text, /Omar got there first/);

  const booked = bookingOutcome("claim", { result: "booked", booking_owner: "Omar" });
  assert.deepEqual(booked.patch, { booked: true, booking_owner: "Omar" });
  assert.match(booked.note!.text, /booked already/);

  assert.match(bookingOutcome("claim", { result: "not_decided" }).note!.text, /until the group picks/);
  assert.equal(bookingOutcome("claim", { result: "no_profile" }).note!.profileLink, true);
  assert.match(bookingOutcome("release", { result: "not_yours", booking_owner: "Lina" }).note!.text, /Lina is booking it now/);
});

test("a missing or unknown result is a failure, never a silent success", () => {
  for (const data of [null, undefined, "claimed", {}, { result: "surprise" }]) {
    const outcome = bookingOutcome("claim", data);
    assert.equal(outcome.patch, null);
    assert.match(outcome.note!.text, /Couldn’t take the booking/);
  }
  assert.match(bookingOutcome("release", null).note!.text, /Couldn’t hand the booking back/);
});
