# Agent coordination board

The shared handoff medium for the four parallel sessions. Sessions share **only
the repo** — if it isn't committed, the others can't see it.

## ⟳ Re-orged 2026-09-04 — production push, all-Opus

Owner wants real visual bugs fixed (misalignment, edge-of-screen, color) and a
push toward production-readiness, while staying personally involved in
frontend/UI direction. **Frontend is unfrozen** — Design ships real specs,
Frontend implements them plus fixes what's actually broken. Worktree paths /
branches unchanged from before.

| Terminal | Session name | Worktree path | Branch | Role |
|---|---|---|---|---|
| **T0** Orchestrator | `model-assignment-terminals` | `~/plan-ind` (main) | `ai-engineering` | Integrates every branch, CI/CD, deploy, **context hygiene + dead-code sweep** (`CONTEXT_HYGIENE.md`) |
| **Frontend** | `plan-ind-c1` | `~/plan-ind-frontend` | `lane/frontend` | Fix real layout/alignment/color bugs; implement Design's specs. Turf: `app/**` (not `app/api/**`), `components/**`, `app/globals.css` — **unfrozen** |
| **Security/Backend** | `plan-ind-7b` | `~/plan-ind-backend` | `lane/backend` | Production-readiness audit-and-extend. Turf: `supabase/**`, `app/api/**`, `lib/security/**`, `lib/supabase.ts`, `lib/types.ts`, `next.config.ts` |
| **Design** | `claude-design-handoff` | `~/plan-ind-design` | `lane/design` | Creative direction ("fun + interactive + modern + sleek"); ships Frontend real specs. Turf: `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md` |

All four on **Sonnet** (switched from Opus 2026-09-04 — usage budget). Raise
reasoning effort instead of the model for the hard parts: migrations, RLS, and
concurrency work should run at *high*. Branch/worktree names still say
`backend`/`frontend` — cosmetic, ignore it.

**Sequencing (2026-09-04): long/complex work before short hardening.** In your
plan, order your own queue so the big structural items land first — a
half-finished redesign or a half-measured load test is worse than either done
properly. Small polish (individual bug fixes, minor tweaks, one-line hardening)
comes after, not interleaved ahead of the complex work. If you're unsure which
bucket something's in, size beats novelty: multi-file/multi-step goes first,
single-file/single-fix goes after.

### 🎨 Owner direction, 2026-09-04 — color palette is changing

**In the owner's own words:** "one main goal i wanna work on is the design of
the app i dont like the navy blue gold theme if we switch to more fun colors
but the goal is to keep the app looking modern sleek luxurious as well."

This supersedes the turn-14 palette's color choices (not its structure — the
day/night, Dubai-clock, server-stamped theming mechanism stays; what fills it
changes). Read literally:
- **Out:** navy + gold as the identity.
- **In:** something with more fun/energy, while still reading modern, sleek,
  **and luxurious** — that's a real tension (fun vs. luxurious), not a
  contradiction to paper over; Design should propose real options, not one
  guess.
- This is **Design's call to resolve**, same as any creative direction — ask
  the owner for references/examples if the brief is too open to commit blind.
- **Frontend:** hold off sinking further work into current color-specific
  decisions where avoidable until Design ships the new direction. Structural/
  layout fixes (misalignment, edge-of-screen, overflow) are unaffected — keep
  going on those, they're not color-dependent.

### ⏸ Mobile work paused, 2026-09-04

Owner: leave anything mobile-related for now. This includes the blocked
390px/`resize_window` verification thread — stop chasing a workaround for it.
**Not the same as removing the 44px tap-target floor or any existing mobile
media query** — that's regression territory, don't touch it. This just means
don't spend further effort on mobile-specific verification or new mobile work
until told otherwise. Desktop/general work continues as normal.

### ⚠️ Day/night is NOT being retired — reverses Design's 578781c call

Owner, 2026-09-04, after Design had already started deleting the colour-
application layer on the "one dark identity" reading: **"i like white and
navy blue together maybe that for the day mode i guess."**

Read plainly: **day mode stays, and it's white + navy** (tentative — "I
guess" — so treat as a strong direction to build and show, not a locked
final). **Night mode is palette v3** (charcoal-navy `#0D1117` / champagne gold
`#C9A876` / glass-blue `#5CC8D7` / teal `#00E0C7`, below). The dual-palette
Dubai-clock mechanism (`dubaiHour()`, `ThemeSync`) should NOT be deleted —
**Design: stop and reverse that specific deletion** if it's still in flight;
the colour-application layer needs a white/navy day branch added, not removed.

### 🎨 Palette v3, 2026-09-04 — try this one instead

Supersedes v2 (coral/gold/teal on `#121212`) below, which stays in the doc for
reference only. **Try v3 directly:**

| Role | Value | Notes |
|---|---|---|
| Background | `#0D1117` | Deep charcoal-navy, cooler than pure black — "reads like night sky over the skyline" |
| Surface | `#161B22` | |
| Primary accent | `#C9A876` | Champagne gold — metallic, restrained, not gaudy |
| Secondary accent | `#5CC8D7` | Icy glass-blue (superseded `#4A90E2` in the same message) — glass facades, pool/marina water |
| Confirm/active | `#00E0C7` | Teal, kept — "works well against navy" |
| Text primary | `#F2EFE9` | |
| Text muted | `#8A8F98` | |
| Error/urgent | `#FF5C5C` | Unchanged from v2 |

**✅ Resolved, 2026-09-04 — owner picked gold as primary.** Saw both rendered
side by side (v3-as-given, gold primary/wordmark, vs. Design's recommended
swap to glass-blue-primary/gold-sparing) and confirmed: gold stays the
primary/wordmark color. Build against **v3 as originally given** in the table
above, not the swap variant — that was Design's suggested fallback, not the
pick. The navy+gold resemblance flag is closed; it was a deliberate direction,
not a drift.

Teal's constraint from before still applies: small components/accents only,
never a large surface. No purple, still. Run the contrast check on
`#8A8F98`/`#F2EFE9` against both grounds before committing.

<details><summary>Palette v2 (superseded) — coral/gold/teal on #121212</summary>

| Role | Value | Notes |
|---|---|---|
| Background | `#121212` | Near-black, not pure black |
| Surface/Cards | `#1E1E1E` | |
| Primary accent | `#FF6B4A` | Warm coral-orange |
| Secondary accent | `#FFD166` | Gold, sparingly |
| Success/confirm | `#00E0C7` | Teal, small components only |
| Text primary | `#F5F5F5` | |
| Text secondary/muted | `#A0A0A0` | |
| Error/urgent | `#FF5C5C` | |

</details>

### Isolation rules — non-negotiable

These exist because four sessions in one tree raced and nearly lost work once.

1. **Work only inside your own worktree.** Never `cd` into another's; never
   `git checkout` another's branch; never edit a file through another worktree's
   path.
2. **Commit only to your own branch.** T0 does every merge. You never merge
   another lane's branch yourself.
3. **Stay on your turf** (table above). Need a file you don't own? Post a
   cross-lane request in this file and let the owner do it, or let T0 sequence
   it. Do not "just quickly fix" someone else's file.
4. **`AGENT_COORDINATION.md` is shared** — edit **only your own block** under
   Lane status, plus Cross-lane requests. T0 resolves the merge conflicts.
5. **Claim shared files before a big rework.** Post a `⚠️ FILE CLAIM` line in
   your status block naming the exact paths; others stay off them until you
   release. Design has used this successfully already.
6. **Talk through T0.** Message `model-assignment-terminals` via SendMessage
   when you have commits to integrate or need another lane's work. Async status
   goes in this file. Lanes do not need to message each other directly.
7. **`npm install` after any sync that changed `package.json`** — worktree
   `node_modules` are real directories now, not symlinks, so they drift.
8. **Never kill processes by name pattern** (`pkill -f "next dev"` etc.) — every
   worktree runs the same process names, so a name-pattern kill takes down
   another lane's dev server. Kill only a PID you've confirmed is yours (check
   the port/cwd first), or just let a stale one sit — it costs nothing.

**Subagents/agent-teams:** use them for genuine fan-out (a broad search, an
independent audit, several unrelated files) — never for a single linear task,
that burns tokens for no speed gain.

### Engineering-bar technique ownership

The owner's full hardening list, mapped so nothing sits unclaimed:

| Technique | Owner |
|---|---|
| Concurrency-safety, idempotent mutations, DB indexing/query tuning, rate limiting, authz/input validation, audit logging, app-level structured logging + request IDs, unit/integration/concurrency tests | **Security** |
| E2E testing (Playwright against the running app) | **Frontend** (was Review — same terminal) |
| Redis caching | **Security implements, but only once a real hotspot is measured** — not speculative. T0's load test is what would surface one. |
| Background jobs/queues, event-driven/outbox | **Nobody — genuinely not needed yet.** No async work or cross-system side effect exists. Revisit when the AI/RAG backfill or a booking flow lands. |
| CI/CD, load/perf testing (p50/p95/throughput/error-rate), observability infra (metrics/tracing/error-monitoring service), production deploy/infra | **T0** |
| AI/search (hybrid search, retrieval eval, latency/cost) | **Blocked on B3** (OpenAI credits still zero). `lib/ai/**` — invoke the `ai-engineer` subagent once someone picks it up. |

## Worktrees — each lane has its own checkout (2026-09-01)

The sessions run in **separate git worktrees** off `ai-engineering`. A
session touches **only its own worktree** and commits **only to its own branch**.

- `.env.local` in each lane worktree is a **symlink** to the main tree — leave it.
- `node_modules` **used to be symlinked too; it isn't anymore (2026-09-02).**
  `npm install` silently replaces a symlinked `node_modules` with a real
  directory the moment a worktree needs a new dependency — Design hit this
  installing `motion`/`lucide-react`/etc. Each worktree now owns a real
  `node_modules` (~500MB each, only 2 worktrees active so the disk cost is
  fine). **After merging a branch that changed `package.json`, run `npm
  install` in every worktree that needs to build** — T0 does this in the main
  tree as part of integration; do it in yours after your next sync if you're
  about to run/build.
- Never `cd` into another worktree; never `git checkout` another lane's branch.
- **T0 integrates:** merges `lane/*` → `ai-engineering` regularly (disjoint files
  → clean), then `ai-engineering` → each `lane/*` so everyone shares one base.
  Ask T0 for a sync when you need another lane's latest commit or `.coord` update.
- Verification gate (`npm run lint && npm run typecheck && npm test && npm run
  build`) runs green **in your worktree** before any non-trivial commit.
  `security` subagent before committing anything touching RLS, writes, the
  Realtime publication, or model output.

## File ownership (updated 2026-09-04 — "Review" is now "Frontend")

Same terminal, same worktree, renamed role: it now implements + fixes UI, not
just reviews. Ownership stays fuzzy on purpose — Security and Frontend both
legitimately touch anything with a bug or a hole in it:

1. **Home turf, no ping needed:** Security → `supabase/**`, `app/api/**`,
   `lib/security/**`, `lib/supabase.ts`, `lib/types.ts`, `next.config.ts`
   (headers/CSP), auth flows. Frontend → `app/**` (except `app/api/**`),
   `components/**`, `app/globals.css`, `lib/**` (except `lib/security/**`/
   `lib/supabase.ts`) — **bug fixes AND implementation, `globals.css` is
   unfrozen.** T0 → `.github/**`, root `*.md`, `tests/**` config, deploy
   config. Design → `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md`,
   Claude Design canvas — specs for Frontend to build, real ones, not vague
   notes.
2. **Off your turf: post it in "Cross-lane requests" before editing**, so the
   other lane doesn't hit a surprise merge conflict. T0 sequences it across a
   sync if needed. Design may still claim specific files under active rework
   (see any `⚠️ FILE CLAIM` note in its status block below) — respect those.

`app/page.tsx` is a route file (Frontend's). `qa-test` writes `tests/**` only,
`security` subagent has no write tools — both remain callable from either lane.
Original clean-split map (pre-reorg, for reference): `.claude/agents/README.md`.

## This file

Edit **only your own lane's block** under "Lane status" and add cross-lane asks
under "Cross-lane requests". Commit it on your branch with the work it describes.
T0 resolves the (trivial, section-level) merge conflicts on integration. The
model policy and decisions log are T0's.

**Model policy (updated 2026-09-04): all four terminals on Opus**, per the
owner — this phase needs complex frontend rework + continued backend/security
depth simultaneously. (Superseded: the earlier Sonnet-for-most policy below,
kept for history.) `security` and `qa-test` remain subagents, not lanes, callable
from any terminal.

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
- **Correction (Design, 2026-09-02):** the front-door "blank screen" was **not** a screenshot capture artifact as I first wrote — `HomeExperience` gates its content behind `opacity: 0` + an entrance transition opened by a `requestAnimationFrame` in an effect. A backgrounded Chrome *window* freezes rendering, so rAF never fires and the hero stays invisible — `document.hidden` was true in every screenshot tab. Real users with a focused window are fine (same practical conclusion), but the mechanism is different: force the entrance end-state before capturing a screenshot in this environment, a scroll doesn't reliably fix it. **FE.4 was also a real bug, now fixed**: `HomeExperience`/`app/plan/[id]` each carried a local `--night` class alongside the document `data-theme`, so the two could disagree — tokens went dark while class-scoped rules stayed light, and the front door's primary CTA rendered cream-on-cream. One switch now (`[data-theme="night"] .home-experience`), toggle reads via `useSyncExternalStore`.
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
  - Flagged, not fixed: `verifyEmailCode` (OTP) had no app-level throttle — **Security closed this** (migration 026, `consumeOtpVerifyLimit`/`consumeOtpRequestLimit` in `lib/security/controls.ts`, now wired into both `requestEmailCode` and `verifyEmailCode` in `app/auth/actions.ts`). No action needed from Review.
  - **E2E** (`5c77829`) — T0 confirmed Review owns this per the engineering-bar map. `@playwright/test` added via `npm install --package-lock-only` (package.json + lockfile only, does not touch the shared `node_modules`). Two specs — guest-vote (live Supabase, the share-link vote path end to end) and login-redirect (FE.10's `next` wiring; the full OTP/OAuth round trip needs a real inbox + Turnstile, not automatable, verified by hand instead). **Both actually run and passing** (4/4, twice) against an isolated scratch Playwright install that never touched this repo's `node_modules` — see `tests/README.md` "Setup" for what still needs a real `npm install` + `npx playwright install` somewhere that's fine to affect the shared install. `npm run test:e2e` script added, not wired into the gate. @T0 — CI job whenever you're ready for it.
- 2026-09-02 (round 2): swept the surface the first pass didn't cover — `app/home/page.tsx`, `AccountViews.tsx`, `StartPlanForm.tsx`, `PlaceLinkImporter.tsx`, and the remaining `lib/*` files.
  - **Fixed** (`32fd9ac`): `interpretSmartSearch()` in `StartPlanForm.tsx` set `category` straight from the AI's parsed intent, skipping the age gate every manual category button goes through — a query resolving to an 18+/21+ category left `category` pointing at something no button in the age-filtered list shows as selected. Not a security hole (`/api/spots/deal` independently re-derives age server-side and won't return spots for a restricted category either way) — a confusing-state bug, now skips quietly like clicking an unrendered category would.
  - **PRODUCT_FLOW.md's step 2 ask, verified, no bug found:** Discover→moodboard and Been→collection are exactly as thin as the doc already says — `lib/planning.ts` (moodboards) is imported only by `DemoPlanningTools.tsx`, never `AccountViews.tsx`; the real Discover tab is browse/search/start-a-plan with no moodboard concept; the real Been tab is a flat visit log (spot photo, note, companions) with no `visit_collections` grouping UI at all. Both tables from migration 010 are genuinely unused by any real-account code path — confirmed, not assumed. This is the feature gap the doc already named, not a bug — no fix attempted (needs Design + a Backend-scoped addition per PRODUCT_FLOW.md, and no new UI is possible with `globals.css` frozen anyway).
  - Fixture-leak re-check (Discover/Been's demo counterparts): clean, no Supabase/fetch calls in `DemoAccountViews.tsx`/`DemoPlanningTools.tsx`, `demoMode`+`fixtures` still only ever true together on the two intended dev-only surfaces.
  - Everything else in this pass's scope (age handling, the `200 []` ambiguity check, Realtime cleanup, reduced-motion, dead code) came back clean — see agent output for detail if needed.
- 2026-09-04 (production push): geometry-audited the front door with real `getBoundingClientRect`/`getComputedStyle` (T0 independently confirmed the same numbers). **Root-caused the "misaligned/edge-of-screen" panel**, but the fix touches two files on Design's active claim, so leaving it as a patch below rather than committing into claimed files:
  - **Bug:** `.home-system` (the "Tonight in Dubai" hero panel, `components/HomeExperience.tsx`) centers via `position:absolute; left:50%; top:50%; transform:translate(-50%,-50%)`. It's wrapped in `<TiltCard>`, which is a `motion.div` writing `style={{ rotateX, rotateY }}` — Motion emits one inline `transform` per frame that always wins over the stylesheet rule, so the compensating `translate(-50%,-50%)` never applies. Result at 1440px: the panel's right edge sits at 1552px, 112px past the viewport and past its own containing block. Not viewport-dependent — same root cause at any width.
  - **Proposed patch** (not applied — `components/TiltCard.tsx` and `components/HomeExperience.tsx` are both claimed): add an opt-in `centered` prop to `TiltCard` using Motion's `transformTemplate` (`(_, generated) => \`translate(-50%, -50%) ${generated}\``, verified against the installed `motion-dom@13.1.1` types) so the centering translate composes with the tilt instead of being clobbered; pass `centered` at the `.home-system` call site; drop the now-dead `transform: translate(-50%,-50%)` from `.home-system` in `globals.css` once wired. I have the exact diff ready to hand over or apply myself once you release the claim — whichever's faster for you, since you may be replacing `.home-system` outright in the 10a+9a rebuild anyway, in which case this is moot.
  - Rest of the sweep at 1440px came back clean: no other horizontal overflow, no console errors, mobile-width tap targets (`.plan-category-group` etc. only get their 44px floor inside a mobile media query, by existing design — not a regression). Mobile-viewport verification blocked by tooling (this environment's `resize_window` isn't shrinking the actual tab viewport, and a same-origin iframe probe was blocked by the app's own CSP framing headers) — didn't chase it further, static CSS read for mobile risk came back clean.
- 2026-09-04: **anti-vibecoded pass, unclaimed surface only** (`app/login`, `app/onboarding`, `components/AuthForm.tsx`, `components/OptionCard.tsx`, `components/DecidedPlan.tsx`). No dead links, no buzzword copy, no `console.log`/TODO/lorem-ipsum anywhere in `app`/`components`/`lib` (repo-wide grep, zero hits). `OptionCard`/`DecidedPlan` already have real empty states ("No votes yet", "No one's committed yet", "Not set yet — ask the host to add a time") rather than blank space — the `VoteState.tsx` pattern the checklist wants extended is already showing up organically in these, not confined to the top-level loading/error screen. One thing I checked and it's a non-issue, noting so nobody re-checks it: `DecidedPlan.tsx`/`NameGate.tsx`/`app/plan/[id]/page.tsx` consume `text-grape`/`bg-zest`/`text-mint` Tailwind utilities — looked like a risk against the category-hue retirement, but `globals.css`'s own comment (line 64) already documents these as legacy aliases, all three already pointing at the one surviving teal value. Nothing to fix.
  - Still can't do the mobile-primary pass properly — same tooling block as above, confirmed independently by T0 on their own tab too (`window.innerWidth`/`screen.width` both stay 1440 after `resize_window`). Not a per-session issue. Real-device or a different environment is the only way to actually verify 390px rendering; flagging again since the owner now wants mobile treated as primary, not a checkbox.
- 2026-09-04: **no-dashes copy sweep, unclaimed surface** (`9dec6fc`). Grepped `app/**`/`components/**` for em/en dashes and hyphen-as-dash, excluding code comments per the owner's scope. Two real hits in rendered JSX, both rewritten as two sentences: `VoteState.tsx`'s guest-paused message ("This link works — the host..." → "This link works. The host...") and `DecidedPlan.tsx`'s unset-time note ("Not set yet — ask..." → "Not set yet. Ask..."). Everything else the grep caught was a code comment (out of scope) or arithmetic subtraction. Gate green (lint/tsc/29 tests/build) before commit. Claimed files (`HomeExperience.tsx`, `AccountViews.tsx`, `DemoAccountViews.tsx`, `StartPlanForm.tsx`, `PhotoWall.tsx`, `PhotoTile.tsx`, `TiltCard.tsx`) weren't swept — they may have dashes too, Design should run the same check when they hand back.

### T3 — Design
- 2026-09-01: `design-system/SPECS.md` written (4 specs for T2); `FRONTEND_DESIGN_STANDARDS.md` updated (outcome row, `.token` reach, motion budget). `design-system/` bundle regenerated — token shadow now live in the previews, restraint-block notes removed, 3 new cards (decided-plan, payoff-after-dark, front-door-after-dark), stale hand-written `overview.html` deleted (build.mjs is the source of truth). **Canvas push needs the owner to run `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`** — that skill is user-invocation only.
- 2026-09-01: FE.7 shared vote-page state component specced in `design-system/SPECS.md` — one `<VoteState kind>` (loading / captcha / guest-paused / retry / cold-link), colourless graphite (a state screen is none of the three colour jobs), reuses `.vote-primary-action` + the `vote-round-in` entrance, no spinner, no icons (no icon lib in repo). `guest-paused` copy is the load-bearing bit — reads "our toggle, not your bad link". Sent to T2.
- 2026-09-01: **FE.7 reviewed on `lane/frontend@a1773b1` — approved, no changes.** Colour discipline clean, tap targets 44px, `vote-round-in` parameterized (`--round-dir: 0`) for a centered fade+scale that degrades right under reduced-motion. 26rem deviation is justified. Flagged to T2 for backlog: `/login` has no `next` param, so a guest signing in from `guest-paused` lands on `/home`, not their plan — rough edge on the exact flow B1 just unblocked. Clear until T2 needs FE.5/FE.6 review.
- 2026-09-02: **⚑ THE DESIGN HANDOFF HAS LANDED — Design is un-idled and the `globals.css` freeze is lifted for this work.** Owner delivered Claude Design project `fb43b9d4…` ("Plan design for Dubai app"); `design_handoff_plan/README.md` is the decision record. Owner's four calls: I write the code (not spec-only), tokens repointed **app-wide**, the **five category-group hues are retired**, and new screens show real data with honest empty states.
  - **Building:** turn 14 (colour, both grounds) · turn 13 (weight, restraint, depth) · 12a (new place page) · 10a+9a (home density + photo wall). **Rejected, never build:** 8a, 11a, `venue-3d.html`, palettes A/B/C, the category rainbow. Keepsake (12b) is phase 2.
  - **⚠️ FILE CLAIM — Review, please stay off these until I hand back:** `app/globals.css`, `app/layout.tsx`, `components/HomeExperience.tsx`, `components/AccountViews.tsx`, `components/DemoAccountViews.tsx`, `components/StartPlanForm.tsx`, `components/categoryGroups.ts`, and the `data-group` attributes in `app/plan/[id]/page.tsx`. New files: `app/place/[id]/page.tsx`, `components/PhotoWall.tsx`, `components/PhotoTile.tsx`, `components/TiltCard.tsx`, `lib/dubai-phase.ts`. Functional bug fixes elsewhere in `app/**`/`components/**` are unaffected.
  - **Two reversals recorded, both deliberate:** the five group hues go (brass + terracotta carry everything now), and the `.token` hard offset shadow goes — turn 8 was rejected precisely for "hard offset shadows", and turn 13's restraint replaces that depth language with perspective and hairlines. FE.2, which I ratified in Wave 1, is superseded by the owner's own design.
  - Plan: `~/.claude/plans/t3-design-you-elegant-tide.md`. Build order is the README's: tokens → photo wall → place page → home.

---

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

- **T3 → T2** · implement `design-system/SPECS.md` (FE.1 night hero, FE.5 payoff day-cleanup + After Dark, FE.6 orbit deletion + skyline dormant; FE.2 ratified; FE.7 `<VoteState>`) · **SUPERSEDED 2026-09-02 by the owner's Claude Design handoff.** Do not build FE.1/FE.5's After Dark brass-on-obsidian treatment — turn 14 replaces that palette wholesale. FE.6's orbit deletion still stands and I'll fold it into the redesign. FE.7 stays as shipped.
- **T3 → Security** · add `images.remotePatterns` to `next.config.ts` (your turf) · the redesign is photo-led and every `next/image` currently sidesteps the missing config with `unoptimized`; once real venue photos land from a remote host, optimisation is off for the app's single most bandwidth-heavy asset class. Not urgent while `photo_url` is mostly null · not blocked · **open**
- **T3 → Security** · FYI, not a request: the design README specifies that **vote contents must not reach the client before a round closes**, enforced server-side. Today's model has no such rule — votes are readable as cast. That is a product-mechanics change (keep/pass, hidden third card, vetoes) well outside this design pass, but you should know it is written into the intended product. · not blocked · **informational**
- **T0 → Security** · patch `supabase/migration-023-vote-idempotency.sql` (42P13); SEC.4 anon-executable functions. · **DONE** — 023 fix `67a0ccf`; SEC.4 closed out across migrations 024–028 (024 applied live; 025–028 staged, see below).
- **T1 → qa-test** · idempotency + tally-concurrency tests for `cast_plan_vote`. · **DONE** — `tests/vote-idempotency.dbtest.ts`, 6/6 green.
- **Security → T0** · **`rls_auto_enable` capture** · **RESOLVED** — exact `pg_get_functiondef` + `CREATE EVENT TRIGGER` sent directly (2026-09-02); capture into `schema.sql` + a numbered migration.
- **Security → T0** · migrations 025–028 committed on `lane/backend`, gate green, `security`-reviewed where they touch RLS/writes (025/026/028; 027 is index-only). Integrate + apply live via MCP once the owner signs off, record in the runbook. · same shape as the 021–024 batches · not blocked · **open — asking the owner now**
- **Review → Security** · `verifyEmailCode` (`app/auth/actions.ts`) has no app-level throttle on OTP guesses — `requestEmailCode` now has one (migration 026, request-side), but the 6-digit *verify* brute-force surface still only has Supabase's built-in cap. Please assess whether that's sufficient or add a counter. · a real fix needs infrastructure Review doesn't own · not blocked · **open**
- **Review → T0** · Playwright E2E ownership. · **RESOLVED — Review owns it.** Add `@playwright/test` + smoke specs on `lane/frontend`; T0 wires the CI job once specs exist, same pattern as `test:db`.
- **Frontend → Design** · apply (or hand back the claim so I can apply) the `TiltCard`/`.home-system` centering fix described in Frontend's 2026-09-04 status entry above · root-caused the front-door panel bleeding off the right edge; the fix is 2 files on your claim list (`components/TiltCard.tsx`, `components/HomeExperience.tsx`) plus one dead-CSS removal in `app/globals.css` · blocked on your claim · **open**

---

## Decisions log

- 2026-09-01: 4 terminals (T0–T3). Subagents only to parallelize real fan-out, never linear work.
- 2026-09-01: Model policy — T1 on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + After Dark night atmosphere; `.token` reach = decision-committing surfaces only; FE.6 = delete decision-orbit/ticker/scribble, keep skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
- 2026-09-01: **Moved to git worktrees.** Four sessions in one tree was racing (concurrent commits, near-collisions on `worklog.md` and this file). Each lane isolated on its own branch + worktree; T0 integrates.
- 2026-09-02: **Re-orged.** Owner is designing externally in Claude Design; Design terminal goes idle until handoff. T1(backend)→Security+hardening+engineering-bar techniques. T2(frontend)→Review/debug/full-stack bug fixes, no visual work. `globals.css` frozen. FE.3/FE.5/FE.6 (aesthetic) paused; FE.4's functional half and FE.10 reassigned to Review.
- 2026-09-04: **Production push.** All 4 terminals on Opus. `globals.css` unfrozen — Frontend (renamed from Review) now implements real UI fixes + Design's specs, not just bug-hunts. Security continues the production-readiness list. Context hygiene + dead-code sweep is T0's, tracked in `CONTEXT_HYGIENE.md`. Still 4 terminals total — more would make coordination the bottleneck, not the work.
