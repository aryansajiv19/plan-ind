# Deal three worklog

Last updated: 2026-08-24 (Asia/Dubai)

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
| 026 | `migration-026-otp-rate-limit.sql` | yes — applied live. |
| 027 | `migration-027-spots-name-index.sql` | yes — applied live. |
| 028 | `migration-028-friendships-rls-recursion.sql` | yes — applied live. |
| 029 | `migration-029-rls-auto-enable-capture.sql` | yes — applied live. |
| 030 | `migration-030-plan-command-quota.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `plan-command` scope present, 20/min·100/day, `anon` cannot execute `consume_app_quota`, `authenticated` can. |
| 031 | `migration-031-schedule-purge-cron.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `pg_cron` installed, `purge-security-operational-data` job scheduled at `17 2 * * *`. |
| 032 | `migration-032-fix-votes-legacy-index-drop.sql` | **yes — applied live 2026-09-04 via Supabase MCP (T0), owner-approved.** Verified: `votes_round_choice_unique` confirmed gone from `pg_indexes`; `votes_participant_round_key` confirmed present. Live correctness bug closed. |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

## Archived history

Everything from 2026-08-10 to 2026-08-11 (the v1 build-out: participant
identity seam, RSVP choices, host-command security, the early UI/UX and mobile
checkpoints, migration-order audits) has moved to `worklog-archive.md`. It is
history, not live state — read it only if you are chasing why something was
built the way it was. Live state starts below.

## Production-hardening implementation — 2026-08-19

### Implemented

- Added production HTTPS/HSTS, CSP nonces, security and cookie headers,
  restrictive permissions, CSRF protection, capped streaming JSON readers,
  origin/Fetch Metadata checks, and client helpers for protected requests.
- Added Cloudflare Turnstile to email OTP and anonymous shared-plan entry.
  Email requests use enumeration-resistant responses.
- Added Supabase anonymous guest sessions and migration-020 `plan_access`
  membership so shared plans and private Realtime Presence are plan-scoped.
- Replaced multi-write client plan creation with the transactional,
  server-authoritative `create_secure_plan` RPC. It enforces permanent auth,
  immutable age, exact same-category candidates and an allowlisted payload.
- Added Postgres-backed request quotas, including 30 AI searches per user/day
  and 300 globally/day, plus minimized security events and retention cleanup.
- Restricted social reads, durable profiles, custom spots, participant writes,
  storage MIME types and image sizes. Added client decode/dimension checks.
- Added Terms and Privacy pages backed by required production legal variables.
- Removed template-like skyline/confetti/grid/orb/shadow/hover decoration and
  rendered emoji avatars. Fonts are now self-hosted and open licensed.
- Upgraded Next.js and ESLint config to 16.3.1; resolved npm audit to zero.
- Added `tests/security.test.ts`, expanded smoke coverage and documented hosted
  configuration in `SECURITY_SETUP.md`.

### Database status

- Migration 020 exists locally and its end state is mirrored exactly in
  `supabase/schema.sql` (apart from the migration-only heading).
- Migration 020 is **not applied live**. Existing smoke checks prove the live
  migration-019 guards only. Follow `SECURITY_SETUP.md` for the migration,
  control-secret hash, Auth settings and cleanup cron.

### Verification

- ESLint and TypeScript pass.
- Focused security tests pass (sanitization, double-submit CSRF, JSON/content
  type/body caps).
- Next 16.3.1 production build passes across 15 routes with webpack.
- Expanded localhost smoke suite passes, including CSP/security headers,
  missing-CSRF 403, valid-CSRF unauthenticated 401 and all prior DB guards.
- `npm audit` reports zero vulnerabilities; `git diff --check` passes.
- Graphify update completed: 794 nodes, 1,245 edges, 68 communities.

## Cursor mobile-preview handoff — 2026-08-19

- `lirobi.phone-preview` 3.1.9 is installed in Cursor.
- `.vscode/settings.json` sets `mobile-preview.url` to
  `http://localhost:3001` and the device to iPhone 13 Pro.
- Local development omits X-Frame-Options, COOP/CORP and CSP frame-ancestors
  so the extension iframe works. Those protections remain enabled in
  production.
- The preview is in editor column two. Hide the Secondary Sidebar to free the
  right side. Keep the terminal visible and drag its upper divider downward;
  the extension auto-scales the phone according to remaining vertical space.
- Immediate next coding task: use this preview to audit real alignment,
  wrapping, overflow and safe-area behavior at phone width. Start with the
  home screen visible in the latest screenshot, then login, onboarding, all
  home tabs and a multi-round shared plan.

## Migration 020 applied + AI-engineering workstream opened — 2026-08-24

### Migration 020 is live. It was also an outage fix, not just hardening.

`app/api/plans/route.ts:48` calls `create_secure_plan`, which is defined **only**
in migration 020. Because 020 was unapplied, **plan creation had been broken
against the live project** — every attempt hit `PGRST202`, fell into the
`status = 500` branch, and returned "Couldn't start the plan." In production it
would have failed one step earlier, since `consumeQuota` fails closed when
`consume_app_quota` is missing (429). Nobody had noticed because no automated
check covered the 020 boundary.

Applying 020 exposed a **second, separate** failure: `SECURITY_CONTROL_SECRET`
was absent from `.env.local`, so `controlSecret()` returned the dev fallback
string, `consume_app_quota` rejected it, and plan creation returned 429 instead
of 500. The `PGRST202` escape hatch in `consumeQuota` no longer applies once the
function exists. **Both halves are now done:** a 32-byte secret is in
`.env.local` and its bcrypt hash is stored as `app_control_secrets.name =
'server-control'`. Verified matching.

The same value must be set as a server-only Vercel variable before deploying.

### Live verification (read-only probes with the publishable key)

| Probe | Result |
|---|---|
| `set_birth_date` (019 control) | `42501 Sign in first` — proves the probe method |
| `create_secure_plan` | `42501 A permanent account is required` — exists, body check reached |
| `claim_plan_access` | `42501 Authentication required` |
| `consume_app_quota` | `42501 Server authorization required` |
| `purge_security_operational_data` | `42501 permission denied` — correctly revoked |
| anon insert `plans` | `42501 permission denied for table plans` — REVOKE active |
| anon read `spots` | `[]` — the new `to authenticated` policy |
| `valid_control_secret(<real secret>)` | `true` — env and DB hash match |

`npm run test:smoke` 19/19 green. New `npm run test:smoke:020` 10/10 deployment
guards green (see defect 1 for the 11th).

**Method note for whoever probes next:** PostgREST resolves functions by exact
parameter-name set, so a wrong arg list returns `PGRST202` and looks identical
to a missing function. Always copy the signature out of the migration file. A
4-arg probe of `cast_plan_vote` (it takes 7) produced a false "missing" here.

Also do not test the control secret through `consume_app_quota`: its guard is
`not valid_control_secret(...) or uid is null or ...`, so an unauthenticated
call raises the same `42501` whether the secret is right or wrong. That produced
a false "secret rejected" conclusion in this session before it was caught.

### Defect 1 — `valid_control_secret` is an anon-callable brute-force oracle

**Open live. Migration 021 is committed locally but unapplied.** Found by
`qa-test`, reproduced
live with nothing but the publishable key and no session:

```
POST /rest/v1/rpc/valid_control_secret {"p_secret":"definitely-not-it"} -> 200 false
POST /rest/v1/rpc/valid_control_secret {"p_secret":"<real secret>"}     -> 200 true
```

An unauthenticated, unmetered oracle confirming whether a guessed value is the
server-control secret that gates `consume_app_quota` and `record_security_event`.

**Root cause, and it generalises:** migration 020 line ~352 does `revoke all on
function valid_control_secret(text) from public;`. Supabase's default privileges
already granted EXECUTE to `anon` and `authenticated` **by name**, and revoking
from `PUBLIC` does not cancel a named grant. Line ~418 of the same file gets it
right — `revoke ... from public, anon, authenticated` — and that function does
correctly answer `permission denied`.

The same root cause leaves `create_secure_plan`, `claim_plan_access` and
`consume_app_quota` executable by `anon`. Those fail *safe* today only because
each body checks `auth.uid()` first. `valid_control_secret` is the one that
leaks, because it returns a boolean instead of raising.

Practical risk today is low — the live secret is 256 bits of entropy. The danger
is that every `revoke ... from public` line in 020 reads as protection it is not
providing.

### Defect 2 — share-link "plan not found" flash (fixed in `470ca28`)

The load previously ran before `bootstrapAccess` completed anonymous sign-in +
`claim_plan_access`. Post-020 RLS hid that pre-claim read, so `.maybeSingle()`
returned `{data: null, error: null}` and the page treated it as missing.
`470ca28` makes the load wait for `access === "ready"` and keeps the checking
state ahead of not-found. Live browser verification remains blocked while
anonymous sign-ins are disabled.

### OpenAI status — verified, blocks the AI phases

| Check | Result |
|---|---|
| Key | valid, `GET /v1/models` 200 |
| `gpt-5.6-luna` (`smart-search/route.ts:14`) | **real**, present in the account's model list |
| `text-embedding-3-small` | available |
| **Credits** | **ZERO** — a 1-token embeddings call returns `429 insufficient_quota` |

Backfilling the whole spot catalog would cost roughly **$0.0002** (~100 spots ×
~60 tokens). A minimum top-up unblocks RAG, tool calling and the trace demo.
Do not report AI behaviour as working off a 429.

`https://api.open-meteo.com` verified working with **no API key and no SDK**,
correct `Asia/Dubai` timezone — that is the weather tool for the agent loop.

### Verification

- `npm run test:smoke` — 19/19 green against localhost:3000
- `npm run test:smoke:020` — 10/10 deployment guards green, 1 red (defect 1)
- Migration 020 confirmed live by direct probe, not by assumption

## Shared-plan race fix + real-data Wrapped — 2026-08-24

- `470ca28` fixes the post-020 access race: the plan read waits for access to be
  ready and the render shows the checking state before not-found. Anonymous
  sign-ins are still disabled live, so the shared-plan path is not browser-
  verifiable and remains unavailable to guests.
- `3d07a6a` moves Wrapped into the signed-in Profile and computes the current
  `Asia/Dubai` month from real plans, visits, group labels, ratings and spots.
  It has deterministic ties, honest empty/error states, group-rating labeling,
  partial-stat omission, and accessible Web Share/clipboard feedback.
- Security review kept all aggregation behind authenticated, RLS-scoped reads
  and introduced no schema or new client write path. Friend invites were not
  wired: typed RSVP companion names are not account identity, and direct
  symmetric friendship creation lacks consent. Reserve 022 for pgvector and
  023 for the account-link/request/acceptance seam.
- Verification passed: lint, TypeScript, 3/3 security suites, 8/8 Wrapped tests,
  the 15-route production build, normal smoke, and `git diff --check`.
  `test:smoke:020` remains red only because migration 021 is unapplied.
- Live blockers rechecked: anonymous sign-in is disabled;
  `valid_control_secret({"p_secret":"wrong"})` returns `200 false`; and the
  one-token embeddings call returns `429 insufficient_quota`. AI behavior is
  not live-tested.

## Blocker re-probe + two corrections — 2026-08-24 (later)

### All three blockers re-probed live and still open

| Blocker | Probe | Result |
|---|---|---|
| Migration 021 | `valid_control_secret {"p_secret":"wrong"}` | `200 false` — **oracle still live, not applied** |
| Anonymous sign-ins | `POST /auth/v1/signup {}` | `422 anonymous_provider_disabled` |
| OpenAI credits | 1-token `text-embedding-3-small` | `429 insufficient_quota` |

The share-link vote path remains dead, so `470ca28` still cannot be
browser-verified.

### Correction: the client-supplied `age` was NOT a security hole

An earlier note in this session described the client-supplied `age` in
`lib/deal.ts` as a live hole that moving retrieval server-side would close.
**That was overstated. Recording it so it does not propagate.**

`create_secure_plan` enforces age properly server-side: it reads `age_value`
from the server-owned write-once `member_ages` table (not from the request),
applies the 18/21 category thresholds, and rejects the plan unless **all nine**
spots satisfy `age_value >= greatest(s.minimum_age, category threshold)`.
Plan creation is correctly gated. A tampered client-side age changes what the
picker *displays*, not what can be created.

The honest reasons to move retrieval server-side are: RAG requires it (a browser
cannot embed a query — the OpenAI key is server-only), and `lib/deal.ts`
currently ships the whole candidate pool plus every matching `ratings` row to
the client on every deal.

### Finding — age-restricted venues are enumerable. Owner decision, not fixed.

`read permitted spots` (migration 020, line 68) has **no age predicate**:

```sql
create policy "read permitted spots" on spots for select to authenticated using (
  source = 'curated' or visibility = 'community' or ...
```

Any authenticated account — including a 13-year-old — can list every
`source = 'curated'` spot straight from `GET /rest/v1/spots`, 21+ nightlife
venues included. Moving `lib/deal.ts` server-side does **not** change this;
only an age-aware policy would.

Severity is catalog visibility, not an authorization bypass — plan creation is
properly gated (above). Fixing it means joining `member_ages` into the policy,
which costs a lookup on **every** spots read. Owner chose to record and defer.

### Note for the next probe

Two probe traps already produced false conclusions in this project; both are
documented in `NEXT_AGENT.md`. A third to add: `consume_app_quota` cannot be
used to test the control secret, because its guard is
`not valid_control_secret(...) or uid is null`, so an unauthenticated call
raises the same `42501` either way. Use `valid_control_secret` directly — which
is possible only because migration 021 is still unapplied.

### Server-side dealing landed — `0de2fc8` + tests

`lib/deal.ts` (112 lines, browser) → `lib/spots/match.ts` (pure core + I/O
shell) + `app/api/spots/deal/route.ts`. `lib/deal.ts` is now a 40-line
`secureJsonFetch` wrapper with byte-identical exported signatures, so
`components/StartPlanForm.tsx` is **unchanged** — `getBeen()` still runs in the
browser inside `deal.ts` and rides along in the request body.

**Equivalence was proved, not assumed.** A fixture parity harness ran the
pre-move algorithm verbatim against `dealFromPool` with a seeded RNG across 8
cases (baseline, exclude+age 18, age 13, budget, vibe keywords, avoid keywords,
origin/radius, and the `< count → null` path). Identical output on all 8.
`tests/spots-match.test.ts` adds 14 tests; the suite is now 25 (3 security +
8 wrapped + 14 dealing) under a consolidated `npm run test`.

Deviations from the original spec, both deliberate: `readJsonBody` cap is 16 KB
not 4 KB (200 uuids is ~7.5 KB on its own, so 4 KB would 413 anyone with a real
`been` list), and a missing `memberAge` falls back to `MIN_ACCOUNT_AGE` (13) —
fail closed, not open.

**No quota on this route yet.** `consume_app_quota` accepts only
`smart-search | plan-create | place-import`, and borrowing `plan-create` would
spend the plan bucket on re-deals and lock users out of creating a plan. The
route is an authenticated RLS-scoped read with no writes and no external I/O.
A `"spot-deal"` scope rides along with migration 022.

**The `SpotAffinity` seam** is `(spot) => number | null`, applied as
`embed(spot) ?? keywordScore(spot)` to rows that have **already passed every
filter** — it can reorder survivors, never admit one. That is the structural
guarantee that similarity can't bypass the age gate.

#### Correction: the sort comparator is fine

The implementing agent flagged the comparator as "not a consistent ordering."
**It is consistent.** Expanding it:

```
categoryBias*2 + affinity(b) - affinity(a) + score(b) - score(a)
  = (2·[b matches] + affinity(b) + score(b)) − (2·[a matches] + affinity(a) + score(a))
  = k(b) − k(a)
```

It is a single-key descending sort — antisymmetric and transitive. No action.
Recorded so the false concern doesn't get "fixed" later.

## T2 Frontend — Wave 1 FE.1 + FE.2 + FE.8 committed — 2026-09-01

Found the full FE.1/FE.2/FE.8 implementation already written but uncommitted in
the tree (a prior session's work, mixed with T1/T0 changes). Verified and
committed the frontend-owned files rather than rewriting.

- **FE.1 (`ba6ba6b`)** — signed-out `/` renders the marketing hero
  (`<HomeExperience demoMode />`) instead of `redirect("/login")`. New `fixtures`
  prop keeps invented friends/visits/photos on the dev-only `/home-preview` only;
  `accountTabs` gate hides the tab bar / avatar / account views when there is no
  account behind them, showing a "Sign in" nav link instead.
- **FE.2 (`9bd4042`)** — `--token-shadow` (graphite day / brass night, contrast
  measured in comments); `.token` signature restored on the vote card
  (`OptionCard`) and primary commit actions; hover-lift gated behind
  `@media (hover: hover)`. The end-of-file restraint block was deleted (it
  cancelled hover `transform` on every control and re-killed the signature) and
  replaced with a note — aligns with the owner's 2026-08-28 Motion reversal.
  One cleanup beyond the found diff: removed the superseded `.home-primary-cta`
  `box-shadow: none` + soft-glow `:hover`, which still fired on touch taps.
- **FE.8** — `.home-avatar` 40px → 44px touch floor, folded into the FE.2 commit
  (same file).

Verification: `npm run lint`, `npx tsc --noEmit`, `npm run test` (25/25),
`npm run build` (16 routes) all green; `git diff --check` clean. Desktop hero
confirmed in Chrome in both day and night themes — no login redirect, "Sign in"
button in the nav, token offset shadow on the primary CTA. Mobile nav CSS
reviewed (`.home-nav__signin` survives the ≤520px `.home-nav__link` hide);
live mobile/focus screenshots skipped — the extension's browser was pointed at a
different machine's `localhost:3000`. No `security` subagent invoked: FE.1/FE.2
touch no RLS, no voting writes, no Realtime publication, no model-output path.

#### Real finding: the ratings signal is largely inert

`read accessible ratings` scopes `ratings` to plans the caller already has
access to, so for most users almost every spot falls back to the unrated 3.6
prior. The "community rating" term in the ranking is effectively per-user
today. Preserved exactly by the move (the route uses the caller's session, not
a service role). Worth a product decision before RAG lands, since it means
ranking currently rests almost entirely on the keyword score.

## BE.1 — share-link vote path + migration 023 — 2026-09-01 (T1 Backend)

### Honest failure for guests (blocked on B1, not by it)

`lib/supabase.ts` `bootstrapPlanAccess()` (adopted from a prior uncommitted
pass, committed now) redeems the share uuid and returns a typed
`PlanAccessDenial` instead of throwing: `anonymous-disabled` (owner toggle B1,
not the visitor's link), `captcha-required`, `sign-in-failed`, `not-found`,
`claim-failed`. Non-prod keeps the `PGRST202` escape hatch; prod fails closed.
`lib/types.ts` gains `CastVoteResult` for the new RPC payload.

The vote page (`app/plan/[id]/page.tsx`, Frontend-owned) still runs its own
inline `bootstrapAccess` that collapses `anonymous-disabled` into a generic
"link may be invalid" screen. Cross-lane request filed to T2 to switch it to
`bootstrapPlanAccess` and give each reason its own state. End-to-end guest vote
stays **unverifiable** until B1 — not claimed as passing.

### Migration 023 — explicit vote idempotency

`cast_plan_vote` was idempotent per (plan, participant, round) by delete-then-
insert, but that races: two concurrent calls by one participant could both
delete (0 rows) then both insert, giving one participant two YES rows in a
round that `execute_plan_command` then tallies twice. 023 adds a partial unique
index `votes_participant_round_key (plan_id, participant_token_hash, phase,
pool_number) where participant_token_hash is not null`, dedupes any existing
offenders (keep newest by `(created_at, id)`), drops the redundant
`votes_participant_token_idx`, and rewrites the write path to `insert ... on
conflict do update`. Return type `void` → `jsonb` (`{plan_id, phase,
pool_number, spot_id}`), byte-identical on a replayed call. Signature and grant
unchanged; the client only checks `error`, so no app change. Reviewed by the
`security` subagent before commit.

Concurrency test on the tally handed to `qa-test`: two `cast_plan_vote` calls,
same participant/round, different spots, fired in parallel → exactly one row
survives and the tally counts it once. Also flagged that the `smoke-test.mjs`
`cast_plan_vote` guards now short-circuit on the post-020 anon grant (401
"permission denied for function") instead of exercising the validation branch —
real validation coverage needs an authenticated session.

### Live probes (2026-09-01, publishable key, no session)

| Probe | Result | Means |
|---|---|---|
| `valid_control_secret {"p_secret":"wrong"}` | `200 false` | migration 021 still unapplied — oracle live |
| `consume_app_quota {forged, "spot-deal"}` | `42501` | same as `plan-create` and a bogus scope — 022 not externally probable |
| `cast_plan_vote` (anon) | `42501 permission denied for function` | 020's anon revoke is live; 023 preserves it |
| `test:smoke` | 19/19 | — |
| `test:smoke:020` | 10 green, red only on the `valid_control_secret` oracle guard | 021 |

**022 owner verification** (SQL editor, needs owner):
`select * from pg_publication_tables where pubname='supabase_realtime' and tablename='plan_spots';` → expect one row.
`select consume_app_quota('<real server-control secret>','spot-deal');` → expect a boolean, not an exception.

Verification: `npm run lint`, `npm run typecheck`, `npm run test` (25),
`npm run build` (16 routes) all green.

## Migrations 021 / 022 / 023 applied live — 2026-09-01 (T0, via Supabase MCP)

The Supabase MCP was authenticated (OAuth, org `aryansajiv19's Org`) and all
three pending migrations applied to project `zyojaoyatunjwgbivaqu` with
`apply_migration`. This project does not use the migration ledger, so state was
verified by direct `pg_proc` / `pg_indexes` / `pg_publication_tables` probes, not
by `list_migrations`.

- **021 (`revoke_anon_execute`)** — the pre-probe already showed the target grant
  state (anon EXECUTE absent on `valid_control_secret`, `create_secure_plan`,
  `claim_plan_access`, `consume_app_quota`, `execute_plan_command`; kept on
  `record_security_event`). Re-applied for the record; idempotent. The
  2026-08-24 "`200 false`" oracle probe was stale — the grants are correct now.
- **022 (`spot_deal_quota_and_guest_realtime`)** — `consume_app_quota` now
  accepts `spot-deal` (30/min, 300/day); `plan_spots` added to
  `supabase_realtime`. Both verified.
- **023 (`vote_idempotency`)** — **the committed file is wrong**: it uses
  `create or replace function cast_plan_vote ... returns jsonb` on a function
  that currently `returns void`, which Postgres rejects (`42P13 cannot change
  return type`). Applied a corrected version with `drop function if exists
  cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text)` before the create;
  the existing `revoke/grant` lines already cover the ACL reset that drop+create
  causes. Verified live: `cast_plan_vote` returns `jsonb`, unique index
  `votes_participant_round_key` exists, old `votes_participant_token_idx` dropped,
  `anon` cannot execute it, `authenticated` can, vote count unchanged (4 — no
  duplicates to collapse), zero unique constraints on `votes`.
  **T1 action:** patch `supabase/migration-023-vote-idempotency.sql` (add the
  `drop function`) and confirm `schema.sql` carries the jsonb-returning body.

`get_advisors(security)` after: no regression from these three. The standing
noise — `rls_enabled_no_policy` on the 5 definer-only tables (intentional) and
`{anon,authenticated}_security_definer_function_executable` on the RPC surface
(by design) — is unchanged. One real follow-up for SEC.4: the same
"`revoke from public` misses the named `anon` grant" root cause 021 fixed still
leaves `set_birth_date`, `current_member_age`, `ensure_authenticated_profile`,
`ensure_default_place_collections`, `mirror_friendship`,
`people_default_place_collections`, `rls_auto_enable` anon-executable. They fail
safe in-body, but the grants should match intent.

Only remaining core-loop blocker: **B1** (enable anonymous sign-ins — dashboard).

## Migration 024 (SEC.4) written + lane progress — 2026-09-01 (T0 integrating)

- **024 committed on `lane/backend` (`75f8bd3`), integrated to `ai-engineering`, NOT yet applied** — awaiting owner approval (021–023 were explicitly authorised; 024 is a new migration against the live prod DB). Once approved, T0 applies via `apply_migration` and re-verifies with the trailing SELECT.
- **`rls_auto_enable` is live-only drift** — named in the SEC.4 advisor list but defined in no migration and not in `schema.sql`. 024 revokes it defensively if present. Owner decision pending: capture its definition into `schema.sql`, or drop it. (T0 will `pg_get_functiondef` it during the 024 apply so the decision has the actual body in front of it.)
- mig-023 file corrected (`67a0ccf`); security Low finding fix (`ec5c7fa`).
- `qa-test` dispatched by T1 for 023 idempotency + tally-concurrency (running).
- T2 FE.7 committed (`a1773b1`): new `components/VoteState.tsx`, `bootstrapPlanAccess()` wired into `app/plan/[id]/page.tsx`, per-`PlanAccessDenial`-reason screens. Integrating.

## ✅ Guest vote path verified end to end — 2026-09-01 (T2)

Against a fresh browser profile (localStorage cleared), on lane/frontend's build:
`/plan/22222222-…` → anon session minted → `claim_plan_access` → plan reads →
NameGate → typed name → cast a Round-1 vote. "Selected" state + live count bump
(3→4) both worked. `bootstrapPlanAccess` + `cast_plan_vote` (mig-023 jsonb path)
confirmed working for an anonymous guest. Host decide not run (guest has no host
token; that path unchanged by FE.7).

This is the first time the core loop has worked for a no-account guest —
`PRODUCT_STRATEGY.md` delivery item #1. Recorded as FE.10 in PRIORITIES.md: the
`/login` "Sign in" from the guest-paused screen has no `next` param, so it lands
on `/home` not the plan.

## Migration 024 applied live — 2026-09-01 (T0, owner-approved)

Applied via Supabase MCP `apply_migration`. Verification SELECT confirmed the
intended end state (anon=false on all 7; authenticated=true on the 3 RPCs,
false on the 4 internal fns). `get_advisors(security)` after:

- **SEC.4 function-grant goal met.** `anon_security_definer_function_executable`
  now flags only `record_security_event` (kept for pre-session OTP telemetry).
- **New advisor cluster from B1, not from 024:** `auth_allow_anonymous_sign_ins`
  now fires on ~20 tables. Expected — enabling anon sign-ins means every
  `to authenticated` policy also applies to anon sessions (anon users carry the
  `authenticated` role). The membership scoping (`plan_access`) is what actually
  restricts a guest; the plan/vote/rsvp/ratings/spots policies are the intended
  post-020 guest-read surface. **For `security` to assess (T1):** `friendships`,
  `people`, `visits*`, `place_*`, `storage.objects` also appear — a guest can't
  get a `people` row (profile creation now needs `is_permanent_user()`), so the
  social-graph write policies are likely inert for anon, but confirm.
- `function_search_path_mutable` still on 3 trigger fns
  (`people_before_write`, `trim_companion_name`, `trim_visit_text`) — pre-existing,
  minor, own task.
- `auth_leaked_password_protection` disabled — irrelevant, this app is passwordless.

**`rls_auto_enable` decision:** it's an event-trigger function (event trigger
`ensure_rls`) that auto-enables RLS on any new `public` table — a genuine safety
net, `security definer`, `search_path = pg_catalog`. Recommend **T1 captures its
definition into `schema.sql`** (it's live-only drift, and a scratch rebuild
should have the same guard). Not callable as an RPC (returns `event_trigger`),
so the 024 revoke is pure tidy. Definition is in the T0 session transcript.

## Design implementing directly — turn-14 palette, motion, kokonutui slice — 2026-09-02

Owner told Design's session directly to implement (not just spec) and approved
a 4-step plan; Design correctly refused to drop that on a second-hand "go back
to spec-only" relay from T0 and surfaced the conflict instead — resolution
pending the owner.

Three commits integrated (`00ed31d`, `0184c64`, `09307fc`), gate green:

- **Token layer**: a real 14-color palette, day + night, chosen by the Dubai
  clock (`lib/dubai-phase.ts`, `ThemeSync`), server-stamped so there's no
  flash. The five category-group hues are retired (decision table in the
  handoff); `.token`'s hard-offset shadow retired (supersedes FE.2). Manrope
  swapped to a variable font, 372K of static TTFs deleted.
- **Two owner calls on top**: serif display face, teal accent.
- **Motion + a curated `kokonutui` slice**: new deps `motion`, `lucide-react`,
  `clsx`, `tailwind-merge`, `shadcn` registry config (`components.json`).
  `npm audit --omit=dev`: 0 vulnerabilities.

**Two real bugs found and fixed along the way:**
1. `HomeExperience`/`app/plan/[id]` each carried a local `--night` class
   alongside the document `data-theme` — the two could disagree. This *was*
   FE.4, confirmed real (my earlier "verify, don't assume" flag was right).
   One switch now (`[data-theme="night"] .home-experience`).
2. **Correction to the 2026-09-01 "front-door blank screen = capture
   artifact" note — wrong mechanism, right practical conclusion.** It's
   `HomeExperience` gating content behind `opacity:0` + a `requestAnimationFrame`
   entrance; a backgrounded Chrome window freezes rendering so rAF never
   fires. Real users with a focused window were always fine. Screenshot
   tooling in this environment needs to force the entrance end-state before
   capturing, not just scroll.

**Environment issue found and handled:** `npm install` in the design worktree
silently replaced its symlinked `node_modules` with a real ~500MB directory
(installing the new deps). Worktree `node_modules` symlinks are retired as of
today — see `AGENT_COORDINATION.md`'s Worktrees section. `.env.local` symlinks
are unaffected.

**Two items now ownerless** (Security/Review closed before picking them up):
`next.config.ts` needs `images.remotePatterns` for the photo-led design; the
handoff spec requires vote contents withheld server-side until a round closes,
which `execute_plan_command`/the vote read path doesn't do today. Both need
reassignment.

## The two orphaned items — resolved, both deferred (2026-09-02)

- **`images.remotePatterns`** — Design's call, and it's the right one: don't
  add it yet. There's no photo pipeline and no chosen host yet (`Spot.photo_url`
  is mostly null); every current `next/image` already correctly uses
  `unoptimized` for that reason. A guessed allowlist becomes an SSRF surface
  the moment it's a wildcard, and nobody tightens a guessed one later. Park
  until a real photo source is chosen (Design's upcoming photo-wall work),
  then it needs a `security` subagent look at the specific hosts — not a lane
  picking it up as tidy-up.
- **Server-side vote-withholding** — correctly not design's to build (schema +
  RLS), but also not ready to build: it only matters once the handoff's
  keep/pass + hidden-third-card voting model exists, and nothing has started
  on that yet. Deferred with it, not separately.

Neither is actionable right now. Re-raise both when their real prerequisite
(chosen photo host; the new voting model) actually lands.

## Security/Backend — concurrency load testing + a real live bug found — 2026-09-04

T0's ask: authenticated/mutating paths have never been load-tested (only the
unauthenticated front door has a baseline). Built the missing harness rather
than more correctness-only tests — 023/025 already proved the write RPCs
correct under 2-way races; nobody had measured them under real width.

**New tooling** (`scripts/load/`): `mint-voters.mjs` mints real anonymous
Supabase sessions (the actual guest path) against the live project;
`concurrency.mjs` fires N of them at `cast_plan_vote`/`set_plan_rsvp`
simultaneously via PostgREST's RPC endpoint directly (there's no Next.js
route in front of these — the browser calls `supabase.rpc(...)` straight from
the client, so `run.mjs`/autocannon can't reach them and wasn't the right
tool). Runs against a new dedicated fixture plan
(`supabase/seed-load-test-plan.sql`, id `33333333-…`), kept separate from the
e2e suite's shared `22222222-…` plan on purpose.

**Results at n=15** (GoTrue's anonymous-signup rate limit — see below — was
the real ceiling on scale this session, even after the owner raised the
dashboard limit): `vote-contend`, `vote-flap`, `rsvp-contend` all clean, 0
errors, p99 under 1.1s. `rsvp-collide` (15 first-time RSVPs racing the same
display name — the scenario built specifically to stress `set_plan_rsvp`'s
unbounded retry-on-`unique_violation` loop from migration 025, never tested
past 2-way before) resolved to exactly 1 winner + 14 clean rejections, p99
462ms, no timeout, no raw error leaked. **No fix needed** — the loop degrades
gracefully at this width. Full numbers: `scripts/load/README.md`.

**A real live bug, found by the testing, not the goal of it:** the first
`vote-contend` run (an unrealistic test shape — same `voter_name` for all 15)
failed 14/15 on a raw `23505 duplicate key value violates unique constraint
"votes_round_choice_unique"`. Traced it to a genuine live bug in **migration
023** (applied live 2026-09-01): its step "2b" tries to drop this legacy
index by searching `pg_constraint`, but `votes_round_choice_unique` was
created by migration 009 as a bare `create unique index`, never wrapped in a
table constraint — so the lookup silently finds nothing, the DO block exits
clean, and the migration looks like it succeeded. **Confirmed live** via
direct catalog probe: `pg_indexes` still lists it on `votes` today. 023's own
verification block has the identical blind spot (it only re-checks
`pg_constraint` too), which is why this went unnoticed since 2026-09-01.

Live consequence today: two guests who type the same display name and vote
the same spot/round hit an unhandled error instead of both votes recording
under their own identity — the exact failure mode 023's own comment predicted
if its drop ever failed. **Migration 032** fixes it (`drop index if exists
votes_round_choice_unique` by its now-known exact name). `security`-reviewed:
safe — no FK, RLS policy, or trigger depends on it; `schema.sql` never
defined it in the first place (a fresh rebuild was never exposed to this
bug); no null-hash write path exists live to worry about once it's gone
(every version of `cast_plan_vote` since migration 018 has rejected a
missing/malformed hash before any insert, and direct table writes are
revoked from `anon`/`authenticated` regardless).

**Also found and staged, all `security`-reviewed, none applied:**
- **Migration 030** — `execute_plan_command` was the only `app/api/**` route
  with zero rate limiting. Own quota bucket, 20/min · 100/day. Review caught
  a real gap in my first pass: the route didn't reject anonymous sessions, so
  the new per-uid quota's key was mintable at will — fixed, matches
  `/api/plans` and `/api/spots/deal`'s existing `is_anonymous` check.
- **Migration 031** — `purge_security_operational_data()` has existed since
  020 but was never actually scheduled (`SECURITY_SETUP.md` documents a
  manual dashboard step that was apparently never done; `pg_cron` isn't even
  installed on the project yet). Schedules it via `cron.schedule`.
- `schema.sql` was missing `plans_creator_idx` (migration 014 created it live
  in 2026-08-09; schema.sql never got the mirror) — fixed, no migration
  needed, 014 is already live.
- `smart-search`'s missing-age default failed *open* to 21 where
  `spots/deal`'s identical condition fails *closed* to `MIN_ACCOUNT_AGE` —
  aligned the two.

**Finding, not fixed:** GoTrue's anonymous-signup rate limit is strict enough
that minting even 20 test voters took most of a session, drained by the
mint-voters script's own bursts. Real-world equivalent: several guests on the
same wifi opening a share link within the same window could be throttled out
of getting a session at all. The owner raised the dashboard limit once for
this test; whether the default needs to stay raised for real group use is
still open.

**Deferred, stated plainly:** load-testing `/api/plans` (create) and
`/api/spots/deal` needs a real permanent (non-anonymous) session, and this
app has no password auth and no service-role key by design — not self-serve
the way anonymous voter sessions are. Needs the owner to hand a real
permanent session's refresh token to the load script, or to accept it stays
unmeasured.

**030, 031, 032 are staged only** — none applied to the live project.
@T0 — same shape as 025–029: ready for the owner to review and apply, ideally
032 first given it's a correctness bug already live, not just hardening.
