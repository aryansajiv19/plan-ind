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
| **Design** (was T3) | `~/plan-ind-design` | `lane/design` | Sonnet medium | **Idle.** Owner working externally in Claude Design; will hand off specs later |

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
- 2026-09-01: startup-list trim, model policy, CI workflow, **worktree split**, **schema↔types drift check** (`3e8e6bf`). Integrated `lane/backend@ec5c7fa`.
- **Authenticated the Supabase MCP and applied migrations 021, 022, 023 live** (project `zyojaoyatunjwgbivaqu`). Verified by direct catalog probe (this project has no migration ledger). **B2 resolved.** 022/023 confirmed live. Details + the SEC.4 follow-up list in `worklog.md`.
- **⚠️ mig-023 file bug (T1):** `create or replace function cast_plan_vote ... returns jsonb` fails `42P13` — you can't change a return type without `drop function` first. I applied a corrected version live. `supabase/migration-023-vote-idempotency.sql` and `schema.sql` still need the `drop function if exists cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text)` before the create. See cross-lane request.
- **B1 is LIVE** (owner enabled + saved 2026-09-01). Anon signup returns a session token. Turnstile still off — deploy checklist item, not a local blocker.
- Dev server up on `localhost:3000` (main tree, `ai-engineering`) for design review.
- **Front-door "blank screen" on load was a screenshot capture artifact**, not a bug — `getComputedStyle`/`getBoundingClientRect` show the hero opaque, visible, laid out; a scroll forces the paint. (NEXT_AGENT.md §3 trap.) Day render is clean. **T2: night mode on `/` and the `--auth-*` routes still needs a real check** (FE.4) — `home-experience--night` applies but I saw tokens not flipping in one probe; verify properly.
- Next: Vercel deploy wiring, then request-IDs / structured-logging groundwork.

### T1 — Backend
- 2026-09-01: BE.1 + BE.2 + mig-023 committed (`e10d395`); 023 42P13 fix (`67a0ccf`); security Low finding fix (`ec5c7fa`). 021/022/023 live (T0). Gate green on `lane/backend`.
  - **BE.1** `bootstrapPlanAccess()` typed `PlanAccessDenial`, fails closed in prod. Wired nowhere yet — folded into T2's FE.7.
  - **Migration 023** partial unique index + `cast_plan_vote` ON CONFLICT upsert + jsonb return; name-keyed `votes` unique constraint dropped; whole migration in one txn. `42P13` fix committed (`drop function` before `create`) — matches the corrected version T0 applied live.
  - **Migration 024 (SEC.4)** `75f8bd3` — applied live + verified by T0. anon EXECUTE gone on all 7; `authenticated` kept on the 3 RPCs; `set_birth_date` carries the `is_permanent_user()` guard (security Low finding, folded in). Advisor `anon_security_definer_function_executable` now down to `record_security_event` only (intentional).
  - **qa-test** — `tests/vote-idempotency.dbtest.ts` (6 tests: idempotency ×3, tally-under-concurrent-double-vote, tie determinism, EXECUTE grant) + `tests/README.md` + `npm run test:db` (glob `tests/*.dbtest.ts`, outside the hermetic `npm test`). Real-Postgres integration via `psql` CLI, no new dep; self-skips loudly with no DB / pre-023 DB. **No defects in 023.** 6/6 green on a Supabase-shaped scratch DB; pre-023 semantics make the concurrency test go red (proof it bites). CI wiring (Supabase CLI + `TEST_DATABASE_URL` + a `test:db` job) is on T0.
  - Now: capture `rls_auto_enable` def into schema.sql (T0 request); `security` pass on the new `auth_allow_anonymous_sign_ins` advisor cluster on the social tables.

### T2 — Frontend
- 2026-09-01: FE.1 (`ba6ba6b`) + FE.2/FE.8 (`9bd4042`) committed, gate green, hero confirmed both themes. Did the `.home-primary-cta:hover` touch-glow cleanup T3 noted.
- 2026-09-01: **FE.7 done** on `lane/frontend` — `components/VoteState.tsx` (5 kinds: loading / captcha / guest-paused / retry / cold-link) + a `.vote-state` block in globals.css; `app/plan/[id]/page.tsx` now calls `bootstrapPlanAccess()` and maps each `PlanAccessDenial` to its own screen — `anonymous-disabled` → "Guest voting is paused / This link works", not a bad-link error. Built to T3's SPECS.md FE.7 section (`4ea82b0`, not yet integrated); one delta: `.vote-state__inner` max-width 26rem not 22rem (short display headlines wrapped raggedly at 22rem). Gate green in worktree; all 5 states verified in-browser day + night. **@T0 please integrate `lane/frontend`.** Next: FE.5 / FE.6.
- 2026-09-02 (**Review** lane, post-reorg): three threads done on `lane/frontend`, gate green throughout.
  - **FE.10** (`7704424`) — `/login` now takes `?next=`, threaded through both the email-OTP and Google OAuth paths and validated by a new shared `safeNextPath()` in `lib/auth.ts` (was a private copy in `app/auth/callback/route.ts`, now one implementation). `VoteState`'s `guest-paused` "Sign in" link carries `next=<current plan path>` via `usePathname()`. A guest signing in from a paused-guest vote screen now lands back on the plan, not `/home`.
  - **FE.4's functional half — no bug, verified.** Static CSS trace: `.home-experience--night`/`.vote-experience--night` correctly override `--color-*` at runtime (`getComputedStyle` confirmed both class presence and resolved colours flip both directions via the toggle). The "not reliably flipping" probe was almost certainly this environment's automation tab reporting `document.hidden = true` — confirmed directly: a bare `requestAnimationFrame` call in this harness's tab never fires at all while hidden, and the app's night-mode effects use `requestAnimationFrame` to defer the `localStorage` read past hydration. That's normal browser rAF-throttling behaviour for a backgrounded tab, not an app bug — a real user's foregrounded tab fires rAF on the very next paint. No code change. Recording this so it isn't "fixed" a third time (NEXT_AGENT.md §3 territory, just rAF/visibility instead of stale screenshots).
  - **General sweep** (`d923b3b`) — code-review pass over `app/plan/[id]/page.tsx` + `components/DecidedPlan.tsx`. Most severe: host-only controls (`advanceToFinal`/`decide`/`patchPlan`, all enforced server-side via `execute_plan_command`'s `hostToken` check) rendered as fully interactive for every voter — the entire point of a shared link — with a fail-then-revert on tap. Added `isHost` gating; non-hosts now see honest static copy instead. Also: a request-sequencing guard on the four realtime refetchers (a slow stale response could overwrite a fresher one), `toggleVote`'s error path reconciling via `refetchVotes()` instead of a stale pre-optimistic snapshot (could silently drop another voter's just-arrived vote), and a stabilized `Turnstile` `onVerify` callback (was tearing down/rebuilding the live widget on unrelated re-renders). Verified host-gating live in-browser (non-host view shows "Waiting for the host to continue"); the realtime/rollback fixes are reasoning-verified against the existing `active`-flag pattern (not practically triggerable by hand).
  - **qa-test dispatched** for a `safeNextPath` regression test; not yet reported back.
  - Not fixed, flagged instead (see Cross-lane requests): `verifyEmailCode` (OTP) has no app-level throttle, unlike `requestEmailCode`'s Turnstile gate — needs Security's rate-limit infra.
  - E2E/Playwright (T0's ask): `@playwright/test` is in `package-lock.json` but not a real devDependency — flagging before adding it since `package.json`'s test scripts arguably sit on T0's turf. Not started this round.

### T3 — Design
- 2026-09-01: `design-system/SPECS.md` written (4 specs for T2); `FRONTEND_DESIGN_STANDARDS.md` updated (outcome row, `.token` reach, motion budget). `design-system/` bundle regenerated — token shadow now live in the previews, restraint-block notes removed, 3 new cards (decided-plan, payoff-after-dark, front-door-after-dark), stale hand-written `overview.html` deleted (build.mjs is the source of truth). **Canvas push needs the owner to run `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`** — that skill is user-invocation only.
- 2026-09-01: FE.7 shared vote-page state component specced in `design-system/SPECS.md` — one `<VoteState kind>` (loading / captcha / guest-paused / retry / cold-link), colourless graphite (a state screen is none of the three colour jobs), reuses `.vote-primary-action` + the `vote-round-in` entrance, no spinner, no icons (no icon lib in repo). `guest-paused` copy is the load-bearing bit — reads "our toggle, not your bad link". Sent to T2.
- 2026-09-01: **FE.7 reviewed on `lane/frontend@a1773b1` — approved, no changes.** Colour discipline clean, tap targets 44px, `vote-round-in` parameterized (`--round-dir: 0`) for a centered fade+scale that degrades right under reduced-motion. 26rem deviation is justified. Flagged to T2 for backlog: `/login` has no `next` param, so a guest signing in from `guest-paused` lands on `/home`, not their plan — rough edge on the exact flow B1 just unblocked. Clear until T2 needs FE.5/FE.6 review.

---

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

- **T3 → T2** · implement `design-system/SPECS.md` (FE.1 night hero, FE.5 payoff day-cleanup + After Dark, FE.6 orbit deletion + skyline dormant; FE.2 ratified; **FE.7 shared `<VoteState>` component — new section at the foot of SPECS.md**) · wave-1 visual direction is settled · not blocked · **open**
- **T1 → T2** · in `app/plan/[id]/page.tsx` replace inline `bootstrapAccess` with `bootstrapPlanAccess()` from `lib/supabase.ts`; each `PlanAccessDenial` reason its own screen — `anonymous-disabled` → honest "guest voting is paused" (NOT "link may be invalid"); `captcha-required` → Turnstile; `sign-in-failed`/`claim-failed` → retry; `not-found` → cold-link. Optionally use the `cast_plan_vote` jsonb (`CastVoteResult`) to reconcile optimistic state. · a guest on a live link currently gets blamed for our B1 toggle · not blocked (helper committed) · **open — folded into T2's FE.7 task**
- **T0 → T1** · patch `supabase/migration-023-vote-idempotency.sql`: add `drop function if exists cast_plan_vote(...)` before `create ... function cast_plan_vote`; confirm `schema.sql` jsonb body; SEC.4 (`get_advisors` flags 7 anon-executable functions). · file fails re-run / scratch build (`42P13`); live DB already correct · **DONE** — 023 fix `67a0ccf`; SEC.4 → migration 024 (see T1→T0 below)
- **T1 → T0** · (1) apply `supabase/migration-024-revoke-anon-execute-sec4.sql` via MCP once `security` clears it (review in flight), then record it in `worklog.md` + the runbook — T1 no longer owns root docs. (2) **`rls_auto_enable` is live-only drift**: named in your SEC.4 list but absent from every migration and `schema.sql`. 024 revokes it defensively if present; you need to decide whether it should be captured in `schema.sql` or dropped. · SEC.4 close-out + a scratch rebuild currently can't reproduce the live catalog · not blocked · **open**
- **T1 → qa-test** · two tests vs local/live Supabase (never `schema.sql` re-run): (1) `cast_plan_vote` twice, identical args → identical jsonb + exactly one `votes` row; (2) tally concurrency — two `cast_plan_vote` same participant/round, different spots, parallel → one row survives, `execute_plan_command` counts once. Note: `smoke-test.mjs` `cast_plan_vote` guards now short-circuit on the post-020 anon grant (401) before the validation branch — real coverage needs an authenticated session. · the winner-deciding tally has zero concurrency coverage · not blocked · **open**
- **Review → Security** · `verifyEmailCode` (`app/auth/actions.ts`) has no app-level throttle on OTP guesses — `requestEmailCode` refuses to proceed in production without a Turnstile token, `verifyEmailCode` (a 6-digit brute-force surface) has no equivalent gate or attempt-count check, only Supabase's built-in OTP limits. Please assess whether Supabase's cap is sufficient, or add a captcha-after-N-failures / counter via `lib/security/**`'s rate-limit infra. · a real fix needs infrastructure Review doesn't own · not blocked · **open**
- **Review → T0** · before adding real Playwright E2E (per your ask): `@playwright/test` is in `package-lock.json` but not in `package.json` devDependencies — it's a transitive dependency of something else, not installed as a real one. Adding it needs `package.json` + browser binaries; `package.json`'s test scripts arguably sit on your "tests/** config" turf. OK for Review to add `@playwright/test` as a devDependency and a couple of smoke specs (guest vote cast, FE.10's login-redirect round trip), or would you rather own that wiring? · avoiding a surprise dependency/config change on your turf · not blocked · **open**

---

## Decisions log

- 2026-09-01: 4 terminals (T0–T3). Subagents only to parallelize real fan-out, never linear work.
- 2026-09-01: Model policy — T1 on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + After Dark night atmosphere; `.token` reach = decision-committing surfaces only; FE.6 = delete decision-orbit/ticker/scribble, keep skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
- 2026-09-01: **Moved to git worktrees.** Four sessions in one tree was racing (concurrent commits, near-collisions on `worklog.md` and this file). Each lane isolated on its own branch + worktree; T0 integrates.
- 2026-09-02: **Re-orged.** Owner is designing externally in Claude Design; Design terminal goes idle until handoff. T1(backend)→Security+hardening+engineering-bar techniques. T2(frontend)→Review/debug/full-stack bug fixes, no visual work. `globals.css` frozen. FE.3/FE.5/FE.6 (aesthetic) paused; FE.4's functional half and FE.10 reassigned to Review.
