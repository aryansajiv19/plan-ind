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
| 064 | `migration-064-signed-in-participants.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** Apply after 061. Anonymous sessions refused (42501 "Sign in to ...") by `claim_plan_access`, `cast_plan_vote`, `set_plan_rsvp`, `rate_plan`, `unrate_plan`, `leave_plan`; all plan_access-scoped read policies and both plan presence policies now require `is_permanent_user()`. Existing guest rows kept, inert. Ship with the client change that drops `signInAnonymously`, or share links break for guests. Verify: `pg_get_functiondef('claim_plan_access(uuid)'::regprocedure) like '%is_permanent_user%'`, same for `pg_policies.qual` on `read accessible votes`. Needs `security` review. |
| 065 | `migration-065-protect-spots-in-plans.sql` | **yes — applied live 2026-09-26 via Supabase MCP (lead), owner-approved.** Verified: trigger `spots_protect_in_use` enabled, `protect_spots_in_use()` not executable by client roles, 5 spot indexes present; spots 82 / plans 6 / votes 3 unchanged. |
| 066 | `migration-066-control-secret-digest.sql` | **yes — function applied live 2026-09-27 via Supabase MCP (lead; owner: "apply any migrations").** The live row is still bcrypt (`$2a`), so behaviour is unchanged; the sha256 row switch (steps in the file header) is NOT done. Verified: sample deal (control-secret quota path) 200 after apply. |
| 067 | `migration-067-host-and-ballot-identity.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** One host rule (`plan_host_authorized`: creator on any device; token only for creator-less legacy plans, the 6 fixtures live), `am_plan_host(uuid)`; final round gets ≥1 h and a non-uuid tie-break (R1); one name per ballot (R7); hash-ownership checks and `votes_participant_round_key` dropped (R2/R13); `booking_owner` cleaned (R8); joining refused below the plan's required age (R6). test:db 12 new (10 fail pre-067). Applied on the local stack 2026-09-26. |
| 068 | `migration-068-data-hygiene.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** Custom spots carry no links/photos + text caps (R4); friends visit-photo policy correlated (R9); `place_collection_items` spot/import indexes under new names (R18); 200-file visit-photo cap (C1). Live precheck 2026-09-26: 0 custom rows, 0 over caps, nothing to clear. test:db 6 new (5 fail pre-068). |
| 069 | `migration-069-plan-lifecycle.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** `expire_plan(uuid)`: any member fires a passed deadline (idempotent, never early), sharing internal `plan_transition` with host commands (P4); `plan_booking_owners` side table so the booker is matched by account, and the booking label is always the claimer's own profile name. Plus P11: `plans.decided_at` (trigger-stamped), `rate_plan` refuses until `coalesce(event_time, decided_at + 3h)`, `unrate_plan` removes the caller's photo-less visit. Phase 1 security fixes in place: plan visits need membership and a past outing (`visit_plan_allowed`), unrate spares visits with user content, `plan_booking_owners` backfilled. test:db 67/67. Applied on the local stack. |
| 070 | `migration-070-catalogue-truth.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** Generated by `scripts/gen-catalogue-truth.mjs` from `data/venue-facts.json` (deterministic). 16 new spots columns (facts, nearest station, `reopens_on`), curated-only; 82 venues / 840 values, 41 checker-flagged values withheld; SKY2.0, Terra Solis, Anantara World Islands, O Beach retired (private); Museum of the Future, Twiggy, Dubai Safari Park, Hatta Dome Park closed until a date; Cove Beach and Iris corrected. Deal, wall, counts, Discover skip closed spots (Dubai date). test:db 62/62. Applied on the local stack. |
| 071 | `migration-071-closed-places-guard.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** `create_secure_plan` / `create_direct_plan` (059 bodies + guard) refuse a retired curated spot or one with `reopens_on` after the Dubai date, 22023 with a readable message. Applied on the local stack. |
| 072 | `migration-072-sample-deal-limit.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** `consume_otp_limit` (026 body, copied) gains a 'deal-preview' scope, 30/min and 300/day per HMAC'd client IP, for the signed-out sample deal (P8). Applied on the local stack. |
| 073 | `migration-073-when-poll.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** P21 "When": `plan_time_options` (2–4 future times ≤ 60 days) and `plan_time_votes` keyed by seat_key only (no user_id: the table is in the Realtime publication); `set_plan_when` (host), `set_time_availability` (members, until decided); at decide the most-ticked time becomes `event_time` unless the host set one. test:db 77/77. Applied on the local stack. |
| 074 | `migration-074-plan-seen.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead, owner-approved go-live); verified by function fingerprints against the local stack.** `plans.stage_changed_at` (trigger-stamped), `plan_access.last_seen_at` (default now()), `touch_plan_seen(uuid)` (own row), `my_plan_rail(int)` (security invoker, changed-first). Own security review: no C/H/M; two Lows fixed. test:db 95/95. Applied on the local stack. |
| 075 | `migration-075-member-booking.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead; owner: "apply any migrations").** Verified: claim/release/mark_booked security definer, execute for authenticated only (anon false), booking_result no client grant, my_plan_rows returns my_booking; Scoopi Cafe and Garage Dubai private, Iris Harbour vibes/Lounge, Tresind Palm Jumeirah. |
| 076 | `migration-076-places-backfill-ids.sql` | **yes — applied live 2026-09-27 via Supabase MCP (lead; owner approved "high + likely" place ids).** 62 curated spots (32 high, 27 reviewed, 3 hand-checked: Cove Beach, QDs, AquaFun); rejected: O Beach, Sky Views Edge Walk, Cocoa Room, Scoopi Cafe, Anantara, Bla Bla, Garage Dubai, Terra Solis. Verified: 62 ids, 62 distinct, 0 on non-curated rows. Review file deleted (Google content). |
| 077 | `migration-077-visitor-photos.sql` | **yes — applied live 2026-09-28 via Supabase MCP (lead; owner: "apply any migrations").** consume_otp_limit gains 'place-photo-anon' (40/min, 120/day per hashed IP; visitors take the shared 'place-photo-global' counter to 200 of 300). Verified: body has the scope, security definer, execute anon+authenticated (as 072). Security review (B): Medium + Low fixed. |
| 079 | `migration-079-venue-photos.sql` | **yes — applied live 2026-09-28 via Supabase MCP (lead; owner: "apply any migrations"), after the deploy carrying public/venues.** 17 self-hosted Wikimedia Commons photos (CC BY / BY-SA, licences read from the Commons API). Verified: all 17 URLs 200 on live; curated with own photo 6 → 23; photographable (own or Google) 64 of 76 visible. |
| 049 / 051 | `migration-049-hide-voter-user-id.sql`, `migration-051-hide-creator-user-id.sql` | **yes — applied live 2026-09-19 13:20Z via Supabase MCP (T0), owner-approved.** Confirmed 2026-09-26 by `list_migrations` (`migration_049_hide_voter_user_id`, `migration_051_hide_creator_user_id`). This row said "NOT applied" for a week because the entry recording it lived only on the unpushed `ai-engineering`. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

`docs/archive/worklog-archive.md` holds everything before go-live (through
the 2026-09-27 go-live checkpoint). Read it only when chasing *why*.

## 2026-09-27 — Lead: WE ARE LIVE (main on plan-ind.vercel.app)

070 fingerprint resolved: 22 of 23 columns identical across the 49 shared
curated rows; only `minimum_age` differs, and live is stricter (21+ vibes and
beach, 18+ shisha from live-only migration 013; 070's greatest() kept them).
`vercel.json` no longer blocks `main` (2253c84); the push deployed production
(dpl_C2E6XaT9Qk6ipDheQD25kVd7jz4N). Verified on the live URL: / /demo
/demo/vote /login /privacy /terms /api/health all 200, health reads the DB,
the new landing renders, a signed-out plan link 307s to /login with `next`,
CSP and Permissions-Policy (geolocation=(self)) present. 075 being applied.
Owner still to do: turn off anonymous sign-ins, then set the Turnstile
secret; Google OAuth in progress. Owner direction: bold UI experiments with
the impeccable skill, standards advisory, on `lane/frontend-exp` only.
- **Hydration fix (d1c0eb9):** PhotoWall and WeightRise rendered their first frame
  from useReducedMotion(); now server and client agree. First post-go-live
  push; auto-deployed and verified on the live URL.
- **075 additions (staged) + perf fix 1 (f411aeb):** mark_booked for the claim
  holder or host, one result shape for claim/release/mark (test:db 108); the
  landing hero now paints from first paint instead of waiting for hydration
  (baseline mobile LCP 10.47 s, 92% render delay). Fixes 2 (images), 3 (JS),
  the Realtime readiness race and a coalesce test flake running as a workflow.
- **Workflow batch merged (b610d98):** our own Supabase spot photos go through
  the image optimiser (remotePatterns pinned to the project host and the
  spot-photos path; Google photos stay unoptimised per ToS), the wall no
  longer preloads every tile; account views are lazy off the signed-out
  landing (-81 KB raw, -21 KB gzip); Realtime refetches once postgres_changes
  reports ok, closing the subscribe-then-miss race; the coalesce test runs on
  mocked timers. Gate: tsc, 299 unit, lint, build green. A "winner photo has
  no credit" finding was false (DecidedPlan renders PhotoCredit after the
  reveal) and was dropped. Merged worktrees removed.
- **Perf batch measured (live, Lighthouse 12, median of 3, same runner as the
  baseline):** home mobile perf 72→81, LCP 10.47→4.60 s, TBT 202→64 ms; home
  desktop 91→98, LCP 2.07→1.14 s; demo desktop 91→98; JS 323→300 KB. A paired
  alternating local run (5 reps) confirms the JS drop and demo-mobile LCP -7%;
  it cannot show the image fix, whose photos point at the live host.
- **075, 066, 076 applied live** (ledger above); P35 merged (8d2277f).

## 2026-09-28 — Lead: redesign "night-listings magazine" (owner: "go all out")

Impeccable direction (seed 571d077f, code-led; contract in the local-only
.impeccable/surfaces brief; PRODUCT.md local-only). Owner answers: audience
everyone, all screens, nothing off limits, place ids approved.
- **Photos everywhere:** VenuePhoto (own photo first, else the matched
  Google place's, fetched per card near the viewport); 076 ids + 077 visitor
  quota live. Verified live signed-out: 12/12 photo calls 200, 0 errors.
- **1/5 tokens + type (f08b0e0):** Archivo variable replaces Cormorant +
  Hanken (90 KB vs ~240 KB); paper/ink, souk-gold fill, coral live; every
  text pair re-measured; tokens.css 26 -> 12 KB.
- **2/5 landing cover (6581478):** photo mosaic behind a poster-scale cover
  line, gold issue band with real counts; card-stack deleted.
- **3/5 vote (2f588e1):** name over the photo, the bracket wired into the
  final, gold primary; fixed the current round's label vanishing once picked.
- **Lanes:** A on 4/5 (signed-in pages); B on 078 (booking F1/F2/F6); an
  agent is sourcing CC-licensed venue photos for 079 (own photos cost nothing
  per view; Google's are capped at 300/day).
- **Outage, found and fixed:** every /place/[id] rendered its error boundary
  in production from ef84c2b (VenuePhoto) until 222f732, roughly 2 hours on
  2026-09-27/28: the place page (a server component) called hasVenuePhoto,
  exported from a "use client" module. tsc, lint, unit tests and the lead's
  screenshots (landing and vote only) all passed; B's E2E caught it. Fix
  (B): pure helpers in lib/venue-photo.ts; rule added to app/CLAUDE.md.
  Verified live: 3 place pages 200 with photo and credit, no console errors.
  Also from B: the photo route answers "nothing to show" with 200 null (no
  console noise), CI pins the Supabase CLI (a "latest" lookup hit the GitHub
  rate limit and failed test-db).
- **Finish review (impeccable) of landing + vote, two rounds, stopped at the
  unattended budget:** fixed credits (full wrap, none under the headline),
  band (greeting + Dubai date), wall as listings, vote listings on the ground
  (no hairline boxes, coral pick, gold winner, one fact line), gold section
  heads, kickers out; A fixed the composer overlap and dead column. Declined:
  mono face and tally needles (owner: "don't over engineer"), photos on the
  tiny dealt squares (no room for a visible credit). Cover revised to a split
  (cover line on ink, mosaic right) so no photo hides under the headline.
