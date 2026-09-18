# Deal three worklog

Last updated: 2026-09-18 (Asia/Dubai). Entries from 2026-09-07 and earlier are in `worklog-archive.md`.

## Migration runbook

The single source of truth for what is applied where. Update the status column
the same day you run something — prose scattered through checkpoints stopped
being trustworthy at 014.

Apply in order. Every migration is additive and re-run safe unless noted.

| # | File | Applied to live project |
|---|------|-------------------------|
| 002 | `migration-002-lastmile-categories.sql` | yes |
| 003 | `migration-003-ratings.sql` | yes |
| 004 | `migration-004-swap.sql` | yes |
| 005 | `migration-005-social.sql` | yes |
| 006 | `migration-006-social-hardening.sql` | yes |
| 007 | `migration-007-auth.sql` | yes |
| 008 | `migration-008-expanded-dubai-categories.sql` | yes |
| 009 | `migration-009-pools-custom-spots.sql` | yes — verified live 2026-08-10 |
| 010 | `migration-010-recommendations-collections.sql` | yes |
| 011 | `migration-011-smart-search.sql` | yes |
| 012 | `migration-012-place-link-imports.sql` | yes |
| 013 | `migration-013-age-safe-venues.sql` | yes — 2026-08-09 |
| 014 | `migration-014-secure-plan-creation.sql` | yes — 2026-08-09 |
| 015 | `migration-015-host-plan-commands.sql` | yes — verified live 2026-08-10 |
| 016 | `migration-016-rsvp-choices.sql` | yes — verified live 2026-08-10 |
| 017 | `migration-017-participant-token-seam.sql` | yes — verified live 2026-08-10 |
| 018 | `migration-018-participant-write-rpcs.sql` | yes — verified live 2026-08-10 |
| 019 | `migration-019-secret-isolation-and-rpc-integrity.sql` | yes — verified live 2026-08-10 |
| 020 | `migration-020-production-security.sql` | **yes — applied and verified live 2026-08-24** |
| 021 | `migration-021-revoke-anon-execute.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0).** anon EXECUTE confirmed absent on the five gated functions; kept on `record_security_event`. |
| 022 | `migration-022-spot-deal-quota-and-guest-realtime.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0).** `spot-deal` scope (30/min, 300/day) + `plan_spots` in `supabase_realtime`, both verified. |
| 023 | `migration-023-vote-idempotency.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0)** in corrected form (`drop function` before `create` — the committed file was fixed to match in `67a0ccf`). `votes_participant_round_key` unique index live, `cast_plan_vote` returns jsonb, no vote rows deleted. |
| 024 | `migration-024-revoke-anon-execute-sec4.sql` | **yes — applied live 2026-09-01 via Supabase MCP (T0), owner-approved.** Verified: anon EXECUTE now absent on all 7; `authenticated` kept on the 3 RPCs, dropped on the 4 internal fns; `set_birth_date` body carries the `is_permanent_user()` guard. Post-apply advisor: `anon_security_definer_function_executable` down to `record_security_event` only (intentional). |
| 025 | `migration-025-rsvp-rating-upsert-race.sql` | yes — applied live (see 2026-09-02 Security entries below). |
| 026 | `migration-026-otp-rate-limit.sql` | **yes — but this row was WRONG until 2026-09-07.** It claimed applied; `consume_otp_limit` did not exist live (confirmed by catalog query, not inference). Consequence: `consumeOtpLimit` failed closed and the PGRST202 fallback only returns true when `NODE_ENV !== "production"`, so **both** `requestEmailCode` and `verifyEmailCode` refused before ever reaching GoTrue on a production deploy. That is why the project has 62 anonymous users and zero permanent accounts ever — sign-up was structurally impossible, not unpopular. Applied and verified by T0 on 2026-09-07. A ledger that is trusted and wrong is worse than no ledger: verify against the catalog, not against this table. |
| 027 | `migration-027-spots-name-index.sql` | yes — applied live. |
| 028 | `migration-028-friendships-rls-recursion.sql` | yes — applied live. |
| 029 | `migration-029-rls-auto-enable-capture.sql` | yes — applied live. |
| 030 | `migration-030-plan-command-quota.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `plan-command` scope present, 20/min·100/day, `anon` cannot execute `consume_app_quota`, `authenticated` can. |
| 031 | `migration-031-schedule-purge-cron.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `pg_cron` installed, `purge-security-operational-data` job scheduled at `17 2 * * *`. |
| 032 | `migration-032-fix-votes-legacy-index-drop.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `votes_round_choice_unique` confirmed gone from `pg_indexes`; `votes_participant_round_key` confirmed present. Live correctness bug closed. |
| 033 | `migration-033-fix-create-secure-plan-category-check.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved. CRITICAL.** Fixes `create_secure_plan`'s exact-category-match check, which blocked every real plan creation since migration 020 (2026-08-24) — confirmed live: 0 successful creations through the app in 11 days. Verified via full function definition (not a text-match guess, see the 2026-09-04 note above about a false-positive `LIKE` check against the migration's own comment): the category-equality clause is gone, the per-spot age gate (keyed on each spot's own category) and the ownership/sourcing clause are unchanged, grants correct. |
| 034 | `migration-034-create-direct-plan.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** New `create_direct_plan(jsonb, uuid)` RPC for the "skip the vote" flow — one spot, immediately `decided`, category derived from the spot itself (not client input, same lesson as 033). Verified: function exists, returns `jsonb`, `anon` blocked, `authenticated` allowed. |
| 027 | `migration-027-spots-name-index.sql` | **NO — corrected 2026-09-16.** Earlier ledger/prose said applied; live catalog probe: `spots_name_idx` absent. Deferred (not superseded by 040's trigram index; see runbook). |
| 028 | `migration-028-friendships-rls-recursion.sql` | **Was NOT live (ledger said yes); applied live 2026-09-16 19:23:38Z via Supabase MCP (T1), owner-approved.** Before it, every friendship write failed with 42P17. Verified: both write policies in 028 form. |
| 039 | `migration-039-first-curated-photos.sql` | **YES — corrected 2026-09-16.** Recorded as held; live has all 6 `photo_url`s and all 6 files in `spot-photos` (sample served 200 image/jpeg). |
| 047 | `migration-047-delete-plan.sql` | **yes — applied live 2026-09-16 19:24:05Z via Supabase MCP (T1), owner-approved.** Verified: exists, anon cannot execute, authenticated can. |
| 048 | `migration-048-friendship-consent.sql` | **yes — applied live 2026-09-16 19:24:48Z via Supabase MCP (T1), owner-approved, after 028.** Verified: insert policy gone, authenticated table INSERT revoked, live PostgREST insert → 42501, 3 invite RPCs anon-refused, `friend_invites` RLS on with 0 policies. |
| 050 | `migration-050-owner-reads-without-uid.sql` | **yes — applied live 2026-09-16 19:25:37Z via Supabase MCP (T1), owner-approved.** Verified: both RPCs exist (anon refused), `execute_plan_command` return drops uid, old client's signed-out reads 200 with data, plans/spots/votes/rsvps/ratings read policies unchanged. |
| 046 | — (not written yet) | **NOT written.** Blocked on the owner uploading the 13 approved files to `spot-photos` (bucket writes are refused for every client role by design). Write it against the **keys that land**, not the filenames sent — live strips hyphens. Gate with `scripts/check-spot-photo-urls.sh` before applying. |
| 052 | `migration-052-been-edits-and-unrate.sql` | **yes — applied live 2026-09-18, owner-approved.** `clean_display_name()` present (one sanitiser shared by the trigger and the CHECK), `edit own visits` column-scoped UPDATE policy, `unrate_plan(uuid)` present. |
| 053 | — | **Closed without a migration, 2026-09-18.** The 45 pre-043 rows it was written to guard (25 votes, 17 RSVPs, 3 ratings, all `user_id is null`, all on the 6 fixture plans) were deleted with owner approval instead. Re-verified 2026-09-18: 0 / 0 / 0, plans 6 and spots 82 untouched. What survives of 053 is only the `for key share` race fix — correctness, queued, not a blocker. |
| 054 | `migration-054-invite-trust-and-cap-lock.sql` | **yes — applied live 2026-09-18, owner-approved.** `preview_friend_invite` present. |
| 055 | `migration-055-edit-plan.sql` | **yes — applied live 2026-09-18, owner-approved.** `edit_plan` present. |
| 056 | `migration-056-leave-plan.sql` | **yes — applied live 2026-09-18, owner-approved.** `leave_plan` present. |
| 057 | `migration-057-reopen-plan.sql` | **yes — applied live 2026-09-18, owner-approved.** `reopen_plan` present, `plans.reopened_at` present. |
| 058 | `migration-058-plan-creation-invisible-titles.sql` | **NOT applied — deliberately deferred (LOW).** It rewrites `create_secure_plan` / `create_direct_plan` wholesale for a cosmetic title check. Retyping the app's two most important functions by hand on deploy day was not worth zero behaviour change. **Apply from the file, never retyped**, by a backend session. |
| 059 | `migration-059-birth-date-correction-and-age-gates.sql` | **feature half applied live 2026-09-18, owner-approved.** `correct_birth_date` present, `member_ages.corrected_at` present. The `category_min_age` / `spot_required_age` consolidation inside the two creation functions was **skipped** — behaviour-identical today, and it carries the same retype risk as 058. |
| 060 | `migration-060-delete-my-account.sql` | **yes — applied live 2026-09-18, owner-approved.** `delete_my_account` present. Two controls it must never lose: the privilege probe runs **inside a rollback before any photo is touched** (`auth.users` has RLS with no policies, so a privilege failure deletes 0 rows *without raising*, and the original order would have destroyed the photos and reported success), and the probe raises a private `PT060` rather than `P0001`, which an ordinary trigger also raises. |
| 049 / 051 | `migration-049-hide-voter-user-id.sql`, `migration-051-hide-creator-user-id.sql` | **NOT applied — next in the queue, and now unblocked.** They were gated on the client deploy, which happened 2026-09-18. Verified still pending: `authenticated` can still SELECT `votes.user_id`. Needs the owner's approval like every migration. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

`worklog-archive.md` holds everything through **2026-09-16**: the v1 build-out,
production hardening, the migration-020 security pass, the palette reset, the
2026-09-04 load-testing and venue-link work, and T1's whole 2026-09-16 staging
run (047–051, the apply runbook, the live-preflight ledger correction). It is
history, not live state — read it only when chasing *why* something was built
the way it was.

Live state starts below at 2026-09-17. Split again past ~600 lines
(`CONTEXT_HYGIENE.md` rule 3).

## 2026-09-17 — T1: C5 edit a plan before voting, migration 055 STAGED + route `edit` command

`edit_plan(p_plan_id, p_host_token, p_title?, p_deadline?)` → result codes
`edited | nothing_to_change | not_found | not_host | voting_started |
invalid_title | invalid_deadline`. Auth = delete_plan's (creator AND host token,
not anonymous, `for update`). Voting started = status not open OR stage not pool
OR any vote. Title/deadline validated exactly like creation. A new RPC, not an
`execute_plan_command` branch (that one raises instead of returning codes, and it
is the core voting function). Accepted race (a first vote landing after the
no-votes check) is documented in the header.

Route: `POST /api/plans/[id]/command {command:"edit", hostToken, title?, deadline?}`.
delete and edit share one result-code branch; `nothing_to_change` → 200,
404/403/409/422 for refusals, 500 on error or unknown. Deadline must be a strict
ISO-8601 instant with `Z` or `±HH:MM` (review L1: `Date.parse` accepted "2026"
and "UTC+4", which Postgres rejects or reads 8h apart).

Verified 23/23 on the live-identical rig + 052 + 054 via PostgREST (negative
control, every refusal including a member holding the host token, the
voting-started states, validation, grants, re-run). `security` review: no C/H/M,
delete's behaviour unchanged by the refactor. Not exercised through a running
Next server. Frontend note (review L2): the edit response has no `plan` key, so
it must not go through `runHostCommand`, which treats a missing plan as failure.

---

## 2026-09-17 — T1: C6 leave a plan, migration 056 STAGED; lock proposal corrected

`leave_plan(p_plan_id)` → `left | not_member | host_cannot_leave | not_found`.
Host refused (deletes instead). Open plan: the leaver's votes, RSVP, access go
(tally drop intended). Decided plan: votes kept (the tally never contradicts the
winner); RSVP, rating, access go. Rejoin via the same link starts fresh. Guests
can leave. `for update` on the plans row serialises with advance/decide.

Verified 21/21 on the live-identical rig + 052/054/055 via PostgREST, including a
deterministic reproduction of the leaver's-own-vote race: with leave holding the
plans lock, the vote passes the membership trigger, waits at its FK, and commits
after the leave → **1 counted vote from a non-member**. Accepted and documented
(self-inflicted, bounded). `security` review: no C/H.

**Correction to my own proposal:** I proposed closing the race with the
membership trigger taking the plans key-share lock (it worked on the rig for the
INSERT race). The review showed it **deadlocks on the upsert/update path** (child
row locked first, then plans) against `delete_plan`/`leave_plan` (plans first,
then child rows). The right fix is `for key share` on the plans read that
`cast_plan_vote`/`set_plan_rsvp`/`rate_plan` already do (plans always locked
first). It also closes a pre-existing race where a vote passes the stage check
just before advance/decide. **Folded into the 053 scope** (same three functions).
Needs a rig check of a concurrent re-cast vs delete_plan/leave_plan.

Open product call: after a leave, `plans.booking_owner` may still name the
leaver, and a driver's seats vanish from the carpool list.
- 056 amended before apply (T0): leaving clears `booking_owner` when it matches the
  leaver's RSVP name AND `booked` is not true; a real booking keeps its owner.
  Rig 24/24 (unbooked cleared, booked kept, non-owner untouched). Review Low
  accepted: name-match squat can blank an unbooked booker's name (visible, host
  can re-set, never touches a booking).

---

## 2026-09-17 — T1: C7 reopen a decided plan, migration 057 STAGED + route `reopen`

`reopen_plan(p_plan_id, p_host_token, p_deadline?)` → `reopened | not_found |
not_host | not_decided | no_rounds | booked | already_happened |
invalid_deadline`. Creator AND host token. Back to the FINAL round (status open,
stage final, winner null); finalists, final votes, RSVPs/carpool, booking_owner,
event_time kept. Deadline cleared unless a new valid one is given (a past
deadline would auto-re-decide). Refused when booked, when any rating or logged
visit points at the plan, or when fewer than 2 finalists are advanced. Audit row
on success. Route: `command: "reopen"`.

Security review found a real **Medium**: someone who left a decided plan keeps
their final vote (056 keeps votes on decided plans), so after a reopen that vote
would still help pick the new winner. **Fixed:** reopen removes final votes whose
voter has no plan_access (legacy null-user votes stay). Also adopted: visits
block reopen like ratings; `no_rounds` counts advanced spots only (a legacy plan
with 1 advanced of 3 was reopenable into a one-candidate final).

Verified 29/29 on the live-identical rig + 052/054–056 via PostgREST, including
the full loop: reopen → member switches vote → host decides → the new finalist
wins. The rating race is the accepted class (closed by 053).

Deadline readers checked for NULL: `closesLabel` → "Open", the host auto-decide
effect returns early, `edit_plan`'s comparison is null-safe, the create form
always sets one, no share copy uses it.

---

## 2026-09-17 — T1: runbook "Next" rehearsed once from live state (82/82); plan creation accepts invisible titles (live)

APPLY_RUNBOOK.md now has preflight rows for 052/054–057, a "Next" table
(N1–N8: 052 → 054 → 055 → 056 → 057 → deploy → 049 → 051) with pasteable verify
lines, and §4b recording the rehearsal. Proven: all five are additive for the
current client (its reads still work with them applied) and prerequisites for
the new one. The old sign-up path (`p_emoji: "?"`) yields JSON `null` and no client
renders `people.emoji`.

Two harness traps this round, both caught before trusting a result:
- `check054` counted ALL people ("15") when run after other suites. Scoped to its
  own ids.
- My first creation probe "showed nothing" because both calls failed input
  validation (wrong field; not enough spots) before reaching the title check.
  A positive control (a normal title must succeed) exposed it; the valid probe
  then confirmed the gap.

**055 fixed in place (7e618e7):** `edit_plan` refused `''` but saved an
invisible-only title (T2 found U+200B). It now also requires the title to be
non-empty under `clean_display_name` (the same invisible set, ZWJ/ZWNJ inside
words kept). T2 verified end to end.

**OPEN, LIVE, pre-existing:** `create_direct_plan` and `create_secure_plan`
accept invisible-only titles (stored U+200B and U+200B+ZWJ). Not patched: needs
its own reviewed migration and an owner go.

---

## 2026-09-17 — T1: migration 058 STAGED — plan creation refuses invisible-only titles (Low)

`create_secure_plan` / `create_direct_plan` (live) stored a title of only U+200B
(or U+200B+ZWJ). 058 re-creates both verbatim from the checksum-proven live
bodies, changing ONLY the title condition to also require a non-empty title
under `clean_display_name`. Same 22023 error the client already handles; grants
kept; stored title unchanged (`clean_app_text`, 60). Needs 052 first.
Rehearsed incrementally on the 052–057 rig, 16/16: negative control first; then
ZWSP / ZWSP+ZWJ / BOM+NBSP refused on both functions; positive controls: normal
and Persian-with-ZWNJ titles still create; grants unchanged. `security` review:
bodies byte-identical apart from the condition, emoji-only titles unaffected, no
findings. Runbook: preflight row + N5b (pre-deploy, additive for the current client).

---

## 2026-09-17 — T1: C4 migration 059 STAGED — birthday correction (direction rule) + one age-gate source

- **One source for gates:** `category_age_gates()` (immutable VALUES list),
  `category_min_age()`, `spot_required_age()`; the two creation functions'
  three hardcoded CASE copies are replaced (re-created from 058's bodies). Full
  age matrix at creation (ages 16/18/20/21 × dinner/shisha/nightlife × both
  functions) identical before/after. A function, not a table (T0): values change
  only by migration.
- **`correct_birth_date`:** one correction (`member_ages.corrected_at`).
  DIRECTION rule (T0's correction to my band rule, which let 17.0→17.99 unlock
  18 the next day): younger always allowed (≥13); older only if already past the
  highest gate = greatest(max category gate, max `minimum_age` of CURATED spots;
  live max 21, values 0/18/21; custom spots excluded so a junk 99 can't block
  everyone). Otherwise `crosses_age_gate` → contact support (manual, outside the app).
- Security review adopted: **time zone.** `current_date` followed the session
  zone, which a PostgREST caller sets per request (`Prefer: timezone=`).
  **Verified on the rig before acting:** the header moved the date. The three
  gate functions now pin `Asia/Dubai`; the rig negative control (a user turning
  21 today in Dubai was refused under GMT+12) passes after. **Refused crossings
  are audited** (outcome blocked, no dates). Helpers revoked from anon/authenticated.
- **Pre-existing, not widened:** `set_birth_date` and `current_member_age` still
  use the session zone (same up-to-a-day skew; the plan-creation gate itself is
  now pinned).
- Verified 47/47 on the 052–058 rig; schema.sql builds from scratch with 059.

---

## 2026-09-17 — T1: 057 adds `plans.reopened_at` (STAGED); 049/051 now single-transaction

- `reopen_plan` sets `reopened_at = now()`. Notice rule for clients: status
  `'open'` AND `reopened_at` set. `execute_plan_command` untouched: a re-decide
  flips status to decided (notice hides), value kept as history. T0 accepted.
- 051's plans grant lists `reopened_at`, so **051 must apply after 057** (runbook
  N8 dependency + verify line; N5 verify checks the column).
- `security` review (lane/backend @ 0d50238 + diff): no Critical/High/Medium.
  Low adopted: 049/051 revoke-then-grant was only atomic in the SQL editor; both
  now `begin; … commit;`. Proven on the rig: 051 run via plain `psql -f` without
  057 errors and leaves `plans` SELECT intact; in order, grants correct.
- Rig: 057 suite 34/34 (reopen sets it; re-decide → decided/kept/notice false;
  never-decided plan patched with event_time/booking_owner → null; 051 after 057
  → member reads reopened_at, created_by_user_id still refused).
- 059: runbook N5c now requires `max(minimum_age)` of curated spots = 21 on live
  before apply (not re-read today: a live read was not permitted from this session).

---

## 2026-09-18 — T1: C3 migration 060 STAGED and PROVEN — delete my account

- **Shape (owner's calls):** storage first, confirmed by listing; one RPC
  transaction ending in `delete from auth.users`; hosted OPEN plans deleted,
  hosted DECIDED plans with another member kept read-only (creator null, host
  token row deleted); custom spots kept ownerless (FK → `set null`, the CHECK
  replaced by an INSERT-only trigger) so a shared spot no longer cascades away
  other people's votes and visits, which also removes the `winner_spot_id`
  blocker; audit row with counts only.
- **Votes/RSVPs/ratings are handled BEFORE the auth delete.** Their FK is
  `on delete set null`, so a bare auth delete would mint rows with a name and a
  participant_token_hash and no user_id — 053's claimable class. Open-plan votes
  deleted, decided-plan votes kept as 'Former member' with hash and user_id
  null, RSVPs and ratings deleted. Asserted: no new claimable rows.
- **Security review, HIGH (fixed): the old order could destroy photos for
  nothing.** Photos were deleted first; if the definer cannot remove the
  `auth.users` row the RPC rolls back, but the photos are already gone. And
  `auth.users` has RLS with no policies, so a missing privilege **removes 0 rows
  without raising** — `deleted` would have been reported for a login that still
  worked. Fixes: a probe (`p_probe`) that does the real delete inside a block,
  checks the row count and raises to roll it back, called by the route BEFORE
  any photo is touched; plus `row_count = 1` asserted on the real path.
- **Review MEDIUM (fixed):** `booking_owner` matched every name the user had
  ever used anywhere — one Sara deleting her account would wipe another Sara's
  name from shared plans, and a throwaway plan could be used to wipe someone
  else's deliberately. Now correlated per plan, and `booked is true` is left
  alone as in leave_plan. MEDIUM-LOW (fixed): the leftover-photo count keyed on
  `owner_id` while the upload policy keys on the path, so a null-owner object
  under the user's folder was invisible to the proof; now counted by either.
  The route's listing was capped at one level and 1000 entries; it paginates and
  recurses with a depth guard that throws rather than missing files. LOW: my
  "cannot deadlock" claim was wrong (hosted plans locked, then votes written in
  plans I do not host — the opposite order to delete_plan); every plans row the
  function touches is now locked in id order. `app_rate_limits` rows keyed on the
  raw uid are deleted.
- **Proof:** rig == live (7/7) then 052..059; check060 **37/37**, check060-storage
  **11/11** against a real storage-api container. Controls, not just assertions:
  auth delete raising → nothing deleted; auth delete removing 0 rows silently →
  `cannot_delete_login`; before 060 an orphaned upload is invisible to its owner
  and its delete returns `200 []`. Suites: `~/plan-ind-rehearsal-backup/rehearsal/`.

## 2026-09-18 — T1: a sentinel must be distinguishable from the failures it detects

`delete_my_account`'s probe deletes the login for real, then raises to roll that
back. It signalled with a plain `raise exception`, which is **SQLSTATE P0001 —
the same code any ordinary trigger raise produces**. The rig's rollback control
(a BEFORE DELETE trigger on auth.users that raises) was therefore caught by the
probe's own handler and reported as `ready`: the mechanism built to detect a
failed login delete was swallowing exactly that failure. Fixed with a private
SQLSTATE (`PT060`); anything else propagates.
Found by the control, not by reading the code — same lesson as the Realtime
"any refusal passes" check and the zsh gate that false-passed.

## 2026-09-18 — T1: storage.protect_delete() blocks SQL deletes on storage.objects

Reproduced on the rig against a real storage-api (v1.70.3), not claimed: a plain
`delete from storage.objects` raises *"Direct deletion from storage tables is not
allowed. Use the Storage API instead."* **No migration can ever clean up storage
objects in SQL.** Deleting a file means the Storage API with a session that
passes the bucket's delete policy. 060 is unaffected — the route deletes through
the API and the RPC only counts — and the rig's fixture cleanup only works
because `session_replication_role = replica` disables the trigger.

---

## 2026-09-18 — T1: the 053 hijack path is CLOSED by deleting the data, not by guarding it

Owner-approved live write, run by T0. All 45 legacy rows (25 votes, 17 RSVPs,
3 ratings — every one `user_id is null`, on the 6 fixture plans) deleted;
verified 0/0/0 after, `plans` 6 and `spots` 82 untouched. Those three tables
were legacy-only, so nothing owned was lost, and live had 0 permanent accounts.
Every row written since 043 carries a `user_id`, so there is nothing left to
claim by `participant_token_hash`.
**The judgement worth keeping: deleting the data beat guarding it.** The planned
fix was migration 053 — rewriting the three core voting RPCs, with its own
rehearsal, while T2 was re-walking that loop. One statement over the owner's own
test data removed the exposure completely instead of adding a guard around it.
Ask what the data is before writing code to protect it.
What remains of 053 is only the `for key share` race fix (the accepted races
documented in 056 and 057): correctness, queued, not a launch blocker.
Side effect recorded in the runbook §7 so nobody reads it as a regression: the
six fixture plans now render with no votes.

## 2026-09-18 — T1: photo pre-apply gate (1c1ced3), proven both ways

`scripts/check-spot-photo-urls.sh <migration.sql>` curls every `spot-photos` URL
in a migration and prints ok/BLOCK. **It asserts the content type, not just the
status:** a missing object in a public Supabase bucket answers 400 with a JSON
body, and "it responded" is not the question. Proven against live both ways —
039's six return `image/jpeg` (ok), a fabricated key returns 400 (BLOCK, exit 1).
No key needed; the bucket is public. This is the check 039 was originally held
for. It also confirms live's object keys are hyphen-stripped, which is why 046
must be written against the keys that actually land, never the filenames sent.

## 2026-09-18 — T0: PRODUCTION IS LIVE — https://plan-ind.vercel.app

Deployed with the Vercel CLI (`vercel --prod --yes --scope safebox`) after the
MCP route dead-ended: `list_teams` kept returning empty and project fetch 403'd
even once the owner had granted safebox scope, because **the token was minted
before the grant**. A stale token does not look expired, it looks unauthorised —
re-mint before debugging permissions.

Deployment `plan-ird95gwpa-safebox.vercel.app`, aliased to
**`plan-ind.vercel.app`**. The deployment URL itself 302s (protection is on);
the production alias is public, which is what the owner asked for — the link
goes on a CV.

Verified **on the deployed URL**, not locally, and re-verified before closing:
`/`, `/demo`, `/login`, `/privacy`, `/terms` all 200; `/api/health` returns
`{"status":"ok"}`, which is a real database read, not a static string; the legal
pages render `Aryan Sajiv` / `aryansajiv2@gmail.com` / `Dubai, United Arab
Emirates`. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` was confirmed **inside the built
chunk** (`/_next/static/chunks/app/login/page-*.js`) rather than by reading the
Vercel env list — a `NEXT_PUBLIC_*` var that exists but was set after the last
build is absent from the bundle and present in the dashboard at the same time.

Eight migrations went live the same day, each owner-approved, each verified by
catalog query before the next: 052, 054, 055, 056, 057, 059 (feature half), 060,
plus 053 closed by deleting data. Ledger rows above corrected **and the
filenames proven against `supabase/` on disk** — six of the names in the first
draft of those rows were wrong, which is precisely how this ledger has been
wrong three times before.

### Still open, in the order they should be done

1. **Turnstile hostname list** — owner-only, and it is a hard gate: a production
   build refuses sign-in without a captcha, and the widget refuses to render on
   a hostname it does not list. `plan-ind.vercel.app` must be added; keep
   `localhost`. The **secret** key belongs in Supabase Auth → Attack Protection
   → CAPTCHA and nowhere else — never Vercel, never the repo.
2. **049 + 051** — the client deploy was their gate and it has happened.
   Confirmed still pending: `authenticated` can still SELECT `votes.user_id`.
3. **End-to-end sign-in on the live URL** — never done. Everything verified so
   far is signed-out. This is Phase 4's real acceptance test and it cannot run
   until (1).
4. **058, and 059's age-gate consolidation** — from the file, by a backend
   session, never retyped.
5. **046** — blocked on the owner uploading 13 files.

### Sessions closed

All four worktrees verified clean and every lane branch merged into
`ai-engineering` before shutdown. T3's last uncommitted change (Realtime
fan-out instrumentation, `a8fdee8`) was committed and merged rather than lost —
an uncommitted tree was wiped here once, so "clean" is checked, not assumed.
