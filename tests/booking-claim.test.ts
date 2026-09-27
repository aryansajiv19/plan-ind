import assert from "node:assert/strict";
import test from "node:test";
import { bookingOutcome } from "../lib/booking-claim.ts";

test("a claim that lands applies the booking as the server holds it, and says nothing", () => {
  assert.deepEqual(bookingOutcome("claim", { result: "claimed", booking_owner: "Sara", booked: false }), { patch: { booking_owner: "Sara", booked: false }, note: null });
});

test("a release that lands clears the name and says nothing", () => {
  assert.deepEqual(bookingOutcome("release", { result: "released", booking_owner: null, booked: false }), { patch: { booking_owner: null, booked: false }, note: null });
});

test("marking and unmarking apply booked and say nothing", () => {
  assert.deepEqual(bookingOutcome("mark", { result: "marked", booking_owner: "Sara", booked: true }), { patch: { booking_owner: "Sara", booked: true }, note: null });
  assert.deepEqual(bookingOutcome("unmark", { result: "unmarked", booking_owner: "Sara", booked: false }), { patch: { booking_owner: "Sara", booked: false }, note: null });
});

test("each refusal says its own reason, and still applies the state it carries", () => {
  const taken = bookingOutcome("claim", { result: "taken", booking_owner: "Omar", booked: false });
  assert.deepEqual(taken.patch, { booking_owner: "Omar", booked: false });
  assert.match(taken.note!.text, /Omar got there first/);

  const booked = bookingOutcome("release", { result: "booked", booking_owner: "Omar", booked: true });
  assert.deepEqual(booked.patch, { booking_owner: "Omar", booked: true });
  assert.match(booked.note!.text, /booked already/);

  assert.match(bookingOutcome("mark", { result: "not_holder", booking_owner: "Omar", booked: false }).note!.text, /Only whoever’s booking it/);
  assert.match(bookingOutcome("claim", { result: "not_decided", booking_owner: null, booked: false }).note!.text, /until the group picks/);
  assert.equal(bookingOutcome("claim", { result: "no_profile", booking_owner: null, booked: false }).note!.profileLink, true);
  assert.match(bookingOutcome("release", { result: "not_yours", booking_owner: "Lina", booked: false }).note!.text, /Lina is booking it now/);
});

test("an outsider's answer carries no state to apply", () => {
  for (const result of ["not_member", "not_found"]) assert.equal(bookingOutcome("claim", { result }).patch, null);
});

test("a missing or unknown result is a failure, never a silent success", () => {
  for (const data of [null, undefined, "claimed", {}, { result: "surprise" }, { result: "invalid", booking_owner: null, booked: false }]) {
    const outcome = bookingOutcome("claim", data);
    assert.equal(outcome.patch, null);
    assert.match(outcome.note!.text, /Couldn’t take the booking/);
  }
  assert.match(bookingOutcome("mark", null).note!.text, /Couldn’t mark it booked/);
});

test("a stale screen is told to re-read the plan; a normal answer is not", () => {
  for (const result of ["not_decided", "not_member", "not_found"]) assert.equal(bookingOutcome("claim", { result, booking_owner: null, booked: false }).resync, true, result);
  for (const result of ["claimed", "taken", "booked", "no_profile"]) assert.equal(bookingOutcome("claim", { result, booking_owner: "Sara", booked: false }).resync, undefined, result);
});
