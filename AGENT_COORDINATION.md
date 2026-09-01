# Agent coordination board

The shared handoff medium for the four parallel sessions. Sessions share **only
the repo** — if it isn't committed, the others can't see it.

## Worktrees — each lane has its own checkout (2026-09-01)

The four sessions run in **separate git worktrees** off `ai-engineering`. A
session touches **only its own worktree** and commits **only to its own branch**.

| Lane | Worktree path | Branch | Model |
|---|---|---|---|
| **T0** Orchestrator / Platform | `~/plan-ind` (main) | `ai-engineering` | Sonnet medium |
| **T1** Backend | `~/plan-ind-backend` | `lane/backend` | **Opus** |
| **T2** Frontend | `~/plan-ind-frontend` | `lane/frontend` | Sonnet medium |
| **T3** Design | `~/plan-ind-design` | `lane/design` | Sonnet medium |

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

## File ownership

| Lane | Writes | Never touches |
|---|---|---|
| **T0** | `.github/**`, root `*.md` (PRIORITIES, worklog, NEXT_AGENT, CLAUDE, this file), `tests/**` config, `scripts/load/**`, deploy config | `app/**`, `components/**`, `supabase/**`, `lib/**` |
| **T1** | `supabase/**`, `app/api/**`, `lib/types.ts`, `lib/supabase.ts`, `lib/ai/**`, `lib/spots/**` | `components/**`, `globals.css`, root docs |
| **T2** | `app/**` (except `app/api/**`), `components/**`, `app/globals.css`, `lib/dubai-phase.ts` | `supabase/**`, `lib/types.ts`, root docs |
| **T3** | `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md`, Claude Design canvas | everything else |

`app/page.tsx` is Frontend's (route file). `qa-test` writes `tests/**` only.
`security` has no write tools. Full map: `.claude/agents/README.md`.

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

## Current goal

**Get the core loop to production.** Critical path:

1. Owner clears **B1** (enable anon sign-ins) → **B2** (migration 021) → **B4**
   (migration 022) → migration 023, in that order. See `PRIORITIES.md`.
2. T1 — BE.1 vote path correct, failing honestly until B1. ✅ committed.
3. T2 — FE.1 front door ✅ · FE.2/FE.8 ✅ · next: wire `bootstrapPlanAccess` + FE.7 states.
4. T0 — CI ✅ · schema↔types drift check ✅ · next: Vercel deploy wiring, deployed smoke.
5. Then the hardening layer per lane (idempotency ✅ mig-023 → durable rate
   limiting → request IDs / structured logs → load baseline).

---

## Lane status

### T0 — Orchestrator / Platform
- 2026-09-01: startup-list trim, model policy, CI workflow, **worktree split**, **schema↔types drift check** (`3e8e6bf`). Integrated `lane/backend@ec5c7fa`.
- **Authenticated the Supabase MCP and applied migrations 021, 022, 023 live** (project `zyojaoyatunjwgbivaqu`). Verified by direct catalog probe (this project has no migration ledger). **B2 resolved.** 022/023 confirmed live. Details + the SEC.4 follow-up list in `worklog.md`.
- **⚠️ mig-023 file bug (T1):** `create or replace function cast_plan_vote ... returns jsonb` fails `42P13` — you can't change a return type without `drop function` first. I applied a corrected version live. `supabase/migration-023-vote-idempotency.sql` and `schema.sql` still need the `drop function if exists cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text)` before the create. See cross-lane request.
- Only core-loop blocker left: **B1** (owner enables anon sign-ins).
- Next: Vercel deploy wiring, then request-IDs / structured-logging groundwork.

### T1 — Backend
- 2026-09-01: BE.1 + BE.2 + mig-023 committed (`e10d395`); 023 42P13 fix (`67a0ccf`); security Low finding fix (`ec5c7fa`). 021/022/023 live (T0). Gate green on `lane/backend`.
  - **BE.1** `bootstrapPlanAccess()` typed `PlanAccessDenial`, fails closed in prod. Wired nowhere yet — folded into T2's FE.7.
  - **Migration 023** partial unique index + `cast_plan_vote` ON CONFLICT upsert + jsonb return; name-keyed `votes` unique constraint dropped; whole migration in one txn. `42P13` fix committed (`drop function` before `create`) — matches the corrected version T0 applied live.
  - **Migration 024 (SEC.4)** committed, ready for T0 to apply. Revokes anon EXECUTE by name: `set_birth_date` / `current_member_age` / `ensure_authenticated_profile` keep `authenticated`; `ensure_default_place_collections` / `mirror_friendship` / `people_default_place_collections` / `rls_auto_enable` lose both. `security` reviewed → safe to apply, one Low finding **folded into 024**: `set_birth_date` only checked `auth.uid()`, not `is_permanent_user()` — an anon→permanent upgrade could inherit a fabricated write-once DOB past the 18/21 gates (zero exploitability while B1 is off). Added the guard to the body + mirrored in schema.sql. **`rls_auto_enable` is live-only drift** — see T1→T0 request.
  - `qa-test` dispatched for the 023 idempotency + tally-concurrency tests (still running).
  - Next: T0 applies 024 + records it; then remaining backend queue.

### T2 — Frontend
- 2026-09-01: FE.1 (`ba6ba6b`) + FE.2/FE.8 (`9bd4042`) committed, gate green, hero confirmed both themes. Did the `.home-primary-cta:hover` touch-glow cleanup T3 noted.
- **Next task (T0-assigned): FE.7 + T1's request together** — rebuild the vote page's `loading`/`error`/`captcha`/`notfound` states as one shared component AND wire `bootstrapPlanAccess()` so each `PlanAccessDenial` reason gets an honest screen (`anonymous-disabled` ≠ "bad link"). Then FE.5/FE.6 from `design-system/SPECS.md`.

### T3 — Design
- 2026-09-01: `design-system/SPECS.md` written (4 specs for T2); `FRONTEND_DESIGN_STANDARDS.md` updated (outcome row, `.token` reach, motion budget). `design-system/` bundle regenerated — token shadow now live in the previews, restraint-block notes removed, 3 new cards (decided-plan, payoff-after-dark, front-door-after-dark), stale hand-written `overview.html` deleted (build.mjs is the source of truth). **Canvas push needs the owner to run `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`** — that skill is user-invocation only. Next: spec FE.7's shared state component for T2.

---

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

- **T3 → T2** · implement `design-system/SPECS.md` (FE.1 night hero, FE.5 payoff day-cleanup + After Dark, FE.6 orbit deletion + skyline dormant; FE.2 ratified) · wave-1 visual direction is settled · not blocked · **open**
- **T1 → T2** · in `app/plan/[id]/page.tsx` replace inline `bootstrapAccess` with `bootstrapPlanAccess()` from `lib/supabase.ts`; each `PlanAccessDenial` reason its own screen — `anonymous-disabled` → honest "guest voting is paused" (NOT "link may be invalid"); `captcha-required` → Turnstile; `sign-in-failed`/`claim-failed` → retry; `not-found` → cold-link. Optionally use the `cast_plan_vote` jsonb (`CastVoteResult`) to reconcile optimistic state. · a guest on a live link currently gets blamed for our B1 toggle · not blocked (helper committed) · **open — folded into T2's FE.7 task**
- **T0 → T1** · patch `supabase/migration-023-vote-idempotency.sql`: add `drop function if exists cast_plan_vote(...)` before `create ... function cast_plan_vote`; confirm `schema.sql` jsonb body; SEC.4 (`get_advisors` flags 7 anon-executable functions). · file fails re-run / scratch build (`42P13`); live DB already correct · **DONE** — 023 fix `67a0ccf`; SEC.4 → migration 024 (see T1→T0 below)
- **T1 → T0** · (1) apply `supabase/migration-024-revoke-anon-execute-sec4.sql` via MCP once `security` clears it (review in flight), then record it in `worklog.md` + the runbook — T1 no longer owns root docs. (2) **`rls_auto_enable` is live-only drift**: named in your SEC.4 list but absent from every migration and `schema.sql`. 024 revokes it defensively if present; you need to decide whether it should be captured in `schema.sql` or dropped. · SEC.4 close-out + a scratch rebuild currently can't reproduce the live catalog · not blocked · **open**
- **T1 → qa-test** · two tests vs local/live Supabase (never `schema.sql` re-run): (1) `cast_plan_vote` twice, identical args → identical jsonb + exactly one `votes` row; (2) tally concurrency — two `cast_plan_vote` same participant/round, different spots, parallel → one row survives, `execute_plan_command` counts once. Note: `smoke-test.mjs` `cast_plan_vote` guards now short-circuit on the post-020 anon grant (401) before the validation branch — real coverage needs an authenticated session. · the winner-deciding tally has zero concurrency coverage · not blocked · **open**

---

## Decisions log

- 2026-09-01: 4 terminals (T0–T3). Subagents only to parallelize real fan-out, never linear work.
- 2026-09-01: Model policy — T1 on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + After Dark night atmosphere; `.token` reach = decision-committing surfaces only; FE.6 = delete decision-orbit/ticker/scribble, keep skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
- 2026-09-01: **Moved to git worktrees.** Four sessions in one tree was racing (concurrent commits, near-collisions on `worklog.md` and this file). Each lane isolated on its own branch + worktree; T0 integrates.
