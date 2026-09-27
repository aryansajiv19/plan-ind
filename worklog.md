# Deal three worklog

Last updated: 2026-09-18 (Asia/Dubai). Entries from 2026-09-07 and earlier are in `docs/archive/worklog-archive.md`.

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
| 061 | `migration-061-vote-integrity-and-guest-limits.sql` | **yes — applied live 2026-09-26 via Supabase MCP (lead), owner-approved.** Dedupe deleted 0 rows (pre-count: votes 3, rsvps 0, ratings 0; all 0 doomed). Verified: `votes_user_round_key`, `rsvps_user_key`, `ratings_user_key` present; `cast_plan_vote` upserts on the per-user key; anon cannot execute; `visit_photos` read policy `{authenticated}`; upload policy requires `is_permanent_user()`. |
| 062 | `migration-062-plan-share-preview.sql` | **yes — applied live 2026-09-26 via Supabase MCP (lead), owner-approved.** Verified: anon can execute `plan_share_preview(uuid)`; unknown id returns null. Accepted 2026-09-26: `host_first_name` is the one field a guest claim could not already read (guests can't read `people`); the host chose to share the link, so it stays. The file's "strictly less" comment overstates this by that one field. |
| 063 | `migration-063-google-place-ids.sql` | **yes — applied live 2026-09-26 via Supabase MCP (lead), owner-approved.** Live `consume_app_quota` matched the pre-063 body exactly before replace. Verified: both columns, both CHECKs, `place-photo-global` in the quota body, anon cannot execute. No place ids loaded yet (needs the Places key). |
| 064 | `migration-064-signed-in-participants.sql` | **NOT applied — the only staged migration left. Held until the owner says go-live: apply it in the same step as deploying `main` (the production client still uses guest sessions).** Apply after 061. Anonymous sessions refused (42501 "Sign in to ...") by `claim_plan_access`, `cast_plan_vote`, `set_plan_rsvp`, `rate_plan`, `unrate_plan`, `leave_plan`; all plan_access-scoped read policies and both plan presence policies now require `is_permanent_user()`. Existing guest rows kept, inert. Ship with the client change that drops `signInAnonymously`, or share links break for guests. Verify: `pg_get_functiondef('claim_plan_access(uuid)'::regprocedure) like '%is_permanent_user%'`, same for `pg_policies.qual` on `read accessible votes`. Needs `security` review. |
| 065 | `migration-065-protect-spots-in-plans.sql` | **yes — applied live 2026-09-26 via Supabase MCP (lead), owner-approved.** Verified: trigger `spots_protect_in_use` enabled, `protect_spots_in_use()` not executable by client roles, 5 spot indexes present; spots 82 / plans 6 / votes 3 unchanged. |
| 066 | `migration-066-control-secret-digest.sql` | **NOT applied — staged 2026-09-26.** `valid_control_secret` accepts a bcrypt row (`$2…`, as today) or a lowercase sha256 hex; anything else fails closed. Applying changes nothing until the `server-control` row is switched to the digest (computed off the DB; revert = restore the bcrypt row). `security` review 2026-09-26: design sound; one Medium in the runbook (an unset shell var hashes the empty string: outage + '' becomes a valid secret), fixes in progress in the platform lane. Optional per the owner's scale target; apply only with owner approval. |
| 067 | `migration-067-host-and-ballot-identity.sql` | **NOT applied — staged 2026-09-26; ships at go-live after 064.** One host rule (`plan_host_authorized`: creator on any device; token only for creator-less legacy plans, the 6 fixtures live), `am_plan_host(uuid)`; final round gets ≥1 h and a non-uuid tie-break (R1); one name per ballot (R7); hash-ownership checks and `votes_participant_round_key` dropped (R2/R13); `booking_owner` cleaned (R8); joining refused below the plan's required age (R6). test:db 12 new (10 fail pre-067). Applied on the local stack 2026-09-26. |
| 068 | `migration-068-data-hygiene.sql` | **NOT applied — staged 2026-09-26; ships at go-live.** Custom spots carry no links/photos + text caps (R4); friends visit-photo policy correlated (R9); `place_collection_items` spot/import indexes under new names (R18); 200-file visit-photo cap (C1). Live precheck 2026-09-26: 0 custom rows, 0 over caps, nothing to clear. test:db 6 new (5 fail pre-068). |
| 069 | `migration-069-plan-lifecycle.sql` | **NOT applied — staged 2026-09-27; ships at go-live after 068.** `expire_plan(uuid)`: any member fires a passed deadline (idempotent, never early), sharing internal `plan_transition` with host commands (P4); `plan_booking_owners` side table so the booker is matched by account, and the booking label is always the claimer's own profile name. Plus P11: `plans.decided_at` (trigger-stamped), `rate_plan` refuses until `coalesce(event_time, decided_at + 3h)`, `unrate_plan` removes the caller's photo-less visit. Phase 1 security fixes in place: plan visits need membership and a past outing (`visit_plan_allowed`), unrate spares visits with user content, `plan_booking_owners` backfilled. test:db 67/67. Applied on the local stack. |
| 070 | `migration-070-catalogue-truth.sql` | **NOT applied — staged 2026-09-27; ships at go-live after 069.** Generated by `scripts/gen-catalogue-truth.mjs` from `data/venue-facts.json` (deterministic). 16 new spots columns (facts, nearest station, `reopens_on`), curated-only; 82 venues / 840 values, 41 checker-flagged values withheld; SKY2.0, Terra Solis, Anantara World Islands, O Beach retired (private); Museum of the Future, Twiggy, Dubai Safari Park, Hatta Dome Park closed until a date; Cove Beach and Iris corrected. Deal, wall, counts, Discover skip closed spots (Dubai date). test:db 62/62. Applied on the local stack. |
| 071 | `migration-071-closed-places-guard.sql` | **NOT applied — staged 2026-09-27; ships at go-live after 070.** `create_secure_plan` / `create_direct_plan` (059 bodies + guard) refuse a retired curated spot or one with `reopens_on` after the Dubai date, 22023 with a readable message. Applied on the local stack. |
| 049 / 051 | `migration-049-hide-voter-user-id.sql`, `migration-051-hide-creator-user-id.sql` | **yes — applied live 2026-09-19 13:20Z via Supabase MCP (T0), owner-approved.** Confirmed 2026-09-26 by `list_migrations` (`migration_049_hide_voter_user_id`, `migration_051_hide_creator_user_id`). This row said "NOT applied" for a week because the entry recording it lived only on the unpushed `ai-engineering`. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

`docs/archive/worklog-archive.md` holds everything before the 2026-09-26
scale re-measure entry below (including that morning's hand-off). Read it only when chasing *why*.

## 2026-09-26 — Platform lane: scale re-measure on `main` (a590ee2)

Local stack, 3 reps per point after warm-up. **Vote burst:** n=200 p50
112–151 / p99 211–241 ms, 0 errors; n=250 6–8% errors. The knee is the local
Kong gateway (512 worker_connections ≈ 256 in flight), not the app: PostgREST
direct took 1000/1000 clean, and a vote costs 0.6 ms of DB time.
**spot-deal:** n=50 p50 431–520 ms clean; n=100 p50 915–970 ms (was 2131 ms
before the C2 cache); n=200 1.3–1.8 s with 25–55% errors. Latency is one Node
process at ~7 ms CPU per request; errors are the same Kong cap. DB side:
`valid_control_secret`'s bcrypt is ~93% of the route's DB time (6.4 ms
uncontended, ~20 ms loaded).
Found and approved: (A) 8 API routes answer a failed `getUser()` (network)
with 401 "Sign in", a silent-failure bug; fix is a shared helper returning 503.
(B) swap bcrypt for a sha256 compare (the secret is 256-bit random, so bcrypt's
slowness buys nothing), backward compatible, benchmarked paired-alternating;
live apply needs the owner.
- **Auth outage ≠ signed out (7e70d36, 9fdcfea):** `sessionUser()` in
  `lib/auth.ts` returns user | "signed-out" | "unavailable"; all 8 API routes
  answer an auth-service failure with 503 "couldn't check your sign-in", not
  401 "Sign in". Only a missing session or a GoTrue 4xx is signed-out (a 5xx
  with a JSON body was not, fixed on merge). Local deal n=200 ×3: 401s under
  load 249 → 0; signed-out callers still get 401. Pages (`getCurrentUser`)
  still redirect on an outage: handed to the frontend lane.
- **UI states pass (frontend lane, b0a3738):** every core screen tested with
  real failures on the local stack (REST container stopped by id, expired
  deadline, plan deleted mid-vote, quota hit). Fixed: an outage no longer
  reads as "no date of birth" (`readMemberAge` throws; `memberAge` still fails
  closed for age gates) or as signed out (`getCurrentUser` on `sessionUser`);
  a failed deal shows the server's reason, not "raise your budget"; an unsaved
  vote/RSVP/rating is rolled back instead of shown as saved; the plan notice is
  sticky beside the control that failed. Open: duplicate React key on the
  voter's own face; host controls tied to one device (PRIORITIES B7).
- **066 staged (9ab07ae):** control secret checked by sha256 (256-bit random
  secret, so bcrypt's cost buys nothing). Paired A/B on one local stack,
  switching only the row: quota RPC DB time 4.0 → 0.45 ms (n=1, 12/12),
  15.5 → 1.15 ms (n=100, 6/6), 22.1 → 0.96 ms (n=200, 6/6); local p50 flat
  uncontended, −10–12% loaded (4/6, weak: Node is the local bottleneck).
  Found: most local DB CPU in a deal burst is GoTrue opening ~5 Postgres
  sessions per `getUser()`; `getClaims()` in routes would remove it but lets a
  revoked token work until expiry and needs ES256 in production (owner Q).
- **Owner: scale target is tens of concurrent users (CV demo).** Headroom is
  ample (vote 200 clean, deal 50 clean). Scalability work is fixed only when
  it is correctness in disguise or near-free; `getClaims()` in routes dropped;
  066 optional.

- **Frontend lane (88d8acf):** a failed vote/RSVP/rating reverts at once;
  own votes match by account name (064 made the account the voter), fixing
  "my vote isn't mine on a second device" and the duplicate React key; vote
  page 432 → 295 lines (pure move); sticky notice pins (shell overflow-clip).
  Gap for the B7 batch: `votes` has no per-plan name uniqueness (rsvps and
  ratings do), so two accounts with one display name could each see the
  other's vote as theirs; `cast_plan_vote` should refuse a name in use, as
  `set_plan_rsvp` does. Proposal logged: browser Supabase client has no
  request timeout (`AbortSignal.timeout` in `lib/supabase.ts`).
- **C7 + 066 fixes (98e5481):** visual baselines are Linux-only, generated by a
  CI dispatch (`gh workflow run ci.yml --ref <branch> -f update_visual=true`);
  24 baselines, E2E in CI 237 passed / 1 skip (was 33 skips), stable on
  re-run; a missing baseline fails. 066: an empty/null/>256-char secret never
  verifies, guarded row-switch runbook, one-way order, table revoke. test:db 17/17.

## 2026-09-26 — Lead: security + scalability review of `main`

Workflow: 6 area reviewers (4 security, 2 scalability) + a skeptic per
finding + a coverage critic, local stack only. **23 confirmed, 7 refuted;
0 critical, 1 high** (deadline auto-pick skips the final round and picks by
lowest uuid). Medium: participant-hash squat locks a member out of RSVP/rating;
open redirect via dot-segment `next`; community custom spots can carry any
link/photo; Realtime never resyncs after reconnect; plus critic: no per-user
visit-photo quota. Triage and lanes in PRIORITIES "In flight". Scale-only items
recorded, not built (owner's target: tens of users).
- **Review batch, client (frontend lane, merged):** host controls follow
  `am_plan_host` (067) on any device, falling back to the device token until
  067 is applied; the command route takes an optional host token; the
  deadline effect never decides in the tick it advanced (R1); every Realtime
  (re)subscribe re-reads the plan and its rows (R5); sign-out clears per-plan
  localStorage (R14); custom places never show an email prefix (R15);
  browser requests bounded at 15 s, photo uploads exempt; 067's age refusals
  get their own screens.
- **Review batch, server (subagent, 39a77d2):** `safeNextPath` refuses dot
  segments that collapse into `//host` (R3); a model refusal is its own 422,
  never "try again" (R16); the proxy treats an auth outage as unknown, not
  signed out (R22) and no longer runs on `/api/*` (R23, each route
  authenticates and refreshes cookies itself); `/api/weather` needs a
  signed-in account and is `Cache-Control: private` (R12). Unit 259/259, each
  test fails without its fix. **Not built, recorded:** R10 (an attacker can
  burn a known email's OTP limit until 00:00 UTC): an app-side Turnstile check
  would consume the single-use token Supabase's own captcha needs, so Supabase
  stays the one verifier; revisit by keying the limit on email + IP. C2
  (forwarding the client IP to GoTrue) needs a secret API key, which this repo
  deliberately never holds.

## 2026-09-26 — Lead: security review of the fix batch

Second workflow (SQL + TS reviewers, skeptic per finding, local stack): every
original fix confirmed closed (R1 decide half, R2/R13, R4, R6 for new joins,
R8, R9, R14, R18, B7). 9 residuals, no High, all fixable while 067/068 are
unapplied: F1 (medium) upload cap still 1.6 GB per account → byte ceiling;
F2 claim-first name squat → server takes the caller's own display name;
F3 under-age members from before 067 keep rights → one-off cleanup; F4
advance ties by uuid; F5 advance/decide not idempotent across two host
devices; F6 `am_plan_host` must be null for creator-less plans (platform lane);
F7/F8 client timing edge cases (frontend lane); F9 `safeNextPath` threw on
`//[` (fixed, ab8932c).
- **Live re-verify on the local stack (066–068 applied), frontend lane:** host
  controls with no device token via `am_plan_host` ok; Realtime rejoin resync
  ok (stage caught up 7 s after the socket returned, no reload); both age
  refusals render at 375/768/1280/1440; sign-out cleared 9 → 0 per-plan keys.
- **Incident (platform lane, local only):** a lane `supabase start` failed on
  a port held by another local project (skillverse), the error was hidden by
  truncated output, and `schema.sql` + test:db ran against skillverse's local
  DB (plan-ind objects added; its own data untouched). Owner informed; cleanup
  is the owner's call. Rule since: throwaway Homebrew Postgres for test:db,
  and confirm the port's container by name before any psql.
- **F7/F8 (frontend lane):** auto-decide is held back only when the server gave the
  final no time; `usePlanData` hands out a `setPlan` that bumps the plan
  sequence on every write, so any fresher write discards an in-flight resync.

## 2026-09-26 (evening) — CHECKPOINT: paused by the owner (read this first)

**State of `main`:** 41c8081 plus docs. Green: unit 260/260, test:db 40/40,
CI E2E 237 passed / 1 skip with 24 visual baselines, lint/typecheck/check:schema
clean. Production still runs the old client (`d536b6f`); `vercel.json` keeps
`main` from auto-deploying.

**Live DB:** through 065 except 064. **Staged, ship at go-live:** 064, 067
(host = creator account on any device; age-gated joining; one name per ballot
from the caller's profile; fair, idempotent advance/decide), 068 (custom spots
carry no links/photos; friends-photo policy; 065's missing index; 500 MB /
200-file upload cap per account). 066 optional (control secret by sha256; its
guarded runbook is in the file). All of 064–068 are applied on the LOCAL
stack. **Go-live = `docs/DEPLOYMENT.md` "Go-live checklist"**, in order.

**Done today:** stranded `ai-engineering` commits merged; 049/051 found live;
061/062/063/065 applied; README rewritten in the owner's voice with a demo
video (GitHub attachment) and screenshots; two full reviews (security +
scalability, then the fix batch), every finding fixed or recorded; states
pass (outage ≠ empty ≠ signed out); auth outage → 503; visual baselines from
CI; E2E in CI; context trimmed (plugins, agent docs, skills); owner's
production standards in the `house-rules` skill.

**In flight when paused:**
- **Confirmation pass on F1–F6: F3, F4, F5, F6 closed; two still open, both in
  unapplied 067/068, so FIRST JOB ON RESUME (platform lane), before go-live:**
  - F1 (medium): the upload cap is checked only in Storage's RLS probe, which
    runs before the upload; the real row is written later as superuser, so a
    burst of parallel uploads by one account passes (125 × 8 MB ≈ 1 GB).
    Fix: a BEFORE INSERT/UPDATE trigger on `storage.objects` for visit-photos
    with a per-owner advisory lock (first confirm the hosted role may create
    triggers there), else lower the bucket's `file_size_limit`; add the orphan
    purge; correct the 068 comment.
  - F2 (low): a member can still squat a friend's display name by renaming
    their own profile, voting, and renaming back; the victim is then refused
    and can't fix it at the name gate (the server ignores the typed name).
    Better shape: identity by account only (drop the name-in-use refusal;
    one ballot per account is already enforced by `votes_user_round_key`).
    Catch: the client finds "mine" by name because `user_id` is not readable
    (049), so it needs a small `my_rows(plan_id)`-style RPC, and
    `use-voter-name.ts` should match the server's 40-char name cap.
  Details: `~/plan-ind-review-findings.md` (local only).
- **B8 landing redesign** (frontend lane, `lane/frontend-a` @ d4f4288, WIP,
  not merged). Done: `HomeHero` extracted (HomeExperience 440 → 364), hero
  deck replaced by `LiveVoteLoop` (real OptionCards replaying the sample
  round, paused offscreen, settled under reduced motion), CTAs "Start a plan"
  / "Try the demo". Left: `LandingNav` (anchors, Dubai clock, Start a plan),
  How it works strip, 18-tile wall with category codes, counts line, footer,
  delete unused `components/kokonutui/card-stack.tsx`, review-animations,
  1280/768/390 pass, before/after shots (1440 "before" captured). Note:
  `/demo` shares HomeHero so it shows the loop too; hero cards are tight at
  ~175 px (Select chip hidden in the embed; narrow widths unchecked).
- The one dev server was stopped at pause. Restart, serving `main` against the
  local stack (never `.env.local`, which is production):
  `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55021 NEXT_PUBLIC_SUPABASE_ANON_KEY=<CLI demo anon key>
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<same> SECURITY_CONTROL_SECRET=local-secret npx next dev -p 3000`
  (local stack = docker `supabase_*_plan-ind-frontend`, ports 55021/55022).

**Team setup:** lead session plus two peers, each in its own worktree:
frontend lane `../plan-ind-A` on `lane/frontend-a`, platform lane
`../plan-ind-B` on `lane/platform`. Lanes push their branch; only the lead
merges `main`. One dev server, one browser, exact docker ids, throwaway
Homebrew Postgres for test:db.

**Waiting on the owner:** say "go live"; enable the Google provider; the
Google Places key (the biggest visual lever: 6/82 venues have photos); DB
password or `supabase login` for C4; JWT key type (Settings → JWT Keys);
README author line and licence; skillverse local DB cleanup (a lane loaded
plan-ind's schema into it by mistake; its own data untouched).

**Local-only, not in git (the repo is public):** full review findings with
attack scenarios at `~/plan-ind-review-findings.md`; delete it once 067/068
are live.
- **F2 client (frontend lane, cherry-picked):** own votes/RSVP/rating found by
  row id from `my_plan_rows` (name match only as a pre-migration fallback);
  the voter name is always the profile's (40 chars); NameGate removed.
- **F1/F2 reworked (platform lane, a7c6d26):** the visit-photos cap is a
  BEFORE INSERT/UPDATE trigger on `storage.objects` (per-owner advisory lock,
  200 files / 500 MB) that also holds on Storage's superuser landing write;
  the restrictive storage policy was removed because hosted projects refuse
  CREATE POLICY on `storage.objects` without ownership (a cutover risk), while
  TRIGGER is granted to `postgres`. No SQL orphan purge: deleting the row
  leaves the S3 file billed and would free quota. Identity is the account
  only: name refusals and the voter_name unique keys dropped;
  `my_plan_rows(uuid)` gives the client its own row ids. test:db 43/43, CI
  green. Both applied on the local stack; re-confirmation running.
- **F1/F2 re-confirmed closed:** a two-session probe showed the advisory lock
  serialises Storage's superuser landing writes; the 201st file and
  500 MB + 1 byte are refused; `create or replace trigger` works as the
  non-owner `postgres`. Identity is by account; `my_plan_rows` returns only
  the caller's rows. Two Low follow-ups queued: the visit-photos folder check
  (enforced in the trigger, not a policy) and name-grouped seats/booking-owner
  now that names repeat. **Go-live is no longer blocked by the review.**
- **P2 + P4 + follow-ups merged (06e86d6):** members move through every pool
  round without the host (a guest picks in all 3; new E2E); 069 staged with
  `expire_plan` and the booking-owner side table; 068's trigger keeps visit
  photos in their owner's folder. Gate: unit 260, test:db 52, build ok, CI
  green. Both lanes stopped at the owner's usage limit; their queues are in
  PRIORITIES and `docs/ROADMAP.md`.

- **P4 client + seats (587d9d8, 4c2e0b3):** every member's device calls
  `expire_plan` on load and at the deadline (verified live: with the host's tab
  closed, a member's device moved an expired plan to the final); cards lock past
  the deadline; seats are per person (participant hash), so repeated names
  never merge; the photo cap is stated plainly.
- **P11 (65ba0aa):** rating opens after the outing; deciding no longer logs a
  visit (client half queued); unrate removes its own photo-less visit so
  reopen is never blocked by a fake one.
- **B8 landing (cda1af2) + baselines:** app-tab nav linking into `/demo?view=`,
  Dubai clock, "Start a plan"; the tap-to-fan deck hero with photographed
  spots first; How it works with a live sample vote; an 18-tile wall with
  category codes; real counts; a footer. Polished with the `impeccable`
  skill; 8 visual baselines regenerated by CI dispatch.
- **seat_key (069):** one member-readable seat per account per plan
  (md5 of plan + user), so two devices are one seat. test:db 56/56.
- **P11 client + P3:** rating shows only after the outing; deciding never
  logs a visit; unrate removes it. `/home` has a "Your plans" rail with each
  plan's state in Dubai time, and an honest error state.
- **P15 approved:** cancelling a decided plan = deleting it when the outing
  didn't happen (no ratings or visits), allowed even when booked.
- **P7:** signed-out composer controls say "Sign in to …" before any work;
  the draft survives sign-in (sessionStorage → prefill on /home); smart search
  hidden when the server has no model key, key checked before the quota.
- **P9:** vote cards and the winner link to place details; Back returns to
  the plan (explicit `from`, server-rendered); signed-out visitors get "Plan a
  night here".

## 2026-09-27 — Lead: venue research; the live catalogue lists closed places

Research workflow (8 batches + metro list, a fact-checker per batch, merge
with nearest-station math) wrote `data/venue-facts.json`: all 82 curated
venues, 66 metro/tram stations; 78 addresses, 65 coordinates, ~21–25 venues
each with a sourced licence/dress/parking/reservation fact, 27 within a
15-min walk of a station. Sources are venue sites, Visit Dubai, Time Out,
What's On; never Google content; unknowns null. **Found: 4 permanently closed
venues still dealt live** (SKY2.0, Terra Solis, Anantara World Islands, O
Beach), 4 temporarily closed (Museum of the Future, Twiggy, Dubai Safari
Park, Hatta Dome Park), 2 moved (Cove Beach → JBR, Iris → Dubai Harbour).
Migration 070 "catalogue truth" briefed to the platform lane; the facts UI
(P16–P20) to the frontend lane. The owner should spot-check a sample.
- **P12:** direct-plan form has no dead budget/radius controls; submit recovers
  from network errors; search matches name/area/cuisine on a sanitised query,
  with a real error state and 12 curated tiles before typing.
- **P5 + P15 (platform lane):** a failed deal read is a 503 "Couldn't deal places
  right now", never "raise your budget"; the host can cancel (delete) a decided
  plan until someone rates or logs a visit, even when booked. test:db 59/59.
- **P13:** Discover shows what RLS allows (curated + community + own), a
  failed search says so, all category chips show; collection, photo and
  saved-link failures each have their own message. Note: community custom
  spots from other accounts are now visible in Discover (068 caps their text
  and forbids links/photos).
- **P14:** Settings block at the top of Profile (name, emoji, birthday
  correction, sign out, delete account with a typed DELETE); onboarding asks
  "What should friends call you?"; the header avatar shows the chosen emoji.
  Phase 1 of the roadmap is complete except P6/P8 (platform lane).
- **P16:** a "Get there" row (Drive, Metro, Walk, Apple Maps, Uber) on the place
  page and the winner, from the viewer's own device location; drive estimates
  say "in rush hour" only in Dubai rush windows.
- **070 merged (976e0c5):** closed venues never reach a deal; facts columns
  filled from the sourced research. Queued: 071 DB guard on plan creation;
  closure filters in DirectPlanSearch/Discover/action-search-bar (frontend).
  Owner calls: Iris's shisha category is unsupported; Scoopi Cafe and Garage
  Dubai are unverified (retire?).

- **P17 + baselines:** nearest metro and a walk estimate (stored 070 value
  first, computed for custom spots); visual baselines regenerated after the
  P13/P14 composer changes (a dispatch run is cancelled by any later push to
  `main`, so hold pushes until it finishes).

## 2026-09-27 — Lead: security review of Phase 1 (a7c6d26..HEAD)

2 reviewers + skeptics, local stack only: grants, locking, leaks, sanitiser,
redirects and account deletion all clean. 4 confirmed, all fixed before
go-live: **medium**, the visits insert policy lets anyone attach a visit to
any plan_id, which blocks the host from cancelling or reopening (proven
locally); low, unrate_plan deletes visits with user content; low, pre-069
booking claims not backfilled into plan_booking_owners; low, delete_plan's
`already_happened` unmapped in the command route (500). Plus: the P15 cancel
control has no UI yet.
- **P18:** "You're coming from" on the vote screen (device-only, rounded to
  ~100 m); cards show the voter's own km, drive estimate and metro walk; six
  more origins incl. Sharjah; metro prefers the 070 columns.
- **P15 UI:** "Cancel this plan" on a decided plan (hidden once rated; the
  server refuses after a logged visit with its own message); the command route
  maps `already_happened` to 409.
- **069 security fixes + 071 (merged):** a stranger can no longer block
  cancel/reopen with a fake visit; new plans refuse closed places. test:db 67/67.

- **Re-confirmation (visits fix + 071): both closed.** Every insert path for a
  plan visit refused for strangers and before the outing; 071 not bypassable,
  Dubai midnight boundary verified. Low follow-up queued: only members who
  joined before `decided_at` count toward `already_happened`.
- **P20:** "Know before you go" on the place page and decided screen (only
  facts that exist, each with its source, "Checked <month>"); "Reopens <date>"
  on place, vote cards and decided; closure filters in every curated search.
  **Phase 2 (never ask a friend) done** except P21-P24.
- **P23 + P6 client:** plan time is a Dubai-time draft with Save/Cancel; the
  calendar invite carries the address and Maps link; composer chips show how
  many places each budget/radius offers and disable ones that cannot fill a
  plan; categories that cannot fill are hidden. test:db runs serially (a
  trigger toggle deadlocked a parallel cleanup in CI).
