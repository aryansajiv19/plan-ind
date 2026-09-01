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

1. ~~B1 / B2 / B4~~ **all cleared 2026-09-01.** Anon sign-ins LIVE (anon signup
   returns a session token). Migrations 021/022/023 LIVE. Turnstile still off —
   enable before the production deploy (fine for local).
2. T1 — BE.1 vote path ✅. Next: mig-023 file fix, SEC.4 (mig 024), dispatch qa-test.
3. T2 — FE.1 ✅ · FE.2/FE.8 ✅ · next: **FE.7** (`<VoteState>` spec is in SPECS.md) + wire `bootstrapPlanAccess`. Then verify the guest vote path end-to-end at `/plan/22222222-…` — now possible.
4. T0 — CI ✅ · drift check ✅ · dev server running on :3000 for design review · next: Vercel deploy wiring.
5. Then the hardening layer per lane (idempotency ✅ mig-023 → durable rate
   limiting → request IDs / structured logs → load baseline).

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
- 2026-09-01: BE.1 + BE.2 + mig-023 committed (`e10d395`, worklog in `888fb26`/`9a8a9aa`). Post-move gate green (lint/tsc/25 tests/build).
  - **BE.1** `bootstrapPlanAccess()` returns typed `PlanAccessDenial`, fails closed in prod. Wired nowhere yet — see request to T2.
  - **Migration 023** partial unique index + `cast_plan_vote` ON CONFLICT upsert + jsonb return. Closes a concurrent double-vote race the tally would double-count. `security` reviewed — verdict clean + one Low finding, **fixed in the same migration**: dropped the vestigial `unique (plan_id, spot_id, voter_name, phase, pool_number)` on `votes` (post-023 it only mis-fires 23505 when two people type the same name); wrapped 023 in one transaction. Re-gated green on `lane/backend`.
  - Live probes: 021 unapplied (`valid_control_secret` → `200 false`). 021/022/023 all unapplied — owner applies in order (021 → 022 → 023).
  - Next: BE.3 is a standing guard-rail, not a task — pick up remaining backend queue with T0.

### T2 — Frontend
- 2026-09-01: FE.1 (`ba6ba6b`) + FE.2/FE.8 (`9bd4042`) committed, gate green, hero confirmed both themes. Did the `.home-primary-cta:hover` touch-glow cleanup T3 noted.
- **Next task (T0-assigned): FE.7 + T1's request together** — rebuild the vote page's `loading`/`error`/`captcha`/`notfound` states as one shared component AND wire `bootstrapPlanAccess()` so each `PlanAccessDenial` reason gets an honest screen (`anonymous-disabled` ≠ "bad link"). Then FE.5/FE.6 from `design-system/SPECS.md`.

### T3 — Design
- 2026-09-01: `design-system/SPECS.md` written (4 specs for T2); `FRONTEND_DESIGN_STANDARDS.md` updated (outcome row, `.token` reach, motion budget). `design-system/` bundle regenerated — token shadow now live in the previews, restraint-block notes removed, 3 new cards (decided-plan, payoff-after-dark, front-door-after-dark), stale hand-written `overview.html` deleted (build.mjs is the source of truth). **Canvas push needs the owner to run `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`** — that skill is user-invocation only.
- 2026-09-01: FE.7 shared vote-page state component specced in `design-system/SPECS.md` — one `<VoteState kind>` (loading / captcha / guest-paused / retry / cold-link), colourless graphite (a state screen is none of the three colour jobs), reuses `.vote-primary-action` + the `vote-round-in` entrance, no spinner, no icons (no icon lib in repo). `guest-paused` copy is the load-bearing bit — reads "our toggle, not your bad link". Sent to T2. Clear until T2 needs FE.5/FE.6/FE.7 review.

---

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

- **T3 → T2** · implement `design-system/SPECS.md` (FE.1 night hero, FE.5 payoff day-cleanup + After Dark, FE.6 orbit deletion + skyline dormant; FE.2 ratified; **FE.7 shared `<VoteState>` component — new section at the foot of SPECS.md**) · wave-1 visual direction is settled · not blocked · **open**
- **T1 → T2** · in `app/plan/[id]/page.tsx` replace inline `bootstrapAccess` with `bootstrapPlanAccess()` from `lib/supabase.ts`; each `PlanAccessDenial` reason its own screen — `anonymous-disabled` → honest "guest voting is paused" (NOT "link may be invalid"); `captcha-required` → Turnstile; `sign-in-failed`/`claim-failed` → retry; `not-found` → cold-link. Optionally use the `cast_plan_vote` jsonb (`CastVoteResult`) to reconcile optimistic state. · a guest on a live link currently gets blamed for our B1 toggle · not blocked (helper committed) · **open — folded into T2's FE.7 task**
- **T0 → T1** · patch `supabase/migration-023-vote-idempotency.sql`: add `drop function if exists cast_plan_vote(uuid, uuid, text, boolean, text, smallint, text);` immediately before the `create ... function cast_plan_vote` (change `create or replace` → `create`). Confirm `schema.sql`'s `cast_plan_vote` is the jsonb-returning body. Also worth a look for SEC.4: `get_advisors` still flags `set_birth_date`, `current_member_age`, `ensure_authenticated_profile`, `ensure_default_place_collections`, `mirror_friendship`, `people_default_place_collections`, `rls_auto_enable` as anon-executable (same `revoke from public` root cause 021 fixed for its six). · the file as committed fails a re-run / scratch `schema.sql` build (`42P13`); live DB is already correct · not blocked · **open**
- **T1 → qa-test** · two tests vs local/live Supabase (never `schema.sql` re-run): (1) `cast_plan_vote` twice, identical args → identical jsonb + exactly one `votes` row; (2) tally concurrency — two `cast_plan_vote` same participant/round, different spots, parallel → one row survives, `execute_plan_command` counts once. Note: `smoke-test.mjs` `cast_plan_vote` guards now short-circuit on the post-020 anon grant (401) before the validation branch — real coverage needs an authenticated session. · the winner-deciding tally has zero concurrency coverage · not blocked · **open**

---

## Decisions log

- 2026-09-01: 4 terminals (T0–T3). Subagents only to parallelize real fan-out, never linear work.
- 2026-09-01: Model policy — T1 on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + After Dark night atmosphere; `.token` reach = decision-committing surfaces only; FE.6 = delete decision-orbit/ticker/scribble, keep skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
- 2026-09-01: **Moved to git worktrees.** Four sessions in one tree was racing (concurrent commits, near-collisions on `worklog.md` and this file). Each lane isolated on its own branch + worktree; T0 integrates.
