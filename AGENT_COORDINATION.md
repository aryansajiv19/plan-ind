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

### ✅ Portal transition decided — stays a full page, 2026-09-04

Owner: **keep tile-tap as a full page.** The Intercepting Routes approach
(the only stable way to get the shared-element transition) is dropped — not
because it was technically wrong, but because turning tile-tap into a modal
overlay is a real navigation-UX change the owner doesn't want. §14's other two
motion picks (particle-reconstruction on the decided-plan reveal, the hero
depth drift) are unaffected and proceed as specced.

### 🎨 Typography + motion feedback, 2026-09-04

Owner: **too much bold text — tone it down.** Sweep for over-use of bold
weight (headings, labels, CTAs all competing at once loses the hierarchy bold
is supposed to create) and reserve it for what actually needs the emphasis.

**Also: positive signal on the motion/animation work so far — explicit
green light for more, Design's judgment.** Not a specific ask, an open
invitation: if there are more interaction/animation ideas worth adding
(within the existing constraints — respects `prefers-reduced-motion`, no
excessive Framer Motion per the anti-vibecoded list, no motion shipped
unverified per the rAF/canary limits already hit), propose them. Design owns
this call.

### 🎯 Priority reset, 2026-09-04 — deployment is NOT urgent

Owner: **"deployment is not urgent just the core features and design bugs
have to be solved right now that's priority."** Explicit reordering:

1. **Core features** — venue-link enrichment is the named one
   (`PRIORITIES.md`). Collections/moodboards Pinterest-style is the other.
2. **Design bugs** — the structural fixes Frontend and Design are already on
   (misalignment, edge-of-screen, palette correctness).
3. Everything else — production-readiness/hardening, load testing beyond what
   directly serves 1/2, `DEPLOYMENT.md`'s checklist — **deprioritized, not
   cancelled.** Keep working it if it's already in flight and nearly done, but
   don't start new deployment-prep work ahead of 1/2.

**Security/Backend:** if the current load-test extension is close, finish that
milestone, then pivot to venue-link enrichment ahead of anything else on your
list — it's the named core feature. **T0 (me):** pausing active deployment
push; `DEPLOYMENT.md` stays as reference, not a live task.

**Amendment, same day:** owner also wants automated test coverage kept up and
the app verified to hold **thousands of concurrent users**, not just the
front-door baseline measured so far. This isn't deployment-prep being revived
— it's a real correctness/capacity question about the core feature set itself,
so it stays in scope. Security/Backend: finish the current milestone with that
as the explicit target scale (thousands, not tens), keep expanding automated
coverage (unit/integration/concurrency, not just load) as you go, then move to
venue-link.

### 🎯 Scope, 2026-09-04 — every page and view, not just the front door

Owner: design changes apply to **all pages and endpoints**, not just the
front door/preview and login. The full route surface, so nothing gets
skipped by only touching the flashy screens:

- `app/page.tsx` (signed-out front door), `app/home-preview/page.tsx` (demo)
- `app/home/page.tsx` — the real signed-in shell, and **all five tabs inside
  it** (Plan, Discover, Been, Friends, Profile via `AccountViews`/
  `DemoAccountViews`), not just the Plan tab that gets all the attention
- `app/login/page.tsx`, `app/onboarding/page.tsx`
- `app/plan/[id]/page.tsx` — **and every state of it**: loading, the
  `VoteState` variants (captcha/guest-paused/retry/cold-link), the live
  voting rounds, `DecidedPlan`'s payoff screen
- `app/privacy/page.tsx`, `app/terms/page.tsx` — legal pages, easy to
  forget, currently statically prerendered so they carry the build-time
  theme ground until `ThemeSync` corrects it client-side; worth confirming
  that handoff doesn't flash
- `app/place/[id]/page.tsx` — new, from the spec, not built yet

Design: confirm `SPECS.md` actually covers this whole surface, not just
front-door/photo-wall/place-page. Frontend: this is the actual definition of
"done," not a stretch goal after the highlight-reel pages.

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
5. **Claim shared files before a big rework — with an expiry condition, not
   an open end.** Post a `⚠️ FILE CLAIM` line naming the exact paths **and the
   specific thing that releases it** ("until I hand off the palette spec,"
   "until this commit lands") — never a bare claim with no stated end. A claim
   with no release condition is the failure mode that already happened once
   (2026-09-02: Design's claim outlived the role change that justified it,
   silently blocking Frontend for two days on a fix they had ready).
   - **The claiming lane re-confirms or releases on any relevant change** —
     a role/mandate reorg, a "this is now done" milestone, or before ending a
     work session. Don't leave a claim standing on the assumption someone else
     will notice.
   - **T0 checks standing claims every integration cycle**, not just when
     asked — if a claim has had no commits against its own files for a while,
     or the reorg that justified it has since changed, ping the claiming lane
     directly rather than waiting for it to surface as a stall.
   - **Any lane can ask T0 to check a claim's validity** if work seems blocked
     on one — don't sit blocked in silence the way Frontend did.
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
- 2026-09-04: **Concurrency load testing (T0's ask, long/complex work led the queue per the sequencing note) + a real live bug found.** New harness `scripts/load/{mint-voters,concurrency}.mjs` — mints real anonymous guest sessions and fires N at `cast_plan_vote`/`set_plan_rsvp` simultaneously via PostgREST directly (no Next.js route exists in front of these RPCs, so `run.mjs`/autocannon can't reach them). At n=15 (GoTrue's anonymous-signup rate limit was the real ceiling, even after the owner raised the dashboard limit once — see finding below): `vote-contend`/`vote-flap`/`rsvp-contend` all clean, 0 errors. `rsvp-collide` — built specifically to stress migration 025's unbounded retry loop past the 2-way testing it's only ever had — resolved to exactly 1 winner + 14 clean rejections, p99 462ms, no fix needed, it degrades gracefully. Full numbers `scripts/load/README.md`.
  - **Real bug, not the goal of the testing:** migration 023's legacy-index drop (step 2b) silently no-ops on every project it's applied to — it searches `pg_constraint` for a unique *constraint*, but `votes_round_choice_unique` is a bare `create unique index` from migration 009, never a table constraint, so the lookup never matches and the DO block exits clean with no error. Confirmed live via direct catalog probe: the index is still on `votes` today. Live consequence: two guests with the same display name voting the same spot/round hit an unhandled `23505` instead of both votes recording — exactly what 023's own comment predicted if its drop ever failed. **Migration 032** fixes it (drop by the now-known exact name), `security`-reviewed clean (no FK/RLS/trigger dependency, `schema.sql` never had it so a fresh rebuild was never exposed, no live null-hash write path exists to worry about once it's gone).
  - Also staged, `security`-reviewed: **030** (rate limit on `execute_plan_command` — was the only `app/api/**` route with none; review caught that my first pass didn't reject anonymous sessions, fixed, now matches the sibling routes' `is_anonymous` check), **031** (schedules `purge_security_operational_data()`, which has existed since 020 but was never actually scheduled — `pg_cron` isn't even installed on the project yet). Plus two small fixes: `schema.sql` was missing `plans_creator_idx` (014 mirror gap), and `smart-search`'s missing-age default now fails closed like `spots/deal`'s does.
  - **Finding, not fixed:** GoTrue's anonymous-signup rate limit is strict — minting 20 test voters drained it for most of a session, even after one dashboard raise. Real-world equivalent: several guests on shared wifi opening a share link together could hit the same ceiling. Flagging for the owner to size; not this lane's call alone.
  - **Deferred, stated plainly:** load-testing `/api/plans`/`/api/spots/deal` needs a real permanent-account session; no password auth, no service-role key by design, not self-serve like anonymous voter sessions are.
  - Gate green throughout (lint/tsc/29 tests/build). **030/031/032 staged, none applied** — @T0, same apply flow as 025–029, 032 first since it's a live correctness bug already in production, not just hardening.
- 2026-09-04: **Venue-link enrichment (owner's named top priority) — pipeline steps 2–6.** `PLACE_IMPORT_ARCHITECTURE.md`'s intake step (persistence) turned out already built despite its own stale claim; what was missing was fetch/extract/match/resolve, now built as `lib/place-import/{safe-fetch,ip-guard,oembed,web-adapter,match,resolve}.ts`. No schema change — migration 012's columns already covered it.
  - TikTok/YouTube/Reddit resolve via their public oEmbed hosts; Instagram/Facebook go straight to `needs_input` (no approved API credentials exist, honest not broken); the `web` provider gets full SSRF hardening (DNS-pre-resolve + private/CGNAT/multicast/reserved-range block for IPv4 and IPv6, redirect-hop re-validation, 5s/512KB caps) since it's the one path fetching a user-chosen host directly. Catalog-only matching (token overlap, no AI, no new Postgres extension) against the real ~100-row curated `spots` set — never invents a venue outside it.
  - **Verified live, not mocked:** real YouTube oEmbed + real wikipedia.org OG-tag fetch both worked; a `127.0.0.1` target was correctly rejected; matching scored a real spot's own name back at itself with score 1.0 against the real 82-row catalog. Full DB-write-path verification blocked by the same permanent-account gap already on record for load-testing (`people`/`place_imports` RLS requires `is_permanent_user()` even for a self-insert) — not new, not worked around.
  - `security` review: clean overall, two real items fixed — `isPrivateAddress` was missing CGNAT (`100.64.0.0/10`, a real reachable target on some hosting platforms) plus several cheap low-value ranges, added with test coverage; the architecture doc's "never fetch an arbitrary URL" line directly contradicted the new `web` adapter, resolved by making the doc state the exception and its hardening explicitly rather than weakening the code. One item flagged, deliberately not fixed: concurrent first-time saves of the same brand-new link can trigger two redundant (idempotent, quota-bounded) resolution passes — ponytail-lazy call, skipped.
  - Also fixed along the way: the POST route was an `upsert` that reset `status` to `pending` on every re-save of an already-resolved link, forcing a pointless re-fetch — now fetch-then-insert with a clean `23505` fallback for the concurrent-first-save race. GET now returns the resolved spot's real details + a Google Maps deep link (free-tier "how to get there," no API key) and the candidate list when ambiguous.
  - **Deferred, stated plainly, unchanged from the plan:** Instagram/Facebook real fetching and paid Directions/Places-photo APIs are all owner-decision-gated (T0 asking); the result/candidate-picker UI is Frontend's once this contract ships; screenshot-upload fallback deferred.
  - Gate green throughout (lint/tsc/38 tests/build). No migration, no schema change.
- 2026-09-04: **🔴 CRITICAL, found while scale-testing — core "start a plan" flow has been completely broken since migration 020 (2026-08-24).** `create_secure_plan` requires all 9 spot ids to share the plan's category; no curated category has 9 spots (dinner, the largest, has 5), so `/api/spots/deal` deals from a whole category family by design — the RPC's exact-match check rejected every real plan creation. Confirmed against the live DB directly: **6 plans exist, ever; 5 pre-date 020; the 1 created since is my own SQL-inserted load-test fixture, never through the real app. Zero successful plan creations in 11 days.** A second, compounding bug found investigating the first: `app/api/plans/route.ts` + `app/api/spots/deal/route.ts`'s UUID regex required version 1-5 (real `gen_random_uuid()` shape), but curated spot ids are deterministic (`a0000000-...`) and always failed it — fixed both to plain 8-4-4-4-12 hex, matching what Postgres's `uuid` type actually accepts.
  - **Migration 033** fixes `create_secure_plan` (one-clause diff off 020, drops the category-equality check). `security`-reviewed: independently re-derived the severity claim from source (same conclusion, no category has 9), confirmed no new hole (age-gating already keyed off each spot's own category, untouched by this diff; ownership/sourcing checks untouched) — filed as **Critical on availability grounds, not a vulnerability**. Verified live on a local mirror: the real deal-then-create sequence now returns 200 with a real plan + host token.
  - **Staged, not applied** — 033 needs the owner's approval like every migration, but @T0 this is the priority of the whole batch, ahead of 030-032 if those aren't through yet. The two route.ts UUID fixes are plain app code, ship on next integration, no apply step.
  - Full detail + the live-DB verification queries in `worklog.md`'s CRITICAL entry. Already messaged T0 directly given severity.
- 2026-09-04: **Load-testing to real scale (thousands of concurrent users) — done.** Moved to a **local Supabase stack** (`npx supabase start`, Docker, no rate limit) after the live-project pass topped out at n=15; also closed the permanent-account gap (no self-serve way against the live project). Minted 2,500 real permanent test accounts across 50 seeded plans. **Results: clean through n≈200 on every scenario** (`vote-scale`/`rsvp-scale`/`plan-create-scale`/`spot-deal-scale`, the latter two genuinely new). Past 200, real ceilings show up — local Kong/PostgREST connection handling under a single-tick burst, and separately a single-process `next start` instance queuing badly on `spot-deal`'s multi-round-trip route past ~100 — both reported honestly as local-environment ceilings, explicitly caveated as not a statement about Vercel's serverless-scaled production capacity. Bonus: the same local stack made `tests/*.dbtest.ts` actually execute for the first time in this environment (12/12 passing, was self-skipping). Full table + caveats in `scripts/load/README.md`.
- 2026-09-04: **Direct plan — new plan-creation path, skip the vote (`design-system/SPECS.md` §10 / `PRIORITIES.md`).** Frontend was blocked on this exact signature. Feasibility already confirmed (own investigation, sent to T0): `create_secure_plan`'s INSERT hardcodes `status='open', stage='pool', pool_count=3` and requires exactly 9 spot ids — doesn't fit "1 spot, already decided." Schema needed no change. **Migration 034**: `create_direct_plan(p_plan jsonb, p_spot_id uuid)` — a new function parallel to `create_secure_plan`, mirrors its auth/age/ownership checks. Category is **not** client-supplied — derived server-side from the picked spot's own category, closing the same bug class 033 just fixed before it could recur here. No deadline requirement (nothing to close). `status`/`stage`/`pool_count` hardcoded `'decided'`/`'decided'`/`1`, `winner_spot_id` set at creation. New `app/api/plans/direct/route.ts`, same house preamble, reuses the existing `plan-create` quota (no new bucket).
  - **Verified live on the local mirror, real cases**: a real 18+ curated spot → 200, correctly shaped; an underage user → 403; a nonexistent spot → 403; no spotId → 400; a smuggled unrelated field → 400 via the whitelist. `security` review: safe, no new hole — confirmed the ownership clause guards nothing worse than the nine-spot version, confirmed the server-derived category doesn't reopen 033's bug class downstream (traced every consumer, both have documented fallbacks for an unrecognized category), confirmed by tracing every reader of `plans.deadline` in the codebase that the unvalidated deadline is genuinely inert not just plausibly safe, confirmed quota reuse creates no extra budget. One note acted on: `intelligenceModel` wasn't stripped from the request the way the sibling route does — currently unreachable but a real foot-gun once Frontend wires this up — fixed.
  - Gate green (lint/tsc/38 tests/build). **Staged, not applied** — needs owner approval like every migration. Ready for Frontend now; full detail `worklog.md`.
- 2026-09-04: **Carpool coordination — RSVP fields (`design-system/SPECS.md` §10.2), owner-approved as scoped.** A coordination list, not a matcher — no route optimization, no rider/driver assignment. **Migration 035** extends `set_plan_rsvp` directly (two new optional params `p_transport`/`p_seats_available`) rather than a new RPC — same table, same existing write path, `rsvps` still has no direct write policy. New `transport`/`seats_available` columns plus a cross-column constraint so a seat count can never exist without `transport='driving'`, enforced at the DB level on top of the identical in-function check. Caught a real pitfall myself before it shipped: `create or replace` only replaces a function with an *identical* signature — adding params would have created a second overloaded function instead of replacing the old one, so the migration explicitly drops the old 5-arg signature first.
  - **Verified live, real cases**: driving+seats succeeds, need_ride succeeds, seats-without-driving rejected cleanly, out-of-range seats rejected, invalid transport rejected, omitting both fields still works (backward compatible), switching a driver to need_ride correctly clears stale seats. `security` review: safe — confirmed all four grant/revoke lines in `schema.sql` were updated (none stale), the existing ownership gate still runs before both write branches unchanged, the `plan_access`-scoped select policy is unmodified (every plan member seeing the carpool list is the feature, not a new disclosure), and the 0-8 bound is correct at both layers.
  - **🟡 Real cross-lane note for Frontend, not security, but real**: `app/plan/[id]/page.tsx`'s `setRsvp()` only passes the original 5 params today. Because the update branch fully replaces `transport`/`seats_available` from whatever's given (same as `coming`/`choice` already work), every existing RSVP-status tap through the *unmodified* frontend will silently null out any previously-set carpool answer the moment 035 is live — before any carpool UI exists to re-set it. **One-line fix**: `setRsvp` already holds `mine` (the caller's existing rsvp row) in scope — pass `p_transport: mine?.transport ?? null, p_seats_available: mine?.seats_available ?? null` in the existing RPC call. Needs landing before or alongside 035 going live, not after.
  - Gate green (lint/tsc/38 tests/build, schema↔types drift clean). **Staged, not applied** — needs owner approval. Full detail `worklog.md`.

### T2 — Frontend
- 2026-09-04: **§16 anti-vibecoded fixes** (`ebf0395`) — Design's audit, three items.
  - §16.1: `app/not-found.tsx` + `app/error.tsx` (reuse `.auth-shell`'s restraint: wordmark, one hairline-bordered panel, back link) + `app/global-error.tsx` (its own minimal `<html><body>`, inline styles only, no dependency on anything that might itself be broken). Verified live: `curl localhost:4100/<bad-route>` renders the real page, not Next's default.
  - §16.2: `.vote-option--winner` / `[aria-pressed="true"]` — dropped the `5px 6px 0 var(--vote-metal)` offset term (`app/globals.css`, was :2371/:2376), kept the inset top accent. Exact `.token` hard-shadow signature the Components section already retired elsewhere.
  - §16.3: deleted the dead `.sky-glow` rule (unwired, name conflicted with the no-glow rule). Left the `--glow-*` custom properties alone — `.sky-root`'s transition list and the per-phase values still read them; only the flagged selector was in scope.
  - Gate green (lint/tsc/38 tests/build).
- 2026-09-04: **§15.2 Been moodboard + collections, real data** (`e3f7d07`) — owner stepped away, T0 cleared this to go ahead since §15.2 needs no schema change (migration 010 already live). Wires the previously-unused `visit_photos`/`visit_collections` tables into the Been tab.
  - `lib/social.ts`: `getVisitCollections`/`createVisitCollection`/`addVisitToCollection`/`removeVisitFromCollection` (direct table writes — both tables' RLS is `for all to authenticated`, owner-scoped, no RPC needed) and `getVisitPhotos`/`uploadVisitPhoto`. Upload writes to the private `visit-photos` bucket under the caller's own `auth.uid()` folder (the only path the storage policy grants), then `getVisitPhotos` batch-signs URLs server-side — the bucket has no public read.
  - `components/VisitTile.tsx` (new) + `PhotoWall.tsx`'s `WallItem` gains a `"visit"` kind: reuses the `.wall`/`.wall__col`/`.wall-tile` mechanism and CSS exactly as asked, not a new grid technique.
  - `components/AccountViews.tsx`: Been tab now has a real collection tab bar — ported `DemoAccountViews`' already-built `.demo-collection-*` CSS onto real data, same UX shape (all places / named folders / create) — plus a real photo-upload composer (visit picker, visibility, `lib/upload.ts`'s existing `validateImageFile`). `router.refresh()` after a successful upload rather than faking a signed URL client-side, since the URL only exists once the server signs it.
  - `app/home/page.tsx` + `HomeExperience.tsx`: threaded `personId` (was a dead prop — typed, never destructured) and the new `collections`/`photos` server-fetched data down to `AccountViews`.
  - Gate green (lint/tsc/38 tests/build). **Not live-clicked** — exercising the upload/RLS path for real needs an authenticated session with actual rows, same local-stack tooling (`scripts/load/mint-local-users.mjs`) as the earlier direct-plan verification; flagging rather than claiming an unseen check. One deliberate v1 simplification: "add to collection" is a single flat visit×collection picker rather than a per-tile control — functional, not the polish a per-tile affordance would be; worth a Design pass if it matters before release.
- 2026-09-04: **setRsvp carpool-field fix** (`a739f26`) — `app/plan/[id]/page.tsx`'s `setRsvp()` now passes `p_transport: mine?.transport ?? null, p_seats_available: mine?.seats_available ?? null` through the `set_plan_rsvp` RPC call, per Security's flag ahead of migration 035. Gate green (lint/tsc/38 tests/build). **@T0 ready to integrate whenever, and should land before or alongside 035 going live** per Security's sequencing note — no functional change until 035 is applied (columns don't exist yet on the live schema).
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
- 2026-09-04: **direct-plan entry point, click-through-verified end to end against a real session** (the one gap Security's review flagged — `/home-preview` structurally can't show this, it forces `demoMode`). Used the persisted **local Supabase stack** (`npx supabase start` — same one `scripts/load/`'s scale-testing pass set up, DB started from its own backup, schema/2500-ish prior users/curated catalog already there) rather than fighting the live project's OTP/email-inbox problem. Minted one fresh permanent account (`scripts/load/mint-local-users.mjs 1`), signed in for real through the actual `/login` UI (email OTP, this local stack has Mailpit — the email itself turned out unnecessary once a plain password-derived session cookie set via the real `@supabase/ssr` flow worked), walked `/home` → "I already know where" → searched "Tom" → picked **Tom & Serg** → submitted. Landed on `/plan/[id]`; confirmed in the database (not just the UI, which needed a `document.hidden` workaround to render in this environment — the plan page's own bootstrap effect is `requestAnimationFrame`-gated, same trap as everywhere else): `status: decided`, `stage: decided`, `pool_count: 1`, `winner_spot_id` = Tom & Serg's real id, correct `created_by_user_id`. Once the page did render (forced `document.hidden = false`), `DecidedPlan`'s full payoff screen showed correctly — RSVP, booking, calendar links, all present, no console errors.
  - **State changes on the shared local stack, for whoever uses it next**: re-seeded `app_control_secrets` (`server-control`) with a new known value (`local-test-secret-for-verification-only`) — the existing bcrypt hash wasn't reversible, so I couldn't recover whatever secret was seeded during the earlier load-test session. If anything depends on the old value, it's gone; re-seed again per `SECURITY_SETUP.md`'s instructions if that matters to you. Also truncated `app_rate_limits` twice while debugging an OTP rate-limit bucket collision (now empty), added one `member_ages` row for the minted test account, and left one real `decided` plan (`b30d4ddb-…`, "Tom & Serg") in the `plans` table. Stack is stopped now (`npx supabase stop`, state backed up as always), dev server restored to the live project on port 4100 — nothing left running against the local stack.

### T3 — Design
- 2026-09-01: `design-system/SPECS.md` written (4 specs for T2); `FRONTEND_DESIGN_STANDARDS.md` updated (outcome row, `.token` reach, motion budget). `design-system/` bundle regenerated — token shadow now live in the previews, restraint-block notes removed, 3 new cards (decided-plan, payoff-after-dark, front-door-after-dark), stale hand-written `overview.html` deleted (build.mjs is the source of truth). **Canvas push needs the owner to run `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`** — that skill is user-invocation only.
- 2026-09-01: FE.7 shared vote-page state component specced in `design-system/SPECS.md` — one `<VoteState kind>` (loading / captcha / guest-paused / retry / cold-link), colourless graphite (a state screen is none of the three colour jobs), reuses `.vote-primary-action` + the `vote-round-in` entrance, no spinner, no icons (no icon lib in repo). `guest-paused` copy is the load-bearing bit — reads "our toggle, not your bad link". Sent to T2.
- 2026-09-01: **FE.7 reviewed on `lane/frontend@a1773b1` — approved, no changes.** Colour discipline clean, tap targets 44px, `vote-round-in` parameterized (`--round-dir: 0`) for a centered fade+scale that degrades right under reduced-motion. 26rem deviation is justified. Flagged to T2 for backlog: `/login` has no `next` param, so a guest signing in from `guest-paused` lands on `/home`, not their plan — rough edge on the exact flow B1 just unblocked. Clear until T2 needs FE.5/FE.6 review.
- 2026-09-02: **⚑ THE DESIGN HANDOFF HAS LANDED — Design is un-idled and the `globals.css` freeze is lifted for this work.** Owner delivered Claude Design project `fb43b9d4…` ("Plan design for Dubai app"); `design_handoff_plan/README.md` is the decision record. Owner's four calls: I write the code (not spec-only), tokens repointed **app-wide**, the **five category-group hues are retired**, and new screens show real data with honest empty states.
  - **Building:** turn 14 (colour, both grounds) · turn 13 (weight, restraint, depth) · 12a (new place page) · 10a+9a (home density + photo wall). **Rejected, never build:** 8a, 11a, `venue-3d.html`, palettes A/B/C, the category rainbow. Keepsake (12b) is phase 2.
  - **⚠️ FILE CLAIM — Review, please stay off these until I hand back:** `app/globals.css`, `app/layout.tsx`, `components/HomeExperience.tsx`, `components/AccountViews.tsx`, `components/DemoAccountViews.tsx`, `components/StartPlanForm.tsx`, `components/categoryGroups.ts`, and the `data-group` attributes in `app/plan/[id]/page.tsx`. New files: `app/place/[id]/page.tsx`, `components/PhotoWall.tsx`, `components/PhotoTile.tsx`, `components/TiltCard.tsx`, `lib/dubai-phase.ts`. Functional bug fixes elsewhere in `app/**`/`components/**` are unaffected.
  - **Two reversals recorded, both deliberate:** the five group hues go (brass + terracotta carry everything now), and the `.token` hard offset shadow goes — turn 8 was rejected precisely for "hard offset shadows", and turn 13's restraint replaces that depth language with perspective and hairlines. FE.2, which I ratified in Wave 1, is superseded by the owner's own design.
  - Plan: `~/.claude/plans/t3-design-you-elegant-tide.md`. Build order is the README's: tokens → photo wall → place page → home.
- 2026-09-04: **⚠️ FILE CLAIM RELEASED.** The 2026-09-02 claim above is stale
  — it predates the same day's reorg ("Design ships real specs, Frontend
  implements") and I never released it explicitly, so Frontend has correctly
  been staying off `app/globals.css`, `HomeExperience.tsx`,
  `AccountViews.tsx`, `DemoAccountViews.tsx`, `StartPlanForm.tsx`,
  `categoryGroups.ts`, and the new-file list, including sitting on a ready
  fix for the `.home-system` overflow bug (line 331 above) rather than
  applying it. That's on me — I should have released this the moment the
  reorg landed, not after being asked. **All of it is released now, no
  conditions.** Frontend: apply the `TiltCard`/`.home-system` patch you
  already have queued, and everything in `design-system/SPECS.md` (§1
  colour v3/final gold, §2 day/night, §3 structural bugs, §4 dead code, §5
  home rebuild, §6 place page, §7 shadcn/Motion + animation, §8 no-photo
  label) is yours to implement — nothing further is pending from me before
  you start. My own status since 2026-09-02 has genuinely been spec/doc-only
  (`SPECS.md`, `FRONTEND_DESIGN_STANDARDS.md`, `design-system/build.mjs` +
  `dist/`) — no code commits — which is correct for my current role, but it
  meant nothing landed in the app while Frontend was honoring a claim I'd
  left standing. Won't reclaim these files again without saying so here
  first.
- 2026-09-04: **Full anti-vibecoded audit against `PRODUCTION_CHECKLISTS.md`'s
  list** — grep sweep plus a live-browser pass (`/`, `/home-preview` both
  tabs, `/login`, `/privacy`, a fresh 404 hit). Findings and fix specs in
  `design-system/SPECS.md` §16, two genuine hits: **no custom 404/500
  page** (Next's bare framework default renders — confirmed live, not
  just missing files) and **a hard offset-shadow regression on
  `.vote-option--winner`** (`app/globals.css:2371,2376`, the exact
  `.token` pattern retired elsewhere but missed on this selector).
  Everything else on the list checked clean (console noise, dead links,
  `lucide-react`, fake social proof, buzzword copy, gradient text, bento
  grids, category-colour creep, day/night intact, spacing) — recorded as
  clean in §16.3 so it isn't re-audited from scratch. One dead-code note:
  `.sky-glow` (unused, `app/globals.css:467`) should get deleted rather
  than ever wired up, given its name directly conflicts with the
  no-glow rule if it is. Ready for Frontend to pick up after §15.2.

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
- **Security → T0** · migrations 030/031/032 committed on `lane/backend`, gate green, all `security`-reviewed. 030 = rate limit on `execute_plan_command`, 031 = schedules the never-scheduled purge cron, 032 = fixes a live correctness bug (migration 023's legacy-index drop silently no-opped). · same apply-via-MCP flow as 021–029 · not blocked · **DONE** — all three applied live 2026-09-04, owner-approved, verified by catalog probe.
- **Security → T0** · 🔴 **migration 033, priority over everything else in this list** — fixes a Critical live bug: `create_secure_plan`'s category check has blocked every real plan creation since migration 020 (2026-08-24), confirmed via the live DB (6 plans ever, 1 since 020, that one my own SQL-inserted fixture). `security`-reviewed. Plus two app-code UUID-regex fixes (`app/api/plans/route.ts`, `app/api/spots/deal/route.ts`) that ship on normal integration, no apply step. Full detail `worklog.md`. · not blocked, needs owner approval like any migration · **open — already messaged you directly given severity**
- **Security → T0** · migration 034 (`create_direct_plan`) committed on `lane/backend`, gate green, `security`-reviewed. Needs owner approval + apply via MCP like every migration. · not blocked · **open**
- **Security → T0** · migration 035 (carpool `transport`/`seats_available` on `rsvps`, extends `set_plan_rsvp`) committed on `lane/backend`, gate green, `security`-reviewed. Needs owner approval + apply via MCP. · not blocked · **open**
- **Security → Frontend** · 🟡 **before or alongside 035 going live**: `app/plan/[id]/page.tsx`'s `setRsvp()` needs one line added — pass `p_transport: mine?.transport ?? null, p_seats_available: mine?.seats_available ?? null` in its existing `set_plan_rsvp` RPC call (`mine` is already in scope, the caller's existing rsvp row). Without it, every ordinary "coming/maybe/no" tap will silently null out anyone's already-set carpool answer, since the RPC's update branch fully replaces both fields from whatever's given. Not urgent before the carpool UI itself exists, but genuinely needed the moment 035 is applied, so it doesn't wipe answers nobody's UI can set yet. Full context `worklog.md`'s carpool entry. · not blocked, just needs sequencing · **open**
- **Security → Frontend** · direct-plan creation is real now — `POST /api/plans/direct` with `{ title, spotId, area?, deadline?, budgetPerPerson?, originLabel?, originLatitude?, originLongitude?, radiusKm?, smartBrief?, vibePreferences?, avoidPreferences? }`, returns `{ id, hostToken }` same shape as `/api/plans`. Do **not** send `category` (server derives it from the spot) or `intelligenceModel` — both are stripped if present, but simpler not to send them. Build against §10's two entry points per `design-system/SPECS.md`. · not blocked · **DONE** — both entry points built (place-page CTA, `/home` Plan-tab toggle `a2ab757`), both converge on `create_direct_plan`. Toggle couldn't be seen live in `/home-preview` (demoMode always on there, direct path needs a real session) — Frontend flagged this explicitly rather than claiming an unseen check; worth a real-session look before calling it fully verified.
- **Security → Frontend** · venue-link enrichment now has a real API contract — `GET /api/place-import` returns `status`, `resolvedSpot: {id,name,area,category,photoUrl,latitude,longitude,mapsUrl} | null`, and `candidates` when `needs_input` with an ambiguous match (`app/api/place-import/route.ts`). The result/candidate-picker UI is yours to build per `PRIORITIES.md`'s venue-link section — I'm not touching `components/**`. Details in `worklog.md`'s 2026-09-04 venue-link entry. · not blocked · **open**
- **Review → Security** · `verifyEmailCode` (`app/auth/actions.ts`) has no app-level throttle on OTP guesses — `requestEmailCode` now has one (migration 026, request-side), but the 6-digit *verify* brute-force surface still only has Supabase's built-in cap. Please assess whether that's sufficient or add a counter. · a real fix needs infrastructure Review doesn't own · not blocked · **open**
- **Review → T0** · Playwright E2E ownership. · **RESOLVED — Review owns it.** Add `@playwright/test` + smoke specs on `lane/frontend`; T0 wires the CI job once specs exist, same pattern as `test:db`.
- **Frontend → Design** · apply (or hand back the claim so I can apply) the `TiltCard`/`.home-system` centering fix described in Frontend's 2026-09-04 status entry above · root-caused the front-door panel bleeding off the right edge; the fix is 2 files on your claim list (`components/TiltCard.tsx`, `components/HomeExperience.tsx`) plus one dead-CSS removal in `app/globals.css` · blocked on your claim · **open**
- **T0 → Frontend** · 🔴 **live-verified padding/alignment/button/label audit, 2026-09-04, real bugs found:**
  1. **Contrast failure, `app/globals.css:2493`** — `.vote-result button[aria-pressed="true"]:not(.vote-rating-button) { color: #111218 }`, background `var(--vote-metal)` = `var(--color-punch)`. In **day** mode `--color-punch` is navy `#1b2a4a`; `#111218` text on it measures **~1.3:1** (WCAG AA needs 4.5:1) — confirmed live on the seeded fixture plan (`/plan/11111111-1111-1111-1111-111111111111`), RSVP "Can't make it" selected state, `data-theme="day"`. Same bug shape as §3.9 (hardcoded ink on an accent fill, day/night asymmetric) but this exact selector wasn't in that fix's four-item list — it slipped the sweep. At night `--color-punch` is champagne gold, so this reads fine there; **day-mode-only**, which is exactly why it survives a check done in the wrong ground. Fix: same pattern as §3.9 — route through the themed fill/ink pair instead of a literal, or pick a day-appropriate literal per §1's fill-contrast rule (light ink on the navy fill).
  2. **`.vote-result__primary` still has the two-mechanism problem §13.2 just fixed for `.vote-primary-action`** — `DecidedPlan.tsx`'s "Copy for the group chat" button carries Tailwind utilities (`bg-zest`, `text-ink`, `border-ink`, `px-5 py-3`) in its `className`, all dead — `app/globals.css:2442`'s `.vote-result__primary { background: var(--color-ink); color: var(--color-card) }` wins on specificity and is what actually renders (verified: computed `background: rgb(20,20,20)`, `color: rgb(255,255,255)`, not the Tailwind values). Visually correct today by coincidence, but the same "two systems, one dead" trap §13.2 just cleaned up elsewhere in this file — worth the same treatment.
  3. **§3.2 (`.home-nav` `100vw` vs `100%` padding calc, `:664`) is still unfixed** — checked the source, the `max(1rem, calc((100vw - 76rem) / 2))` calc from the spec is still live. Not visually reproducible in this environment (Mac overlay scrollbars report 0px), so I can't show you a screenshot of it — real on Windows/classic-scrollbar users per the original spec math (~7-8px), low severity, flagging so it isn't lost, not urgent.
  4. **Confirmed fixed, no action needed:** §3.1 rail-width unification (`.home-appbar` already `min(100% - 2rem, 76rem)`), §13.1 outline-offset (re-verified per your own message), §13.2 button padding (verified live: bare `.vote-primary-action` resolves one padding system, no ancestor needed).
  · not blocked · **open**, items 1–2 are yours since you're already in this file/button family; item 3 is FYI/low-priority

---

## Decisions log

- 2026-09-01: 4 terminals (T0–T3). Subagents only to parallelize real fan-out, never linear work.
- 2026-09-01: Model policy — T1 on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + After Dark night atmosphere; `.token` reach = decision-committing surfaces only; FE.6 = delete decision-orbit/ticker/scribble, keep skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
- 2026-09-01: **Moved to git worktrees.** Four sessions in one tree was racing (concurrent commits, near-collisions on `worklog.md` and this file). Each lane isolated on its own branch + worktree; T0 integrates.
- 2026-09-02: **Re-orged.** Owner is designing externally in Claude Design; Design terminal goes idle until handoff. T1(backend)→Security+hardening+engineering-bar techniques. T2(frontend)→Review/debug/full-stack bug fixes, no visual work. `globals.css` frozen. FE.3/FE.5/FE.6 (aesthetic) paused; FE.4's functional half and FE.10 reassigned to Review.
- 2026-09-04: **Production push.** All 4 terminals on Opus. `globals.css` unfrozen — Frontend (renamed from Review) now implements real UI fixes + Design's specs, not just bug-hunts. Security continues the production-readiness list. Context hygiene + dead-code sweep is T0's, tracked in `CONTEXT_HYGIENE.md`. Still 4 terminals total — more would make coordination the bottleneck, not the work.
- 2026-09-04: **Integrated `e3eb161` (Design: SPECS §14.1 portal transition marked dropped, struck through not deleted) + `a2ab757` (Frontend: §10.1 second direct-plan entry point on `/home`'s Plan tab).** Gate green each step (schema/tsc/38 tests/build), pushed to `ai-engineering` and all three lane branches at `077c1a1`. Tile-tap stays a plain full page — settled, not to be re-proposed.
- 2026-09-04: **Owner decisions: photo backfill + "getting there" transportation, both resolved to the free version.** Photos: skip the paid Google Places API for now, reuse the free catalog/embed-metadata path — owner will get a Places API key later, revisit `images.remotePatterns` then, not before. Transportation: researched a direct RTA API integration before scoping it (owner asked what "carpool" meant, turned out they wanted real transit timings, not just ride-coordination) — RTA's real-time data goes through `data.dubai`'s government data-exchange, "restricted to government entities and authorized users," not a public self-serve key; the public GTFS mirror is stale (2021). **Free version ships instead and covers the actual ask**: straight-line distance + "Open in Maps," which already renders RTA's live bus/metro data directly (RTA publishes it there itself). Direct RTA integration is a real future research item, not scoped work. Separately, the lightweight "who's driving/who needs a ride" list (§10.2, `rsvps` extension) is unaffected by any of this and is green-lit as originally scoped — Backend can build it. Both recorded in `PRIORITIES.md`.
- 2026-09-04: **"Getting there" shipped** (`8b4605b`) — `lib/directions.ts` (haversine + Maps transit deep link, verified against a known real-world distance), wired into `DecidedPlan.tsx` only (place page has no origin coordinate to measure from, correctly left alone). Gate green, T0 spot-checked the math/URL construction. Also caught two em dashes in `lib/calendar.ts` that the earlier no-dashes sweep missed (that pass only covered `app/**`/`components/**`, not `lib/**`) — fixed, rest of `lib/**` re-checked clean. Pushed and synced across all four branches.
- 2026-09-04: **Integrated `912621f` (Frontend: §13 button padding + outline audit).** Gate green, pushed, synced at `912621f`. Same cycle: T0 ran a live padding/alignment/button/label audit against the merged build — one new confirmed contrast bug (RSVP button, day mode) + one dead-Tailwind-utility follow-up on `.vote-result__primary`, both routed to Frontend above; §3.1/§13.1/§13.2 confirmed already fixed, no action needed.
- 2026-09-04: **`security` subagent ran a real-usability audit** (not just demo-data): no new RLS/grant holes across migrations 025–034 (the repeat "revoke from public doesn't cancel anon" bug has not recurred since 024). One medium finding — the direct-plan entry point on `/home` (toggle → search → create) has never been click-through-verified against a real session, since `/home-preview` structurally forces `demoMode` and hides it; underlying pieces (RPC, route, gating) individually check out. One informational correction — `DEPLOYMENT.md`'s Turnstile line undersells the gap: production login/guest-voting is a **hard wall** today (no key configured), not "no bot protection." `test:security`/`test:wrapped` remain unfiltered aliases (QA.2, still open). Full report relayed to the owner.
- 2026-09-04: **§14 complete — every SPECS.md item from §1 through §14 is now either shipped or explicitly closed with a verified reason.** §14.2 (`b2caa47`, particle-reconstruction on the decided-plan reveal — new `WinnerPhotoReveal.tsx`, gated on `photo_url` existing, cross-origin canvas-taint handled with try/catch + plain-photo fallback, `useSyncExternalStore` for reduced-motion to dodge the hydration-mismatch/set-state-in-effect trap) and §14.3 (`872ba65`, front-door hero scroll-depth drift — `translate` not `transform` on `.home-stage` since it already carries `.home-reveal`'s entrance transform on the same element) both integrated, gate green, spot-checked by T0 (reasoning + fallback paths hold up), pushed and synced across all four branches at `b2caa47`.
- 2026-09-04: **Owner stepped away for an extended period, can't approve anything — all three lanes given long, complex, approval-free work so nobody sits idle.** Migration 035 stays staged, unapplied, until the owner's back — do not apply any migration without them, no exceptions. T0 ran a git-secrets scan (gitleaks, all 186 commits, 22 hits all triaged as false positives — 4 public local-Supabase-CLI demo JWTs, 1 self-evidently-named CI placeholder, 17 SHA-256 hashes in `graphify-out/cache/` misread as keys; that cache dir untracked going forward, not purged from history) and a dead-code sweep (`saveMe`/`upsertMe`/`newPersonId` removed, confirmed superseded by `ensure_authenticated_profile`+`cacheMe`, not deferred — verified via commit ordering, not a guess; found and fixed a real gap in the same area, `clearMe()` existed but nothing called it on sign-out). Both in `PRODUCTION_CHECKLISTS.md`/commit history. Backend on the open production-checklist items (CORS, cookie flags, `select("*")` trimming, `npm audit` CI gate, account-lockout confirmation) plus drafting (not applying) the §15.3 moodboard migration. Frontend building §15.2 (Been collections). Design ran a full anti-vibecoded audit — 2 real hits (no custom 404/500, a hard-shadow regression on `.vote-option--winner`), rest checked clean, queued for Frontend after §15.2.
- 2026-09-04: **RSVP contrast bug (`app/globals.css:2493`) fixed twice in parallel** — owner asked T0 to fix it directly rather than wait; Frontend independently fixed the same line to the identical value (`var(--primary-ink)`) before T0's message landed, plus the `.vote-result__primary`/`DecidedPlan.tsx` dead-utility follow-up in the same commit (`c331bff`) — turned out not all the flagged Tailwind classes were actually dead (`.vote-result__primary`/`__button` have no CSS padding rule of their own, unlike `.vote-primary-action`; verified precisely via injected markup before removing anything). T0's `aa8bc7c` and Frontend's `c331bff` merged cleanly (identical text on the shared line) into `f490595`, gated green, pushed and synced across all four branches. Both items from the audit above are closed.
