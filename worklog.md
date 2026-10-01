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
| 078 | `migration-078-booking-fixes.sql` | **yes — applied live 2026-09-28 via Supabase MCP (lead; owner: "apply any migrations").** Stale unbooked claims cleared (delete_my_account, mark_booked(false), host patch), host can release any unbooked claim, a post-decision holder can't mark a reopenable plan booked. Pre-apply cleanup count 0. Verified: live fingerprints of the 4 functions equalled main's schema.sql before, and equal a local apply of the file after (b6d5ff9b / d7e6cb8a / 1e70e687 / 76ff0947); grants authenticated only. Security review (B): Medium + Low fixed. |
| 079 | `migration-079-venue-photos.sql` | **yes — applied live 2026-09-28 via Supabase MCP (lead; owner: "apply any migrations"), after the deploy carrying public/venues.** 17 self-hosted Wikimedia Commons photos (CC BY / BY-SA, licences read from the Commons API). Verified: all 17 URLs 200 on live; curated with own photo 6 → 23; photographable (own or Google) 64 of 76 visible. |
| 080 | `migration-080-remove-plan-member.sql` | **yes — applied live 2026-09-28 via Supabase MCP (lead; owner approved in session), after a security review (2 Lows folded in).** Host removes a member and it sticks: `plan_removed_members` (RLS, zero policies, not published), `remove_plan_member` (definer, authenticated only), `claim_plan_access` refuses removed accounts, `enforce_plan_membership`/`set_time_availability` take the plan row in key share. Verified by catalog: grants, prosrc, prosecdef, publication. |
| 081 | `migration-081-folders.sql` | **yes — applied live 2026-09-28 via Supabase MCP (lead; owner approved in session) after a clean security review. Verified by catalog: RLS on, 1 policy, anon no select, 3 composite FKs, not published (PG 17.6).** Private `folders` (owner-only RLS, not published; names refused unless clean, unique per owner case-blind) and a nullable `folder_id` on visit_collections, moodboards and place_collections with a composite (folder_id, person_id) FK, so a list can only be filed in its own owner's folder; `ON DELETE SET NULL (folder_id)` un-files. test:db 127/127 on a fresh local stack. |
| 082 | `migration-082-spot-edits-and-anon-grants.sql` | **yes — applied live 2026-09-29 via Supabase MCP (owner approved in session). Catalog-verified: trigger present, UPDATE only on name/area/visibility, anon/authenticated grants gone.** Freezes an in-plan custom spot's details (visibility still editable); narrows spots UPDATE to name/area/visibility; revokes stray anon/authenticated privileges on five zero-policy tables. |
| 083 | `migration-083-member-photo-quota.sql` | **yes — applied live 2026-09-29 (owner approved); pre-apply body hash matched 063 exactly; catalog-verified.** consume_app_quota 'place-photo' for members 20→40/min, 60→150/day; the global 300/day unchanged. schema.sql already carries it; live does not. |
| 084 | `migration-084-expire-due-plans.sql` | **yes — applied live 2026-09-29 (owner approved); pre-apply expire_plan hash matched 069; catalog-verified: job scheduled, sweep/step not client-executable, table unpublished.** A pg_cron job every 5 min moves overdue open plans on via the same step expire_plan uses (advance_due_plan), skip-locked, per-plan savepoints, failures recorded in plan_sweep_failures (no client access) with a 1 h cooldown. Heads-up: live has one plan overdue since 2026-08-02; the first tick moves it on. |
| 085 | `migration-085-place-ranking.sql` | **yes — applied live 2026-09-29 via Supabase MCP (owner approved), after B's security review (no Critical/High; Mediums fixed). Catalog-verified: RLS + 1 read policy, no client writes, anon locked out, tighter visits insert, 4 triggers, unpublished.** Beli-style ranking (buckets, positions, 0–10 scores, answers), log_visit (5/day), community scores at ≥5 raters as bands. Owner-accepted residual: a mean moves when one more person ranks. |
| 086 | `migration-086-leaderboards.sql` | **yes — applied live 2026-09-29 (owner approved, public boards; place boards friends-only by the lead's privacy call). Catalog-verified: leaderboard authenticated-only, board_points internal, hide_from_boards owner-updatable, people unpublished.** Points derived from rows (curated places, voted plans ≥2 accounts, caps per Dubai day). Recorded: L2 area/month timing (accepted), L3 month points recyclable. |
| 087 | `migration-087-plan-create-cap.sql` | **yes — applied live 2026-09-29 (owner approved "whatever migrations"). Catalog-verified: trigger plans_create_cap present, enforce_plan_create_cap definer with no client execute, plan_create_counts RLS on with no client grants.** 50 plan creates per account per Dubai day, SQLSTATE PC429 → 429 in both routes. |
| 088 | `migration-088-crew-match.sql` | **yes — applied live 2026-09-29 (owner approved). Catalog-verified: crew_match/crew_streak definer, authenticated-only; crew_friend_account + category_group not client-callable; crew_rank_snapshots RLS on, no client grants.** Friends-only aggregates (B, security re-review: no Medium+). |
| 089 | `migration-089-catalogue-growth.sql` | **yes — applied live 2026-09-29 after the honest-budget-chip deploy (owner approved). Verified: 83 c0890000- rows, 165 curated spots, price_band nullable.** Hand-reviewed OSM venues; nothing from Google. |
| 090 | `migration-090-places-backfill-ids.sql` | **yes — applied live 2026-09-29 (owner: every place needs a picture).** 130 Google place ids (place id only, per Maps terms), from places:backfill with human review (6 wrong matches rejected). |
| 091 | `migration-091-venue-own-photos.sql` | **yes — applied live 2026-09-29, after the deploy that shipped the 17 files (checked 200).** Venue-own website photos, hand-checked. |
| 092 | `migration-092-photo-cap.sql` | **yes — applied live 2026-09-29.** Site Google-photo ceiling 300 → 1,500/day (visitors 200 → 1,200); grants unchanged (checked). |
| 093 | `migration-093-place-ids-second-pass.sql` | **yes — applied live 2026-09-29.** 14 more place ids from hand-read queries; The Lime Tree Cafe hidden (Google: permanently closed). 146/158 live venues now have a photo. |
| 094 | `migration-094-photo-caller-limits.sql` | **yes — applied live 2026-09-29.** Per-caller photo limits 40/min, 120-150/day → 120/min, 400/day (a 120-tile wall hit the minute limit); site cap unchanged at 1,500. Live wall: 110/120 real photos. |
| 095 | `migration-095-catalogue-growth-2.sql` | **yes — applied live 2026-09-29 via MCP in 8 insert chunks** (the file is 255 KB; price_band was already nullable). 391 hand-reviewed OSM venues across 17 districts, `on conflict do nothing`. Verified: 391 `c0900000-` rows; 549 visible spots. |
| 096 | `migration-096-catalogue-2-place-ids.sql` | **yes — applied live 2026-09-29.** Google place ids for 307 reviewed 095 matches (fills nulls, skips ids already held). Verified: 451/549 visible spots have a place id. |
| 097 | `migration-097-catalogue-2-own-photos.sql` | **yes — applied live 2026-09-29** after deploy 301be37 served the files (200). 35 venue own photos set. Verified: 35 `/venues/c09*` rows; 452/549 visible spots have a photo source, 97 still art-only. |
| 087 | `migration-087-plan-create-cap.sql` (lane/platform-plan-cap) | **no — STAGED, security-reviewed (no Critical/High/Medium).** 50 plan creates per account per Dubai day, enforced in the database. |
| 049 / 051 | `migration-049-hide-voter-user-id.sql`, `migration-051-hide-creator-user-id.sql` | **yes — applied live 2026-09-19 13:20Z via Supabase MCP (T0), owner-approved.** Confirmed 2026-09-26 by `list_migrations` (`migration_049_hide_voter_user_id`, `migration_051_hide_creator_user_id`). This row said "NOT applied" for a week because the entry recording it lived only on the unpushed `ai-engineering`. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

`docs/archive/worklog-archive.md` holds everything before go-live (through
the 2026-09-27 go-live checkpoint). Read it only when chasing *why*.

## 2026-09-28 — CHECKPOINT: stopped for the night by the owner (read this first)

**Live (main = production, auto-deploy):** migrations through 079 applied and
catalog-verified (078 by function fingerprints). Full flow works end to end:
email-code sign-in → compose → deal → vote (Realtime) → decide → claim/mark
booking (any member; host can clear) → directions, photos. 64 of 76 visible
venues photographable (23 self-hosted CC, the rest Google within the 300/day
cap). Redesign live on landing, demo, vote and the Plan tab.

**Resume tomorrow, in order (PRIORITIES "Now"):**
1. Frontend lane (A): the bolder composer pass (kinds of night as photo tiles,
   deck cards as photo listings, no grey panel, no dead band, readable helper
   copy), then decided plan, login/onboarding (Discover through the place page
   are built on the parked branch; review and merge them first). Lead reviews each surface with viewport captures
   (full-page captures smear sticky bars).
2. Platform lane (B): full-journey E2E on a throwaway stack + a signed-out
   Playwright sweep of the live URL.
3. Lead: resume the post-launch review workflow (stopped mid-run, cache kept):
   Workflow({scriptPath: ".../workflows/scripts/post-launch-review-wf_4c0cfe8f-46a.js",
   resumeFromRunId: "wf_4c0cfe8f-46a"}) in this session's project dir; fix
   what it confirms; security subagent on any RLS/RPC change.
4. Once the redesign lands: regenerate visual baselines once (CI dispatch,
   hold pushes while it runs), final CI green, live sweep, owner screenshots.

**Branches parked tonight (pushed, not merged):**
- `lane/frontend-redesign-app` @ 8092f18 (A): Discover, Been, Friends,
  Profile/Wrapped and the place page already redesigned on top of the merged
  Plan tab; app/styles +33 lines over main (A pays it back in the composer
  and decided passes). Lead reviews with viewport captures, then merges.
  A's next: composer pass (photo tiles need one small cached read per
  category group: approved), decided plan, login/onboarding.
- `lane/frontend-booking-078` @ eb2c82c: already merged (256bcb3).
- A's local lane stack has 079 applied and a decided plan (247bafed) kept
  for tomorrow's screenshots; local only.

- `lane/platform-journey` @ d87c079 (B): runtime-health sweep extended
  (/demo, /demo/vote, a credit on every venue photo); journey.spec written
  (onboarding → deal → join by link → rounds → decide → joined_after_decision
  and not_holder refused → booked). Next: onboarding selector (getByLabel
  "Date of birth" matches 2; use #onboarding-dateOfBirth), CI, hand back.
- `lane/platform-booking-fixes` @ b0b7e27 (B): the host-clears E2E after the
  078 merge; merge it tomorrow (matches A's "Clear the booking").
- Live signed-out sweep (B): 17 pass, 3 fail on one finding: Tresind
  Studio's photo (039, photo_source venue_site, no licence, no credit) shows
  on /, /demo and its page. Owner decision (below).

**CI state:** functional green except what the redesign changed in visual
baselines (24 visual failures expected until step 4). test-db 112+ green;
the Supabase CLI is pinned.

**Owner-only, still open:** Supabase Auth (anonymous sign-ins off → Turnstile
secret → Google provider); Routes API on the key's project; a Cloud budget
alert; Tresind Studio's unlicensed venue-site photo: keep it (the venue's own
promotional image) or drop it for its Google photo (credited). Lead's lean:
drop it, since the Google photo is credited and free of doubt. Estimate to "all together": ~6-10 working hours from resume.


## 2026-09-29 — Lead: original design back, day mode, Beli loop, our route map

- **Design:** owner rejected the new palette and the starry sky within the
  hour; back to the first desert design (7e51449 tokens), no stars/glows,
  hero is the navy cover in both themes. **Day mode** unparked: Dubai clock
  picks the ground, a nav toggle overrides (cookie `deal-three-theme`, server
  paints it). No decorative emoji anywhere (owner: looks cheap).
- **Beli, re-cut for groups** (derived, no migration): Been → "Your Dubai"
  (10 districts, 12 Dubai icons, next district); Profile → Plan Personality
  (evidence per trait, locked under 3 outings, share as text).
- **Route map** (`components/map/RouteJourney.tsx`): the way there draws
  itself with numbered steps, a travelling marker, Replay, Metro/Drive/Walk;
  shown wherever Google's route isn't (no browser key in prod yet).
- **Audit (Playwright, one agent):** no console errors/overflow; fixed art
  stars, sample photos, day map, contrast, badge, copy. Open: demo Discover
  is a stub vs the real one; "Plan" tab re-shows the landing.
- **CI:** baseline dispatch now `--update-snapshots=all` ("changed" kept
  stale dark baselines at threshold 0.2). Merged lane/platform-discovery;
  lane/platform-plan-cap (087) waits on the owner's apply.
- **Live data (owner approved):** 087 applied (runbook row). Coordinates for
  9 of 18 unplaced venues from OSM Nominatim, each checked against its area
  (address or host building; Bab Al Shams, Bounce, Padel Art rejected as
  wrong matches). Still unplaced: Bab Al Shams, Bounce, Garage, Kickers,
  Padel Art, Scoopi, SEVEN, Tresind, World Padel Academy (city map shown).
- **Demo:** /demo opens on the app's first screen with "See a sample vote",
  not the landing pitch; deck tiles get distinct covers or category art.

## 2026-09-30 — Premium polish pass (lead + vote lane, merged)

Owner brief: coherence, not a redesign. No features, palette, DB or voting changes.
- **One name: Planind.** Metadata, manifest, OG cards, nav, footer, share text,
  legal and error pages. D/03 retired (owner picked wordmark only); favicon is an
  italic P on sand. Storage keys, `deal-three-theme` cookie, calendar UID, domain
  and repo name unchanged on purpose.
- **Composer:** no card around it (fill, radius, shadow gone); describe-the-night
  is the one tinted surface; the UA fieldset border inside it reset.
- **Describe the night** replaces "Luna" in the UI; the result is one line of what
  the form took (`intentFacts`, lib/composer-intent.ts). Model and route unchanged.
- **Vote card (lane V):** cuisine chip in words, one fact line (price, distance,
  Leading), description/hours/metro/reasons behind "More"; unpicked cards recede;
  the next-round button sticks above the phone tab bar once the round has a pick.
- **Photo-less places:** CategoryArt prints the kind in the display serif instead
  of the desert-moon scene (Discover was a wall of identical moons).
- **Landing:** the sample group's faces under the hero CTAs. **Winner:** particles
  700 ms; the demo's decided screen leads with when, booking, who's in, getting there.
- Nav and wall notes solid (no backdrop blur). App CSS net -33 lines.
- Open: the landing group line sits below the fold on phones (the mosaic comes
  first there); docs/FRONTEND_DESIGN_STANDARDS.md colour/type tables are stale
  (Newsreader, palette v3); two demo fixture sets spell Maya/Omar differently.

## 2026-09-30 — Quiet refinement pass (reference-led: Beli, Apple Invites, Luma, Dorsia)

Only screens that failed "would Beli or Apple need this box?"; vote, hero,
composer, winner and nav left alone.
- **Friends:** leaderboard and crew match are ranked rows on the page (hairlines,
  numerals, your row tinted), not bordered panels of filled pills.
- **Been:** 17 districts as a two-column list, no dashed boxes (~1,100px to ~450px
  on a phone); every visit card alike; a plain upload target.
- **Discover:** photo-less tiles are short printed bands; generic cuisines
  (Restaurant, International, Regional, Multi) print the kind of night.
- **Saved:** one filled action per screen; "Plan from this board" is an outline.
- **Place page:** "Plan a night here" under the description; hero chip in words.
- **Test:** lead-features route replay raced a sub-100 ms blank caption (failed on
  main's code too, by time of day); it now asserts the reset to step 1 after the
  run passes step 1, which fails without Replay (checked on production).


## 2026-09-30 — Navigation and the last vibe-coded tells (impeccable critique, 20/40)

- **Hero bug:** the landing hero now follows the theme (day paper and night navy),
  so it no longer sits dark under a light nav. The day headline accent is copper
  (3.7:1).
- **Two actions, two names everywhere:** "Try the demo" (filled, /demo/vote) and
  "Start a plan".
- **Phones:** `--type-floor` is 0.75rem on every screen (tab labels were 9.9px).
  The banner link and the mini-map link now have 44px targets.
- **Tiles:** the category chip only shows over a real photo; before, it printed
  over CategoryArt's own word.
- **Folds (native `<details>`, `components/Fold.tsx`):**
  - Friends list people first; the leaderboard and crew match fold behind one
    line each.
  - Been: "Your Dubai" folds; "Add to collection" folds per visit.
  - Discover shows 24 places, then "Show more".
- **Quieter:** one-line hero band, one sample banner instead of per-heading
  suffixes, no-bounce press curve, 2px progress lines on no track, and
  placeholder and caret colours from the palette.
- Open: PRODUCT.md still says "Deal three" and describes Luna (report only).

## 2026-10-01 — Full UI audit after the owner found bugs by hand

Owner: half the places had no image, text touched borders, the map was dots.
Cause: pages were checked at one width and green CI was trusted; baselines had
been regenerated from the broken screens.
- **Bug scanner** (`tests/e2e/ui-scan.ts`, `ui-bugs.spec.ts`): fails on text
  within 5px of its box edge, overlapping or cut text, text under 11.5px, broken
  images, headings under the nav. Runs every public page, every sample-vote
  step, a new account's six views and real voting/decided plans (CI only), at
  1440/768/390, day and night. 750 findings became 0. Also run against live.
  Endpoint contract tests in `endpoints.spec.ts`.
- **Fixed:** decided panel padding (dropped in the 2026-09-30 polish pass), lock
  chip over the art word, giant photo-less winner name, headings under the nav
  (`scroll-padding-top` on html), double sign-in error, clipped category chips, a
  mistyped plan link claiming "this link works".
- **Type:** the device's system font (SF Pro / Roboto / Segoe), no italics, a
  small scale (`--type-title` 34px, `--type-section` 24px); no web fonts load.
- **Photos only** (owner decision): a curated place is listed or dealt only with
  a photo_url or google_place_id (`REAL_PHOTO_FILTER`, `lib/venue-photo.ts`);
  455 of 556 stay, every kind of night keeps at least 3. 101 places have no
  source (migration 095's rows); 454 of the 455 still depend on Google's per-view
  photo, which can fail on quota. Plans, visits and boards keep their places.
- **Map:** a drawn Dubai basemap from OSM (coast, Palm, creek, roads, districts).
- Open: source photos for the 101 hidden places; an empty family now 503s in
  `readFamily` instead of "too few" (cannot happen today); PRODUCT.md is
  gitignored (updated locally only).

## 2026-10-01 — Guest voting backend (lane/guest-vote), migration 099 STAGED

Owner direction: voters no longer need an account. NOT applied anywhere; the
apply is the owner's call. Design and threat table: `docs/GUEST_VOTE.md`.
- **099 (+ security fixes):** `guest_sessions` (anonymous session bound to one plan, 14-day expiry,
  20 per plan), `join_plan_as_guest` / `consume_guest_limit` (control secret),
  `issue_guest_merge_token` / `merge_guest_into_me`, `is_active_guest`; plan
  reads, presence and `cast_plan_vote` / `set_plan_rsvp` admit an active guest of
  that plan. A guest counts as age 13: adults-only plans refuse it. No new write
  policy. Mirrored in `schema.sql`; `lib/types.ts` gains the RPC result types.
- **Code:** `lib/guest.ts`, `POST /api/guest/join`, `lib/security/controls.ts`.
- **Tests:** `tests/guest-vote.dbtest.ts` (25), `tests/guest-join.test.ts`; 20
  sed mutants on a throwaway DB, all killed. Plain-Postgres shim only, not the
  Supabase stack.
- **Not done:** `proxy.ts` and the plan UI still send a guest to /login; the
  root `CLAUDE.md` identity invariant changes when 099 is applied.

## 2026-10-01 — Group preferences, database layer (migration 100, STAGED, not applied)

Lane gp-db, docs/GROUP_PREFS.md "Schema". `supabase/migration-100-group-prefs.sql`
(additive, re-run safe; the integrator may renumber):
- `plans.stage` gains `'gathering'`; `plans.group_summary jsonb` (granted to authenticated).
- `plan_preferences`: members SELECT their plan's rows, no write grant or policy, in `supabase_realtime`.
  A `plan_access` delete trigger removes a leaver's answers.
- RPCs: `create_gathering_plan` (permanent account), `set_plan_preferences` (any member, `auth.uid()` +
  `plan_access` only, so guests work), `start_group_plan` (creator only, 9 distinct places, stage-guarded).
  State conflicts return `{result:'not_gathering'}`; access and input errors raise 42501 / 22023.
- `gathering_origins()` holds the origin list in SQL; a dbtest compares it to `DUBAI_ORIGINS`.
- Tests: `tests/group-prefs.dbtest.ts` (9, 15 of 16 sed mutants killed; the survivor is an equivalent mutant).
