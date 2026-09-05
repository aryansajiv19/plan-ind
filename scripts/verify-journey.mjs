// One continuous real-user journey against the LOCAL stack, asserted in the
// database at every hop.
//
// Everything else in this repo is tested feature-by-feature. This walks a
// single fresh account through the whole arc -- sign up, profile, age, deal,
// create (both paths), share, a second identity joining, voting, advancing,
// deciding, the last mile, RSVP, rating, logging the visit, Been, and
// collections -- and checks the real rows after each step rather than
// trusting that a 200 meant something happened.
//
// It watches the SEAMS more than the features: stage/status transitions,
// plan_access grants, whether one participant identity carries across
// vote -> RSVP -> rating, and whether a decided plan actually holds
// everything the payoff screen claims to render.
//
// Loopback-guarded: this mints users and writes rows, so it must never be
// pointable at the live project.
//
// Usage (app must be built and running on :3010 against the local stack --
// see scripts/load/README.md, including the app_control_secrets step):
//   node scripts/verify-journey.mjs

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const LOCAL_URL = "http://127.0.0.1:54321";
const APP_URL = process.env.LOAD_APP_URL ?? "http://localhost:3010";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
for (const url of [LOCAL_URL, APP_URL]) {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(`Refusing to run: ${url} is not loopback.`);
  }
}

const admin = createClient(LOCAL_URL, SERVICE_KEY, { auth: { persistSession: false } });
const sha256hex = (s) => createHash("sha256").update(s).digest("hex");

// ── assertions ────────────────────────────────────────────────────────────
// Collect rather than throw: one broken hop shouldn't hide the state of
// every hop after it, which is the whole point of walking the arc.
const results = [];
let currentStep = "(setup)";
const step = (name) => { currentStep = name; console.log(`\n── ${name}`); };
function check(label, pass, detail = "") {
  results.push({ step: currentStep, label, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  -- ${detail}` : ""}`);
  return pass;
}
const eq = (label, actual, expected) =>
  check(label, actual === expected, actual === expected ? "" : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

// ── identities ────────────────────────────────────────────────────────────
async function signUp(tag) {
  const email = `journey-${tag}-${Date.now()}-${randomBytes(3).toString("hex")}@example.test`;
  const password = randomBytes(16).toString("hex");
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);

  const client = createClient(LOCAL_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn(${tag}): ${signInError.message}`);

  // The app's API routes read auth from @supabase/ssr cookies, not a bearer
  // header. Reuse the real library to serialize them (same approach as
  // mint-local-users.mjs) rather than hand-rolling its cookie format.
  const jar = {};
  const cookieClient = createServerClient(LOCAL_URL, ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (toSet) => { for (const { name, value } of toSet) jar[name] = value; },
    },
  });
  await cookieClient.auth.setSession({
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
  });

  return {
    tag,
    email,
    userId: created.user.id,
    client, // signed in as this user -- RLS applies exactly as it would in the browser
    cookieHeader: Object.entries(jar).map(([n, v]) => `${n}=${v}`).join("; "),
    participantTokenHash: sha256hex(`journey-${created.user.id}`),
    voterName: tag === "host" ? "Host" : "Friend",
  };
}

async function api(path, identity, body) {
  const csrf = randomUUID();
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: APP_URL,
      "sec-fetch-site": "same-origin",
      cookie: `__Host-csrf=${csrf}; ${identity.cookieHeader}`,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ── the journey ───────────────────────────────────────────────────────────
step("1. Sign up");
const host = await signUp("host");
const friend = await signUp("friend");
const stranger = await signUp("stranger"); // never invited -- the negative control
check("host account exists in auth", Boolean(host.userId));
check("second identity exists in auth", Boolean(friend.userId));

step("2. Onboarding -- profile row");
for (const who of [host, friend, stranger]) {
  const { error } = await who.client.rpc("ensure_authenticated_profile", {
    p_display_name: `Journey ${who.tag}`, p_emoji: "🙂", p_color: "#8b5cf6",
  });
  check(`${who.tag}: ensure_authenticated_profile succeeds`, !error, error?.message);
}
const { data: hostPerson } = await admin.from("people").select("id, display_name, auth_user_id").eq("auth_user_id", host.userId).maybeSingle();
check("people row created and bound to the auth user", hostPerson?.auth_user_id === host.userId);
eq("people.id equals the auth uid (identity is one id, not two)", hostPerson?.id, host.userId);

step("3. Age -- server-owned, not self-declared");
const birthDate = "1998-04-12";
const { error: ageError } = await host.client.rpc("set_birth_date", { p_date_of_birth: birthDate });
check("set_birth_date succeeds", !ageError, ageError?.message);
await friend.client.rpc("set_birth_date", { p_date_of_birth: birthDate });
const { data: ageRow } = await admin.from("member_ages").select("*").eq("user_id", host.userId).maybeSingle();
check("member_ages row written server-side", Boolean(ageRow));
const { data: reportedAge } = await host.client.rpc("current_member_age");
const expectedAge = Math.floor((Date.now() - Date.parse(birthDate)) / (365.2425 * 24 * 3600 * 1000));
check("current_member_age() matches the birth date", Math.abs(Number(reportedAge) - expectedAge) <= 1, `rpc ${reportedAge}, expected ~${expectedAge}`);

step("4. Deal nine places");
const dealt = await api("/api/spots/deal", host, { category: "dinner", count: 9 });
eq("deal returns 200", dealt.status, 200);
const spotIds = dealt.body?.ids ?? [];
eq("deal returns nine ids", spotIds.length, 9);
check("dealt ids are unique", new Set(spotIds).size === spotIds.length);

step("5. Create the plan (voting path)");
const created = await api("/api/plans", host, {
  title: "Journey night out",
  category: "dinner",
  spotIds,
  deadline: new Date(Date.now() + 86_400_000).toISOString(),
});
eq("create returns 200", created.status, 200);
const planId = created.body?.id;
const hostToken = created.body?.hostToken;
check("plan id returned", Boolean(planId));
check("host token returned, 64 hex", /^[0-9a-f]{64}$/.test(hostToken ?? ""));

const planRow = async () => (await admin.from("plans").select("*").eq("id", planId).maybeSingle()).data;
let plan = await planRow();
eq("plan.status starts open", plan?.status, "open");
eq("plan.stage starts pool", plan?.stage, "pool");
eq("plan.pool_count is 3", plan?.pool_count, 3);
eq("plan.created_by_user_id is the host", plan?.created_by_user_id, host.userId);

const { data: planSpots } = await admin.from("plan_spots").select("*").eq("plan_id", planId);
eq("nine plan_spots written", planSpots?.length, 9);
const pools = [1, 2, 3].map((p) => planSpots.filter((s) => s.pool_number === p).length);
check("spots split evenly across three pools", pools.every((c) => c === 3), `pools ${pools.join("/")}`);
check("no spot starts advanced", planSpots.every((s) => s.advanced === false));
const { data: hostTokenRow } = await admin.from("plan_host_tokens").select("token_hash").eq("plan_id", planId).maybeSingle();
eq("host token stored as a hash, never plaintext", hostTokenRow?.token_hash, sha256hex(hostToken));
const { data: hostAccess } = await admin.from("plan_access").select("*").eq("plan_id", planId).eq("user_id", host.userId).maybeSingle();
check("host is granted plan_access at creation", Boolean(hostAccess));

step("6. Share the link -- a second identity joins");
const { error: claimError } = await friend.client.rpc("claim_plan_access", { p_plan_id: planId });
check("friend claims access via the share link", !claimError, claimError?.message);
const { data: friendAccess } = await admin.from("plan_access").select("*").eq("plan_id", planId).eq("user_id", friend.userId).maybeSingle();
check("plan_access row written for the friend", Boolean(friendAccess));

const { data: friendSeesPlan } = await friend.client.from("plans").select("id, title").eq("id", planId).maybeSingle();
check("friend can now read the plan", friendSeesPlan?.id === planId);
const { data: strangerSeesPlan } = await stranger.client.from("plans").select("id").eq("id", planId).maybeSingle();
check("uninvited stranger cannot read the plan (RLS holds)", !strangerSeesPlan, strangerSeesPlan ? "stranger READ the plan" : "");
const { data: strangerSpots } = await stranger.client.from("plan_spots").select("id").eq("plan_id", planId);
eq("uninvited stranger sees no plan_spots", strangerSpots?.length ?? 0, 0);

step("7. Everyone votes (pool round)");
// The model is one selection per (participant, round), not a yes/no on every
// card: cast_plan_vote upserts on (plan, participant, phase, pool_number),
// and a `false` value DELETES that participant's pick for the round rather
// than recording a "no". So each voter votes once per pool.
const poolPick = {}; // pool_number -> spot both vote yes on
for (const poolNumber of [1, 2, 3]) {
  const inPool = planSpots.filter((s) => s.pool_number === poolNumber);
  poolPick[poolNumber] = inPool[0].spot_id;
  for (const who of [host, friend]) {
    const { error } = await who.client.rpc("cast_plan_vote", {
      p_plan_id: planId,
      p_spot_id: poolPick[poolNumber],
      p_voter_name: who.voterName,
      p_value: true,
      p_phase: "pool",
      p_pool_number: poolNumber,
      p_participant_token_hash: who.participantTokenHash,
    });
    if (error) check(`${who.tag} votes in pool ${poolNumber}`, false, error.message);
  }
}
const { data: poolVotes } = await admin.from("votes").select("*").eq("plan_id", planId).eq("phase", "pool");
eq("one pool vote per voter per round (2 voters x 3 rounds)", poolVotes?.length, 6);
check("votes land on the intended picks", poolVotes.every((v) => poolPick[v.pool_number] === v.spot_id));

// Changing your mind replaces your pick rather than adding a second row.
const swapTo = planSpots.find((s) => s.pool_number === 1 && s.spot_id !== poolPick[1]).spot_id;
await friend.client.rpc("cast_plan_vote", {
  p_plan_id: planId, p_spot_id: swapTo, p_voter_name: friend.voterName, p_value: true,
  p_phase: "pool", p_pool_number: 1, p_participant_token_hash: friend.participantTokenHash,
});
const { data: afterSwap } = await admin.from("votes").select("*").eq("plan_id", planId)
  .eq("phase", "pool").eq("participant_token_hash", friend.participantTokenHash);
eq("re-voting replaces the pick, never adds a row", afterSwap?.length, 3);
eq("the replaced pick is the new spot", afterSwap.find((v) => v.pool_number === 1)?.spot_id, swapTo);
// Put it back so the pool-1 winner stays deterministic for the steps below.
await friend.client.rpc("cast_plan_vote", {
  p_plan_id: planId, p_spot_id: poolPick[1], p_voter_name: friend.voterName, p_value: true,
  p_phase: "pool", p_pool_number: 1, p_participant_token_hash: friend.participantTokenHash,
});

const { error: strangerVote } = await stranger.client.rpc("cast_plan_vote", {
  p_plan_id: planId, p_spot_id: planSpots[0].spot_id, p_voter_name: "Stranger",
  p_value: true, p_phase: "pool", p_pool_number: planSpots[0].pool_number,
  p_participant_token_hash: stranger.participantTokenHash,
});
check("uninvited stranger cannot vote", Boolean(strangerVote), strangerVote ? `blocked: ${strangerVote.code}` : "STRANGER VOTED");

step("8. Host advances to the final round");
const advanced = await api(`/api/plans/${planId}/command`, host, { hostToken, command: "advance" });
eq("advance returns 200", advanced.status, 200);
plan = await planRow();
eq("plan.stage moves to final", plan?.stage, "final");
eq("plan.status still open", plan?.status, "open");
const { data: afterAdvance } = await admin.from("plan_spots").select("*").eq("plan_id", planId);
const finalists = afterAdvance.filter((s) => s.advanced);
eq("exactly three finalists advanced", finalists.length, 3);
check("the advanced spots are the ones that won their pool", finalists.every((s) => poolPick[s.pool_number] === s.spot_id));

step("9. The final vote");
const winnerTarget = finalists[0].spot_id;
for (const who of [host, friend]) {
  const { error } = await who.client.rpc("cast_plan_vote", {
    p_plan_id: planId, p_spot_id: winnerTarget, p_voter_name: who.voterName,
    p_value: true, p_phase: "final", p_pool_number: 0,
    p_participant_token_hash: who.participantTokenHash,
  });
  if (error) check(`${who.tag} votes in the final`, false, error.message);
}
const { data: finalVotes } = await admin.from("votes").select("*").eq("plan_id", planId).eq("phase", "final");
eq("one final vote per voter", finalVotes?.length, 2);

// The pool round is closed now that the stage moved on.
const { error: latePoolVote } = await host.client.rpc("cast_plan_vote", {
  p_plan_id: planId, p_spot_id: poolPick[1], p_voter_name: host.voterName, p_value: true,
  p_phase: "pool", p_pool_number: 1, p_participant_token_hash: host.participantTokenHash,
});
check("a pool vote is rejected once the final round is open", Boolean(latePoolVote),
  latePoolVote ? "" : "LATE POOL VOTE ACCEPTED");

step("10. Decide");
const decided = await api(`/api/plans/${planId}/command`, host, { hostToken, command: "decide" });
eq("decide returns 200", decided.status, 200);
plan = await planRow();
eq("plan.status becomes decided", plan?.status, "decided");
eq("plan.stage becomes decided", plan?.stage, "decided");
eq("the winner is the spot the group actually voted for", plan?.winner_spot_id, winnerTarget);
check("winner is one of the finalists", finalists.some((s) => s.spot_id === plan?.winner_spot_id));

step("11. The last mile -- a decision becomes a committed event");
const eventTime = new Date(Date.now() + 172_800_000).toISOString();
const patched = await api(`/api/plans/${planId}/command`, host, {
  hostToken, command: "patch",
  patch: { event_time: eventTime, booking_owner: host.voterName, booked: true },
});
eq("patch returns 200", patched.status, 200);
plan = await planRow();
check("event_time persisted", Boolean(plan?.event_time));
eq("booking_owner persisted", plan?.booking_owner, host.voterName);
eq("booked persisted", plan?.booked, true);

step("12. RSVP, with carpool fields (migration 035)");
for (const [who, transport, seats] of [[host, "driving", 3], [friend, "need_ride", null]]) {
  const { error } = await who.client.rpc("set_plan_rsvp", {
    p_plan_id: planId, p_voter_name: who.voterName, p_coming: true, p_choice: "coming",
    p_participant_token_hash: who.participantTokenHash,
    p_transport: transport, p_seats_available: seats,
  });
  check(`${who.tag} RSVPs (${transport})`, !error, error?.message);
}
const { data: rsvps } = await admin.from("rsvps").select("*").eq("plan_id", planId);
eq("both RSVPs recorded", rsvps?.length, 2);
const driver = rsvps.find((r) => r.transport === "driving");
eq("driver's seats_available persisted", driver?.seats_available, 3);
check("a rider is recorded needing a ride", rsvps.some((r) => r.transport === "need_ride"));

// The seats/transport pairing is enforced server-side, not just in the UI.
const { error: seatsWithoutCar } = await friend.client.rpc("set_plan_rsvp", {
  p_plan_id: planId, p_voter_name: friend.voterName, p_coming: true, p_choice: "coming",
  p_participant_token_hash: friend.participantTokenHash,
  p_transport: "need_ride", p_seats_available: 4,
});
check("offering seats without driving is rejected", Boolean(seatsWithoutCar));

// FINDING (see worklog): the p_choice guard is `p_choice not in (...)`, which
// is NULL -- not TRUE -- when p_choice is NULL, so a null choice slips past
// the intended 42501 and dies on the column's NOT NULL instead. Migration
// 035's newer p_transport guard gets this right (`is not null and ... not
// in`); this older line never got the same treatment.
const { error: nullChoice } = await host.client.rpc("set_plan_rsvp", {
  p_plan_id: planId, p_voter_name: host.voterName, p_coming: true, p_choice: null,
  p_participant_token_hash: host.participantTokenHash, p_transport: null, p_seats_available: null,
});
check("a null choice is rejected by the RPC's own guard, not by a raw constraint error",
  nullChoice?.code === "42501",
  nullChoice ? `got ${nullChoice.code}: ${nullChoice.message}` : "null choice ACCEPTED");

step("13. Rate it");
const { error: rateError } = await host.client.rpc("rate_plan", {
  p_plan_id: planId, p_spot_id: plan.winner_spot_id, p_voter_name: host.voterName,
  p_stars: 5, p_again: true, p_participant_token_hash: host.participantTokenHash,
});
check("rate_plan succeeds", !rateError, rateError?.message);
const { data: ratingRows } = await admin.from("ratings").select("*").eq("plan_id", planId);
eq("rating recorded", ratingRows?.length, 1);
eq("rating is against the winning spot", ratingRows?.[0]?.spot_id, plan.winner_spot_id);

step("14. Identity carries across the arc (the seam, not the feature)");
const hostVote = poolVotes.find((v) => v.participant_token_hash === host.participantTokenHash);
const hostRsvp = rsvps.find((r) => r.participant_token_hash === host.participantTokenHash);
const hostRating = ratingRows?.find((r) => r.participant_token_hash === host.participantTokenHash);
check("one participant token identifies the host across vote, RSVP and rating",
  Boolean(hostVote && hostRsvp && hostRating));
check("voter_name is stable across all three", hostVote?.voter_name === hostRsvp?.voter_name && hostRsvp?.voter_name === hostRating?.voter_name,
  `${hostVote?.voter_name}/${hostRsvp?.voter_name}/${hostRating?.voter_name}`);

step("15. Log the visit (delete-then-insert, per lib/social.ts)");
await host.client.from("visits").delete().eq("person_id", host.userId).eq("plan_id", planId);
const { data: visit, error: visitError } = await host.client.from("visits")
  .insert({ person_id: host.userId, spot_id: plan.winner_spot_id, plan_id: planId, group_label: "Journey crew", note: "End-to-end run" })
  .select("id").maybeSingle();
check("visit logged", !visitError && Boolean(visit?.id), visitError?.message);

step("16. It shows up in Been");
const { data: been } = await host.client.from("visits").select("id, spot_id, plan_id").eq("person_id", host.userId);
check("the visit appears in the profile's visit list", been?.some((v) => v.plan_id === planId && v.spot_id === plan.winner_spot_id));
eq("exactly one visit for this plan (no duplicate from the re-log path)", been?.filter((v) => v.plan_id === planId).length, 1);

step("17. Add it to a collection");
const { data: collection, error: collectionError } = await host.client.from("visit_collections")
  .insert({ person_id: host.userId, name: `Journey ${randomBytes(3).toString("hex")}` })
  .select("id").maybeSingle();
check("collection created", !collectionError && Boolean(collection?.id), collectionError?.message);
const { error: itemError } = await host.client.from("visit_collection_items")
  .insert({ collection_id: collection?.id, visit_id: visit?.id });
check("visit added to the collection", !itemError, itemError?.message);
const { data: items } = await admin.from("visit_collection_items").select("*").eq("collection_id", collection?.id);
eq("collection holds exactly the one visit", items?.length, 1);

step("18. Direct plan -- the skip-the-vote path (migration 034)");
const directCreated = await api("/api/plans/direct", host, { title: "Journey direct", spotId: spotIds[0] });
eq("direct create returns 200", directCreated.status, 200);
const directId = directCreated.body?.id;
const { data: directPlan } = await admin.from("plans").select("*").eq("id", directId).maybeSingle();
eq("a direct plan is decided immediately", directPlan?.status, "decided");
eq("its stage is decided too", directPlan?.stage, "decided");
eq("the chosen spot is the winner", directPlan?.winner_spot_id, spotIds[0]);
const { data: directSpots } = await admin.from("plan_spots").select("*").eq("plan_id", directId);
eq("a direct plan has exactly one plan_spot", directSpots?.length, 1);
check("that spot is marked advanced", directSpots?.[0]?.advanced === true);
const { data: directAccess } = await admin.from("plan_access").select("*").eq("plan_id", directId).eq("user_id", host.userId).maybeSingle();
check("host granted access on the direct plan too", Boolean(directAccess));

step("19. Is the decided plan complete enough for the payoff screen?");
// DecidedPlan renders the winning spot's name/area/price, a Maps link from
// its coordinates, and the plan's own event/booking/transport state. If any
// of that is missing the screen renders a hole, so check the data, not the UI.
const { data: winnerSpot } = await host.client.from("spots")
  .select("id, name, area, category, price_band, latitude, longitude, photo_url, booking_url")
  .eq("id", plan.winner_spot_id).maybeSingle();
check("the host can read the winning spot", Boolean(winnerSpot));
check("winner has a name", Boolean(winnerSpot?.name));
check("winner has an area", Boolean(winnerSpot?.area));
check("winner has coordinates (the 'getting there' line needs these)",
  winnerSpot?.latitude != null && winnerSpot?.longitude != null,
  winnerSpot?.latitude == null ? "null lat/long -- distance + Maps link cannot render" : "");
check("plan carries the committed event details", Boolean(plan?.event_time && plan?.booking_owner));
check("transport is answerable from the RSVP rows", rsvps.some((r) => r.transport));

// ── summary ───────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(68)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed across ${new Set(results.map((r) => r.step)).size} steps.`);
if (failed.length) {
  console.log(`\n${failed.length} FAILED:`);
  for (const f of failed) console.log(`  [${f.step}] ${f.label}`);
}
console.log(`\nplan ${planId}\ndirect plan ${directId}\nhost ${host.email}`);
process.exit(failed.length ? 1 : 0);
