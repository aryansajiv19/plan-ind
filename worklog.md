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
| 049 / 051 | `migration-049-hide-voter-user-id.sql`, `migration-051-hide-creator-user-id.sql` | **yes — applied live 2026-09-19 13:20Z via Supabase MCP (T0), owner-approved.** Confirmed 2026-09-26 by `list_migrations` (`migration_049_hide_voter_user_id`, `migration_051_hide_creator_user_id`). This row said "NOT applied" for a week because the entry recording it lived only on the unpushed `ai-engineering`. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

`docs/archive/worklog-archive.md` holds everything before the 2026-09-26
hand-off entry below. Read it only when chasing *why*.

## 2026-09-26 — Lead session: hand-off (read this first)

**Branches.** `main` = `claude/jolly-hypatia-hj9vhp` = everything below;
`vercel.json` stops `main` auto-deploying (owner: `main` is truth, not live
yet). Production still runs `d536b6f` (2026-09-20, CLI deploy from the owner's
laptop, **not on GitHub**). Its only unique content: a `components/Turnstile.tsx`
fix for a challenge that never paints (seen live on `/login`) and a lazy
`lib/supabase.ts` client; its card-reason change is superseded by the "Why
this?" chips. When the owner pushes `ai-engineering`, merge it into `main`
(expect conflicts in `worklog.md`, `PRIORITIES.md`, `OptionCard.tsx`,
`globals.css` → now `app/styles/*`). If it never arrives, re-implement the
Turnstile timeout. Merged `lane/*` branches still exist (branch deletion needs
the owner).

**Next session, in order.**
1. If the owner has connected the Supabase connector (or set
   `SUPABASE_ACCESS_TOKEN` + allowed `api.supabase.com`/`*.supabase.co`),
   apply the approved migrations in order **049 → 051 → 061 → 062 → 063 → 064
   → 065**, one at a time, verifying each by catalog query and recording it in
   the ledger above. Count/back up votes/rsvps/ratings before 061 (it dedupes).
   064 must never be live while production still runs the old client (it
   breaks guest share links): apply 064 only together with deploying `main`.
2. Owner go-live: remove the `main: false` line from `vercel.json`, deploy
   `main` to production, verify on the live URL (`docs/DEPLOYMENT.md`): sign
   up, create, share, vote, decide. Turnstile hostname + secret must be done
   first or sign-in is impossible.
3. With the Places key: runbook at the end of `docs/PLACES_INGESTION_SCOPE.md`,
   then B3/B6 in `PRIORITIES.md` (photo fallback UI + full-bleed winner).

**This sandbox, as found.** Outbound network allows npm/GitHub/googleapis
but blocks `*.supabase.co`, `plan-ind.vercel.app`, `api.open-meteo.com`. Docker
works: the local Supabase stack + browser E2E recipe is in `tests/README.md`
(`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
chromium + "Mobile Chrome" only). Without Docker, plain Postgres 16 + 
`tests/supabase-shim.sql` + `schema.sql` runs `test:db` and proves migrations
(apply each twice). Vercel MCP can read deployments/env names but its file
reader truncates large files. Never `pkill -f` a pattern that can match your
own shell.

**Verified at hand-off (06fddbe+):** unit 250/250; `test:db` 12/12; E2E
chromium 91/0, Mobile Chrome 92/0 (33 skips: visual baselines not generated +
one mobile-only check); CI green on every branch push; lint/typecheck/build
clean. Every change this session had an independent `security` review; all
findings fixed or recorded (accepted: a `delete_my_account` race that rolls
back safely; moodboard `visibility` values are stored but unused).

**Owner decisions recorded:** sign in from the start (064); all staged
migrations approved; `main` is truth but not production.

## 2026-09-26 — Lead: `ai-engineering` merged into `main`; 049/051 were already live

The 9 commits production runs (`d536b6f`, `ed5f1d0`) were on the owner's laptop
and are now pushed and merged. Kept: the Turnstile no-paint timeout
(`components/Turnstile.tsx`), the option-card layout fix (identity-only category
chip that truncates, "leading" on its own line, action row pinned with
`mt-auto`), `/demo` in the layout suite, the eslint ignores for installed
skills. Dropped as superseded by `main`: the anonymous-guest path in
`lib/supabase.ts` and the plan page (sign-in-first), the card's reason chips
(`dealReasons` chips), tracked `graphify-out/`.

Facts that only existed on that branch: 049 and 051 were applied live on
2026-09-19 (ledger fixed); the owner added `plan-ind.vercel.app` to the
Turnstile hostnames on 2026-09-20; Turnstile is **not enforced server-side**
(live anonymous sign-in succeeds with no captcha token, so the Supabase secret
is not set). Live Auth settings 2026-09-26: `google: false`, `email: true`,
`anonymous_users: true`.

## 2026-09-26 — Lead: 061, 062, 063, 065 applied live; 064 held for go-live

Applied one at a time via Supabase MCP from the files, each verified by catalog
probe (ledger rows above). 061's dedupe removed nothing (3 votes, 0 rsvps, 0
ratings live). 064 is the only staged migration left; it ships with the `main`
deploy. Independent `security` review of the live catalog running.

## 2026-09-26 — Lead: skills and plugins for this repo

The design set kept by hygiene pass 5 had been living only in a stale worktree,
so no session had it. Installed at user level (every worktree sees them, ~150
tokens total): `emil-design-eng`, `review-animations`, `design-taste-frontend`;
routing rule in `AGENTS.md`. The other 32 skills in that pack (image gen,
slides, mobile, brand) stay out. `.claude/settings.json` turns off, for this
project only, plugins it doesn't use or already duplicates: vercel (~6k tokens
a session with its start-up hook; the `vercel` CLI covers deploys), feature-dev,
code-simplifier, superdesign, claude-code-setup, skill-creator, ralph-loop,
commit-commands. Kept: supabase, superpowers, pr-review-toolkit, ponytail,
playwright, context7, typescript-lsp, frontend-design, security-guidance,
claude-md-management, code-review, github. Re-enable any by deleting its line.


## 2026-09-26 — Platform lane: merge gate for 4c7a320 passed

E2E on a local stack (own project id, prod build), chromium + Mobile Chrome
**213 passed / 0 failed** (33 skips: visual baselines not generated + one
mobile-only check). A one-off 521–559px sweep on `/demo` and signed-in `/home`
found no horizontal overflow, so the old nav bug is gone without porting its
fix. Option-card Select buttons share one baseline at ≥768px; in the narrow
one-card carousel the "leading" card is 6px taller (cosmetic).

## 2026-09-26 — Lead: security review of today's live state

Independent `security` review of 061/062/063/065 live with 064 not, plus merge
4c7a320: no new High/Medium. Lead ran the catalog checks the reviewer could
not: every security-definer function's anon/authenticated grant matches its
file; all seven visit-photo policies are `{authenticated}`. Open until
cutover (both pre-existing, both close when anonymous sign-ins are turned off
after the deploy): extra ballots via free guest sessions on a shared link, and
guests draining the global Luna quota (300/day). Ordering trap recorded in
PRIORITIES O2/O4: the Turnstile secret must be set AFTER `main` deploys.


## 2026-09-26 — Frontend + platform lanes merged; README; one dev server

- **B6 (partial):** the decided screen shows the faces and names of who picked
  the winner in the final (`pickedBy`, no "of N": the roster is a lower bound).
  Sharing was already complete. `DecidedPlan.tsx` 473 → 233 lines
  (`components/vote/{WhosIn,Booking,Rating}Section.tsx`, pure move).
- **Landing / demo polish:** hero deck shows a real venue photo with its
  licence credit; `/demo`'s wall uses the cached curated catalogue (it showed
  an empty state to every visitor); secondary CTA is "See a sample vote".
- **Context hygiene (platform lane):** agent docs −2.9k tokens, directory
  `CLAUDE.md` −0.6k; false rules removed (021 "unapplied", "share link dead",
  old votes key, "deadline unenforced"); dead npm aliases dropped;
  `supabase/APPLY_RUNBOOK.md` (a second, orphaned ledger) archived.
- **Go-live compatibility sweep** (workflow, 4 finders + skeptics): 146 Supabase
  call sites in `main` checked against the live catalog, 0 mismatches.
- **README** rewritten in the owner's voice (no jargon, no dashes).
- **One dev server:** `:3000` serves `main` against the local stack
  `plan-ind-frontend` (127.0.0.1:55021), reloaded from `schema.sql` + seeds +
  039 locally. The stale `:3000` from `~/plan-ind-frontend` pointed at
  production and was stopped.
