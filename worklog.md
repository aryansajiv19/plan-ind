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
| 061 | `migration-061-vote-integrity-and-guest-limits.sql` | **NOT applied — staged 2026-09-24, needs owner approval and a `security` review.** Deletes duplicate votes/RSVPs/ratings per user first (keeps latest); back up or count the three tables before applying. Verify: three `*_user*_key` indexes in `pg_indexes`, new policies in `pg_policies`. |
| 062 | `migration-062-plan-share-preview.sql` | **NOT applied — staged 2026-09-24.** `plan_share_preview(uuid)` for link previews: title, status, stage, deadline, host first name, spot count; callable by `anon`. Needs a `security` review, then owner approval. Link previews fall back to a generic card until it is live. |
| 063 | `migration-063-google-place-ids.sql` | **NOT applied — staged 2026-09-24.** `spots.google_place_id` (format CHECK, curated-only CHECK, partial unique index) + `places_synced_at`, column SELECT grant; `consume_app_quota` gains `place-photo` (60/min, 600/day, 300/day global). Proven on local PG16 (shim + schema + seed, applied twice, negative controls). Needs `security` review, then owner approval. Generated `places-backfill-*` migrations follow it. |
| 049 / 051 | `migration-049-hide-voter-user-id.sql`, `migration-051-hide-creator-user-id.sql` | **NOT applied — next in the queue, and now unblocked.** They were gated on the client deploy, which happened 2026-09-18. Verified still pending: `authenticated` can still SELECT `votes.user_id`. Needs the owner's approval like every migration. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

`docs/archive/worklog-archive.md` holds everything before the 2026-09-18
deploy entry below. Read it only when chasing *why*.

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

## 2026-09-24 — Lead session: audit, docs consolidation

Fresh cloud session. **`main` is 504 commits behind `ai-engineering`**, and
production runs `d536b6f`, which is not on GitHub (two unpushed local commits,
including "Cards say why this place, not just what it is"). Work continues on
`claude/jolly-hypatia-hj9vhp` (branched from `ai-engineering` 5044920);
nothing is pushed to `main`/`ai-engineering` until the owner pushes, because a
push there may deploy over production.

Three independent audits (code health, security, product/UX) ran against
5044920. Findings are queued in `PRIORITIES.md`. The one HIGH, verified by hand:
`cast_plan_vote` keys a vote on a caller-chosen participant hash, so one
session can cast unlimited votes.

Docs consolidated: 16 root docs → 5 (`CLAUDE.md`, `AGENTS.md`, `README.md`,
`PRIORITIES.md`, `worklog.md`); reference docs moved to `docs/`, history to
`docs/archive/`; `graphify-out/` (2.2 MB, two weeks stale, and the root
`CLAUDE.md` told every session to navigate by it) deleted and ignored; README
rewritten from create-next-app boilerplate; stale v1 claims removed from agent
briefs. Sandbox cannot reach Supabase or the live URL (network policy).

## 2026-09-24 — backend: migration 061 STAGED (unapplied) + two route/SSRF fixes

`supabase/migration-061-vote-integrity-and-guest-limits.sql` is **written, NOT
applied anywhere** (live DB unreachable from this session). It makes the auth
user the ballot key (unique `votes(plan_id,user_id,phase,pool_number)`,
`rsvps(plan_id,user_id)`, `ratings(plan_id,user_id)`, partial on user_id not
null) so one session can no longer mint hashes/names for extra votes; it
**first deletes duplicates, keeping the latest row per key**. `cast_plan_vote`
now refuses after `plans.deadline`; names go through `clean_display_name`;
guests cannot upload to `visit-photos`; `visit_photos` rows/files need a
session. Mirrored at the end of `schema.sql`. App: `/api/smart-search` refuses
guest sessions like `/api/plans`; `safeFetch` checks every resolved address and
pins the connect to it; `ip-guard` covers NAT64, 6to4, IPv4-compatible,
hex-mapped, 192.0.0.0/24, 198.18.0.0/15. Apply 061 only with owner approval,
then verify by catalog probe (`pg_indexes` for the three `*_user*_key` indexes).

## 2026-09-24 — backend: C1 profile once per account, C2 curated-catalogue cache

No schema change. **C1:** `/home` reads `people` by `auth_user_id` first
(`lib/own-profile.ts`) and calls `ensure_authenticated_profile` only when no
row exists; `AuthProfileBridge` now caches the server-resolved profile with no
network (RPC fallback only if the server got none). **C2:** `lib/spots/catalogue.ts`
wraps curated reads in `unstable_cache` (1h, tag `spots:curated`, key includes
the deployment id) through a sessionless anon client, so only
`source='curated'` rows are ever cached; age/budget/been filters still run per
request in `dealSpotIds`; `/home` Discover merges cached curated with a live
non-curated read. Invalidation: a deploy or TTL; no revalidate route by
design. Measured (prod build, stub Supabase counting requests, warm cache):
landing 1→0, `/home` server 13→12 (+ browser 2→0), deal 6→5 round trips.

## 2026-09-24 — backend: Google Places pipeline built, fixture-proven (no key yet)

`npm run places:backfill` (dry-run by default, never writes a DB): Text Search
(New) per curated spot with a pinned Enterprise field mask, name-F1 +
distance matcher (`high` only when name and the spot's own pin agree within
300 m, and no rival branch), venue `og:image` via new `safeFetchImage`
(SSRF-pinned, 5 MB refuse-not-truncate, magic-byte sniff) → review file →
`--write-sql` (offline) emits staged ids/photos migrations. Terms decision:
only `place_id` stored; Google photos via `GET /api/spots/{id}/photo`
(short-lived `photoUri` + attributions, `no-store`, quota-capped). Cost: 82
requests, $0 in free tier / $2.87 worst case. Proven with fixtures + loopback
mock server and PG16; the live `og:image` fetch was not exercisable from this
sandbox (egress 403). Owner runbook: end of `docs/PLACES_INGESTION_SCOPE.md`.
UI still has to call the photo route and render attributions (frontend lane).
