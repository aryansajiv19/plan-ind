import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_TAKEN_NOTICE, participantFailure } from "@/lib/participant-errors";

const fallback = "That vote didn't save. Check your connection and tap again.";

test("a closed plan says so instead of blaming the connection", () => {
  assert.deepEqual(participantFailure({ code: "22023", message: "Voting on this plan has closed" }, fallback), {
    notice: "Voting on this plan has closed",
    nameTaken: false,
  });
});

test("a name clash asks for another name", () => {
  assert.deepEqual(
    participantFailure({ code: "42501", message: "That participant name is already in use" }, fallback),
    { notice: NAME_TAKEN_NOTICE, nameTaken: true },
  );
});

test("authorization and unknown failures keep the fallback", () => {
  assert.equal(participantFailure({ code: "42501", message: "Participant authorization required" }, fallback).notice, fallback);
  assert.equal(participantFailure({ code: "PGRST301", message: "JWT expired" }, fallback).notice, fallback);
  assert.equal(participantFailure(null, fallback).notice, fallback);
});

test("a guest refusal says to sign in", () => {
  assert.equal(participantFailure({ code: "42501", message: "Sign in to vote on this plan" }, fallback).notice, "Sign in to vote on this plan");
});
