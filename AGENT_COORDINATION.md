# Agent coordination board

The shared handoff medium for the four parallel sessions. Sessions share **only
the repo** — if it isn't committed, the others can't see it.

## ⟳ Re-orged 2026-09-02 — design paused, two hardening lanes

The owner is now designing externally in Claude Design and will hand off a
finished design later — **no new visual/CSS work in the meantime**, only
functional bug fixes. Roles below supersede the Wave-1 lane names; **worktree
paths and branches are unchanged**, only what each one is for.

| Terminal | Worktree path | Branch | Model | Role |
|---|---|---|---|---|
| **T0** Orchestrator | `~/plan-ind` (main) | `ai-engineering` | Sonnet medium | Integrates every branch, owns docs/CI/deploy |
| **Security** (was T1) | `~/plan-ind-backend` | `lane/backend` | **Opus** | Security audit + hardening + the engineering-bar techniques (concurrency, idempotency, caching, observability, rate limiting) |
| **Review** (was T2) | `~/plan-ind-frontend` | `lane/frontend` | Sonnet medium | Bugs, errors, debugging, full-stack code review — **functional fixes only, no visual/design changes** |
| **Design** (was T3) | `~/plan-ind-design` | `lane/design` | Sonnet medium | **Active again (2026-09-02).** Read `PRODUCT_FLOW.md` first — the owner's intended flow, cross-checked against what's built. Own turf only: `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md`, Claude Design canvas. `globals.css` stays frozen until you hand off a spec — Review implements it, not you. |

Branch/worktree names still say `backend`/`frontend` — that's cosmetic, ignore it.

### Engineering-bar technique ownership

The owner's full hardening list, mapped so nothing sits unclaimed:

| Technique | Owner |
|---|---|
| Concurrency-safety, idempotent mutations, DB indexing/query tuning, rate limiting, authz/input validation, audit logging, app-level structured logging + request IDs, unit/integration/concurrency tests | **Security** |
| E2E testing (Playwright against the running app) | **Review** |
| Redis caching | **Security implements, but only once a real hotspot is measured** — not speculative. T0's load test is what would surface one. |
| Background jobs/queues, event-driven/outbox | **Nobody — genuinely not needed yet.** No async work or cross-system side effect exists. Revisit when the AI/RAG backfill or a booking flow lands. |
| CI/CD, load/perf testing (p50/p95/throughput/error-rate), observability infra (metrics/tracing/error-monitoring service), production deploy/infra | **T0** |
| AI/search (hybrid search, retrieval eval, latency/cost) | **Blocked on B3** (OpenAI credits still zero). `lib/ai/**` — invoke the `ai-engineer` subagent once someone picks it up. |

## Worktrees — each lane has its own checkout (2026-09-01)

The sessions run in **separate git worktrees** off `ai-engineering`. A
session touches **only its own worktree** and commits **only to its own branch**.

- `node_modules` and `.env.local` in each lane worktree are **symlinks** to the
  main tree. Do not `npm install` in a lane worktree; do not commit the symlinks.
- Never `cd` into another worktree; never `git checkout` another lane's branch.
- **T0 integrates:** merges `lane/*` → `ai-engineering` regularly (disjoint files
  → clean), then `ai-engineering` → each `lane/*` so everyone shares one base.
  Ask T0 for a sync when you need another lane's latest commit or `.coord` update.
- Verification gate (`npm run lint && npm run typecheck && npm test && npm run
  build`) runs green **in your worktree** before any non-trivial commit.
  `security` subagent before committing anything touching RLS, writes, the
  Realtime publication, or model output.

## File ownership (post-2026-09-02 reorg)

Ownership is **fuzzier now on purpose** — Security and Review both legitimately
touch anything with a bug or a hole in it. Two rules instead of a clean split:

1. **Home turf, no ping needed:** Security → `supabase/**`, `app/api/**`,
   `lib/security/**`, `lib/supabase.ts`, `lib/types.ts`, `next.config.ts`
   (headers/CSP), auth flows. Review → `app/**` (except `app/api/**`),
   `components/**`, `lib/**` (except `lib/security/**`/`lib/supabase.ts`),
   bug fixes and tests. T0 → `.github/**`, root `*.md`, `tests/**` config,
   deploy config. Design → `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md`
   (idle for now).
2. **Off your turf: post it in "Cross-lane requests" before editing**, so the
   other lane doesn't hit a surprise merge conflict. T0 sequences it across a
   sync if needed. `globals.css` is **frozen** — no edits from anyone until the
   owner's design handoff (functional-only fixes go through Review with a
   cross-lane heads-up).

`app/page.tsx` is a route file (Review's). `qa-test` writes `tests/**` only,
`security` subagent has no write tools — both remain callable from either lane.
Original clean-split map (pre-reorg, for reference): `.claude/agents/README.md`.

## This file

Edit **only your own lane's block** under "Lane status" and add cross-lane asks
under "Cross-lane requests". Commit it on your branch with the work it describes.
T0 resolves the (trivial, section-level) merge conflicts on integration. The
model policy and decisions log are T0's.

**Model policy.** T1 → Opus (RLS, security-definer RPCs, live migrations, the
winner-deciding tally, concurrency, RAG). T0/T2/T3 → Sonnet medium. Temporary
switch: T0 → Opus for a one-off architecture design pass; `security` subagent →
Opus every run; `ai-engineer` work inside T1 → Opus for retrieval architecture /
eval-set design. T1 on Sonnet → use *high* reasoning for migration / RLS /
concurrency work. `security` and `qa-test` are subagents, not lanes.

---

## Current goal (2026-09-02)

Core loop already works end to end (guest vote path verified 2026-09-01). Focus
shifts to **security hardening + bug elimination** while design work happens
externally:

1. **Security lane** — finish SEC.4 loose ends (see its Cross-lane requests
   below: `rls_auto_enable` capture, anon-social-graph check), then work the
   engineering-bar list: durable rate limiting audit, request IDs + structured
   logging, concurrency-safety sweep of the other write RPCs
   (`create_secure_plan`, `execute_plan_command`, `set_plan_rsvp`, `rate_plan`)
   for the same double-write race class migration 023 closed on votes, DB index
   check on hot queries. Every addition needs a real problem behind it — no
   Redis/queues/etc. without one.
2. **Review lane** — full-stack bug sweep: lint/tsc/test clean is the floor, not
   the goal. Start with the known ones: **FE.10** (`/login` has no `next` param
   — a guest signing in from `guest-paused` lands on `/home`, not their plan)
   and **FE.4's functional half** (night mode applies `--night` classes but one
   probe showed tokens not flipping — verify with `getComputedStyle`, screenshots
   in this environment are unreliable). Then a general error-state / edge-case
   audit. **No CSS/visual changes** — `globals.css` is frozen pending the design
   handoff; FE.5/FE.6/FE.3 (all aesthetic) are paused, not cancelled.
3. **T0** — integrates both lanes, Vercel deploy wiring, CI `test:db` job.
4. **Design** — idle. Resumes when the owner sends the finished design.

---

## Lane status

### T0 — Orchestrator / Platform
- 2026-09-02: wrote `PRODUCT_FLOW.md` — the owner's intended flow (login → home → host a plan → 3 pools of 3 → final round → vote → payoff → post-visit collections), cross-checked against the actual build. Steps 1–5 match and are built; step 6 (payoff: weather/travel-time/transport-carpooling) and step 7 (post-visit photo collections) are real gaps, not bugs — Design's territory once specced. **Review:** your actionable takeaway is in that doc's summary — verify the Discover→moodboard and Been→collection loops actually work end to end, don't build steps 6/7 blind.
- 2026-09-02: load-test harness (`scripts/load/run.mjs`, `npm run load <scenario>`), first baseline captured (front door: dev 161ms p50/50 req/s vs a production build 10ms p50/857 req/s, 0 errors either way). Integrated Review's FE.10 + sweep (`7704424`, `d923b3b`, `d40b4b5`) — gate green.
- 2026-09-01: startup-list trim, model policy, CI workflow, **worktree split**, **schema↔types drift check** (`3e8e6bf`). Integrated `lane/backend@ec5c7fa`.
- **Authenticated the Supabase MCP and applied migrations 021, 022, 023 live** (project `zyojaoyatunjwgbivaqu`). Verified by direct catalog probe (this project has no migration ledger). **B2 resolved.** 022/023 confirmed live. Details + the SEC.4 follow-up list in `worklog.md`.
- **⚠️ mig-023 file bug (T1):** `create or replace function cast_plan_vote ... returns jsonb` fails `42P13` — you can't change a return type without `drop function` first. I applied a corrected version live. `supabase/migration-023-vote-idempotency.sql` and `schema.sql` still need the `drop function if exists cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text)` before the create. See cross-lane request.
- **B1 is LIVE** (owner enabled + saved 2026-09-01). Anon signup returns a session token. Turnstile still off — deploy checklist item, not a local blocker.
- Dev server up on `localhost:3000` (main tree, `ai-engineering`) for design review.
- **Front-door "blank screen" on load was a screenshot capture artifact**, not a bug — `getComputedStyle`/`getBoundingClientRect` show the hero opaque, visible, laid out; a scroll forces the paint. (NEXT_AGENT.md §3 trap.) Day render is clean. **T2: night mode on `/` and the `--auth-*` routes still needs a real check** (FE.4) — `home-experience--night` applies but I saw tokens not flipping in one probe; verify properly.
- Next: Vercel deploy wiring, then request-IDs / structured-logging groundwork.

### Security (was T1)
- 2026-09-01: BE.1 + BE.2 + mig-023 committed (`e10d395`); 023 `42P13` fix (`67a0ccf`); security Low finding fix (`ec5c7fa`); mig-024 SEC.4 (`75f8bd3`, applied live). 021–024 all live. `qa-test`'s `tests/vote-idempotency.dbtest.ts` — no defects in 023.
- 2026-09-02: **worked the full engineering-bar list** on `lane/backend`, all committed, gate green throughout (lint/tsc/25 tests/build):
  - **Concurrency sweep** — audited `create_secure_plan` / `execute_plan_command` / `set_plan_rsvp` / `rate_plan` for the same race class 023 closed on votes. `execute_plan_command` already safe (`for update` + Postgres's read-latest-on-unblock semantics — verified, no fix). `create_secure_plan` double-submit is cosmetic (two independent plan rows, no data corruption) — not fixing, no evidence it happens. **Migration 025** (`7b8a22b`): `set_plan_rsvp`/`rate_plan` had a real gap — `for update` locks nothing on a nonexistent row, so concurrent first-time submissions for one `voter_name` could both pass `existing.id is null` and one got an unhandled `23505`. Fixed with the standard loop-and-retry-on-`unique_violation` pattern. `security` review: reproduced the race with real concurrent connections, clean. `qa-test`'s `tests/rsvp-rating-upsert-race.dbtest.ts` (`baee90b`) closes the coverage gap the review flagged.
  - **Rate limiting audit** — confirmed no in-process `Map` limiters remain anywhere. Real gap found: OTP request had no durable limit (`consume_app_quota` requires a session; OTP is pre-session). **Migration 026** (`7256d10`, amended `2bc7bc9`): `consume_otp_limit(secret, scope, subject)`, anon-callable + control-secret-gated like `record_security_event`, keyed on the HMAC'd email. Two scopes now — `otp-request` (3/min, 10/day) and, per **Review's cross-lane flag**, `otp-verify` (8/min, 20/day). Checked GoTrue's actual docs before assuming its own limit covers verify-guessing: it's per-IP request-rate (360/hr), not a per-code attempt cap — bypassable by a small proxy pool. The email-keyed app-level cap closes that: 20 guesses/day against a 6-digit code ≈ 0.002% per code. `security` review: clean (confirmed the block happens before `verifyOtp` so a still-valid code is never consumed by the limiter itself; bucket keys scope-disjoint; no oracle regression).
  - **Request IDs / audit logging** — `security_events`/`record_security_event` already existed as this app's structured log; `p_request_id` was only populated on 2 of 7 call sites. Threaded it through the rest (`7256d10`, `add53eb`) — no new logging library, the gap was narrow and mechanical.
  - **DB index audit** — **migration 027** (`f8db45a`): started from NEXT_AGENT.md's `spots(source,category)` hypothesis for `/api/spots/deal`, checked the actual query, it's wrong (curated-only, stays ~100 rows, never grows). The real unbounded-growth hot query is `/home`'s `order by name limit 120` (no filter but RLS). Benchmarked locally: 5.5ms seq-scan+sort → 0.11ms index-scan at 20k rows (~49x), added `spots(name)`.
  - **SEC.4 anon-social-graph check** — live-probed with a real anonymous session (B1 is on): `people`/`place_collections`/`visits`/`visit_collections` writes all cleanly rejected via the `is_permanent_user()` chain. Found a real bug in the process: **migration 028** (`0ab3d76`) — `POST /rest/v1/friendships` was crashing with a live `42P17` infinite-recursion (`people`'s read policy ↔ `friendships`' write policies cross-referenced each other; a documented Postgres RLS limitation). Root-caused, fixed, and validated on a local scratch Postgres; `security` review: clean, no permissiveness lost. Unreachable from the UI today (`lib/social.ts` has zero callers) but was live and would've broken "add a friend" on day one.
  - **SEC.4 closed** — **migration 029** (`70f0f22`): captured `rls_auto_enable()` + the `ensure_rls` event trigger verbatim from your `pg_get_functiondef` output. No-op against live (024 already revoked the client grants); brings `schema.sql` in line with what's already running. Verified on a scratch Postgres.
  - **PRIORITIES.md's SEC.3** verified, no code change: `/api/smart-search`'s `NODE_ENV === "production"` auth-skip only fires under local `next dev` — `next build` (used identically for Vercel preview and production) always sets `NODE_ENV=production`, so no deployed environment inherits the bypass. Same signal is already used at 17 other call sites in this codebase; a separate flag would be inconsistent with the rest of the app for no real gain.
  - Nothing else open from the engineering-bar list or PRIORITIES.md's backend/security queue. Available for more if you have something.

### T2 — Frontend
- 2026-09-01: FE.1 (`ba6ba6b`) + FE.2/FE.8 (`9bd4042`) committed, gate green, hero confirmed both themes. Did the `.home-primary-cta:hover` touch-glow cleanup T3 noted.
- 2026-09-01: **FE.7 done** on `lane/frontend` — `components/VoteState.tsx` (5 kinds: loading / captcha / guest-paused / retry / cold-link) + a `.vote-state` block in globals.css; `app/plan/[id]/page.tsx` now calls `bootstrapPlanAccess()` and maps each `PlanAccessDenial` to its own screen — `anonymous-disabled` → "Guest voting is paused / This link works", not a bad-link error. Built to T3's SPECS.md FE.7 section (`4ea82b0`, not yet integrated); one delta: `.vote-state__inner` max-width 26rem not 22rem (short display headlines wrapped raggedly at 22rem). Gate green in worktree; all 5 states verified in-browser day + night. **@T0 please integrate `lane/frontend`.** Next: FE.5 / FE.6.
- 2026-09-02 (**Review** lane, post-reorg): three threads done on `lane/frontend`, gate green throughout.
  - **FE.10** (`7704424`) — `/login` now takes `?next=`, threaded through both the email-OTP and Google OAuth paths and validated by a new shared `safeNextPath()` in `lib/auth.ts` (was a private copy in `app/auth/callback/route.ts`, now one implementation). `VoteState`'s `guest-paused` "Sign in" link carries `next=<current plan path>` via `usePathname()`. A guest signing in from a paused-guest vote screen now lands back on the plan, not `/home`.
  - **FE.4's functional half — no bug, verified.** Static CSS trace: `.home-experience--night`/`.vote-experience--night` correctly override `--color-*` at runtime (`getComputedStyle` confirmed both class presence and resolved colours flip both directions via the toggle). The "not reliably flipping" probe was almost certainly this environment's automation tab reporting `document.hidden = true` — confirmed directly: a bare `requestAnimationFrame` call in this harness's tab never fires at all while hidden, and the app's night-mode effects use `requestAnimationFrame` to defer the `localStorage` read past hydration. That's normal browser rAF-throttling behaviour for a backgrounded tab, not an app bug — a real user's foregrounded tab fires rAF on the very next paint. No code change. Recording this so it isn't "fixed" a third time (NEXT_AGENT.md §3 territory, just rAF/visibility instead of stale screenshots).
  - **General sweep** (`d923b3b`) — code-review pass over `app/plan/[id]/page.tsx` + `components/DecidedPlan.tsx`. Most severe: host-only controls (`advanceToFinal`/`decide`/`patchPlan`, all enforced server-side via `execute_plan_command`'s `hostToken` check) rendered as fully interactive for every voter — the entire point of a shared link — with a fail-then-revert on tap. Added `isHost` gating; non-hosts now see honest static copy instead. Also: a request-sequencing guard on the four realtime refetchers (a slow stale response could overwrite a fresher one), `toggleVote`'s error path reconciling via `refetchVotes()` instead of a stale pre-optimistic snapshot (could silently drop another voter's just-arrived vote), and a stabilized `Turnstile` `onVerify` callback (was tearing down/rebuilding the live widget on unrelated re-renders). Verified host-gating live in-browser (non-host view shows "Waiting for the host to continue"); the realtime/rollback fixes are reasoning-verified against the existing `active`-flag pattern (not practically triggerable by hand).
  - **qa-test** (`d8edc89`) — `tests/auth.test.ts`, 4 cases for `safeNextPath`. Needed a Node `module.register()` resolve hook (`tests/resolve-aliases.mjs`) since plain `node --test` can't resolve the `@/*` alias or extensionless `next/*` specifiers `lib/auth.ts` pulls in transitively — resolution-only, no runtime behavior change. 29/29 passing.
  - Not fixed, flagged instead (see Cross-lane requests): `verifyEmailCode` (OTP) has no app-level throttle, unlike `requestEmailCode`'s Turnstile gate — needs Security's rate-limit infra.
  - **E2E** (`5c77829`) — T0 confirmed Review owns this per the engineering-bar map. `@playwright/test` added via `npm install --package-lock-only` (package.json + lockfile only, does not touch the shared `node_modules`). Two specs — guest-vote (live Supabase, the share-link vote path end to end) and login-redirect (FE.10's `next` wiring; the full OTP/OAuth round trip needs a real inbox + Turnstile, not automatable, verified by hand instead). **Both actually run and passing** (4/4, twice) against an isolated scratch Playwright install that never touched this repo's `node_modules` — see `tests/README.md` "Setup" for what still needs a real `npm install` + `npx playwright install` somewhere that's fine to affect the shared install. `npm run test:e2e` script added, not wired into the gate. @T0 — CI job whenever you're ready for it.

### T3 — Design
- 2026-09-01: `design-system/SPECS.md` written (4 specs for T2); `FRONTEND_DESIGN_STANDARDS.md` updated (outcome row, `.token` reach, motion budget). `design-system/` bundle regenerated — token shadow now live in the previews, restraint-block notes removed, 3 new cards (decided-plan, payoff-after-dark, front-door-after-dark), stale hand-written `overview.html` deleted (build.mjs is the source of truth). **Canvas push needs the owner to run `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`** — that skill is user-invocation only.
- 2026-09-01: FE.7 shared vote-page state component specced in `design-system/SPECS.md` — one `<VoteState kind>` (loading / captcha / guest-paused / retry / cold-link), colourless graphite (a state screen is none of the three colour jobs), reuses `.vote-primary-action` + the `vote-round-in` entrance, no spinner, no icons (no icon lib in repo). `guest-paused` copy is the load-bearing bit — reads "our toggle, not your bad link". Sent to T2.
- 2026-09-01: **FE.7 reviewed on `lane/frontend@a1773b1` — approved, no changes.** Colour discipline clean, tap targets 44px, `vote-round-in` parameterized (`--round-dir: 0`) for a centered fade+scale that degrades right under reduced-motion. 26rem deviation is justified. Flagged to T2 for backlog: `/login` has no `next` param, so a guest signing in from `guest-paused` lands on `/home`, not their plan — rough edge on the exact flow B1 just unblocked. Clear until T2 needs FE.5/FE.6 review.

---

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

- **T3 → T2** · implement `design-system/SPECS.md` (FE.1 night hero, FE.5 payoff day-cleanup + After Dark, FE.6 orbit deletion + skyline dormant; FE.2 ratified; **FE.7 shared `<VoteState>` component — new section at the foot of SPECS.md**) · wave-1 visual direction is settled · not blocked · **open**
- **T0 → Security** · patch `supabase/migration-023-vote-idempotency.sql` (42P13); SEC.4 anon-executable functions. · **DONE** — 023 fix `67a0ccf`; SEC.4 closed out across migrations 024–028 (024 applied live; 025–028 staged, see below).
- **T1 → qa-test** · idempotency + tally-concurrency tests for `cast_plan_vote`. · **DONE** — `tests/vote-idempotency.dbtest.ts`, 6/6 green.
- **Security → T0** · **`rls_auto_enable` capture** · **RESOLVED** — exact `pg_get_functiondef` + `CREATE EVENT TRIGGER` sent directly (2026-09-02); capture into `schema.sql` + a numbered migration.
- **Security → T0** · migrations 025–028 committed on `lane/backend`, gate green, `security`-reviewed where they touch RLS/writes (025/026/028; 027 is index-only). Integrate + apply live via MCP once the owner signs off, record in the runbook. · same shape as the 021–024 batches · not blocked · **open — asking the owner now**
- **Review → Security** · `verifyEmailCode` (`app/auth/actions.ts`) has no app-level throttle on OTP guesses — `requestEmailCode` now has one (migration 026, request-side), but the 6-digit *verify* brute-force surface still only has Supabase's built-in cap. Please assess whether that's sufficient or add a counter. · a real fix needs infrastructure Review doesn't own · not blocked · **open**
- **Review → T0** · Playwright E2E ownership. · **RESOLVED — Review owns it.** Add `@playwright/test` + smoke specs on `lane/frontend`; T0 wires the CI job once specs exist, same pattern as `test:db`.

---

## Decisions log

- 2026-09-01: 4 terminals (T0–T3). Subagents only to parallelize real fan-out, never linear work.
- 2026-09-01: Model policy — T1 on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + After Dark night atmosphere; `.token` reach = decision-committing surfaces only; FE.6 = delete decision-orbit/ticker/scribble, keep skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
- 2026-09-01: **Moved to git worktrees.** Four sessions in one tree was racing (concurrent commits, near-collisions on `worklog.md` and this file). Each lane isolated on its own branch + worktree; T0 integrates.
- 2026-09-02: **Re-orged.** Owner is designing externally in Claude Design; Design terminal goes idle until handoff. T1(backend)→Security+hardening+engineering-bar techniques. T2(frontend)→Review/debug/full-stack bug fixes, no visual work. `globals.css` frozen. FE.3/FE.5/FE.6 (aesthetic) paused; FE.4's functional half and FE.10 reassigned to Review.
