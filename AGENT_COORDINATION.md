# Agent coordination board

The live handoff medium for the parallel Claude Code terminals working this tree.
Sessions share **nothing but the repo** — if it isn't written here or committed,
the other terminals can't see it.

## How to use this file

- **Read it at session start** and again before any large edit.
- **Edit only your own lane's block.** Keep to your section so two terminals
  don't collide on the same lines.
- Post before you start a task, and update when you finish or hand off.
- Cross-lane asks go in **Cross-lane requests**. The other lane picks them up.
- Keep entries short. This is a status board, not a log — the log is `worklog.md`.
- Commit this file with your work so the change actually propagates.

## Terminals

| # | Lane | Model | Owns | Current focus |
|---|---|---|---|---|
| **T0** | Orchestrator / Platform | Sonnet medium | `.github/**`, root `*.md`, `tests/**` config, deploy, load-test harness | context hygiene → CI + Vercel deploy → observability + load baseline |
| **T1** | Backend | **Opus** | `supabase/**`, `app/api/**`, `lib/types.ts`, `lib/supabase.ts`, `lib/ai/**`, `lib/spots/**` | BE.1 share-link vote path; verify migrations 021/022 |
| **T2** | Frontend | Sonnet medium | `app/**`, `components/**`, `globals.css`, `lib/dubai-phase.ts` | FE.1 real front door → FE.2 signature element |
| **T3** | Design (owner-driven) | Sonnet medium | `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md`, Claude Design canvas | visual direction + component specs feeding T2 |

**Model policy.** T1 is the correctness-critical lane (RLS, security-definer
RPCs, live migrations, the winner-deciding tally, concurrency, RAG) → Opus. The
rest → Sonnet medium. Switch temporarily: T0 → Opus for a one-off architecture
design pass (outbox/events, tracing topology); the `security` subagent → Opus
every time it runs; `ai-engineer` work inside T1 → Opus for retrieval
architecture and eval-set design. If T1 is ever on Sonnet, use *high* reasoning
for any migration / RLS / concurrency change.

Security and qa-test are **subagents**, not terminals — whichever lane needs them
invokes them (`security` before committing anything touching RLS/writes/model
output; `qa-test` to verify a wave).

---

## Current goal

**Get the core loop to production.** Critical path:

1. Owner clears B1 (anon sign-ins), B2 (migration 021), B4 (migration 022) — see `PRIORITIES.md`.
2. T1: BE.1 share-link vote path correct + failing honestly until B1 lands.
3. T2: FE.1 real front door so visitors don't hit a login wall.
4. T0: commit CI, wire Vercel deploy + env vars, smoke the deployed build.
5. Then the engineering-hardening layer, per lane.

---

## ⚠️ Uncommitted tree — everyone commit your lane's files NOW

As of 2026-09-01 a prior session left ~13 files of finished-but-uncommitted work
spanning all three lanes. This is the exact condition that wiped this tree once.
**Commit your own lane's files immediately, in parallel, then continue from clean.**

- **T0 done:** `.github/ci.yml`, `package.json` typecheck, `PRIORITIES.md`,
  `orchestrator.md`, `worklog.md` → committed `fd8eda3` + coordination docs.
- **T2 in progress:** the `app/**` + `components/**` + `globals.css` changes.
- **T1 — pick this up:** the backend work below is already written, coherent, and
  uncommitted. It IS your BE.1 + BE.2. Verify and commit it; don't rewrite it.
  - `lib/supabase.ts` — `bootstrapPlanAccess()` + `PlanAccessDenial` union: redeems
    the share uuid, returns a typed reason (`anonymous-disabled` vs `not-found` …)
    instead of throwing, fails closed in prod. This is BE.1's "fail honestly until B1".
  - `supabase/migration-022-*.sql` (untracked) + matching `schema.sql` edits +
    `lib/security/controls.ts` (`"spot-deal"` scope) + `app/api/spots/deal/route.ts`
    (`consumeQuota(supabase, "spot-deal")` + 429). This is BE.2.
  - Run `npm run lint && npm run typecheck && npm test && npm run build` before commit.
  - Do NOT apply 022 to the live DB yourself — that's an owner action (B4).

## Lane status

### T0 — Orchestrator / Platform
- 2026-09-01: trimmed startup reading list; created this board; recorded model policy. Committed CI workflow + orchestration doc catch-up (`fd8eda3`). Next: schema↔types sync check in CI, Vercel deploy wiring.

### T1 — Backend
- 2026-09-01: BE.1 + BE.2 swept onto the branch by T0's pre-worktree sweep
  (`e10d395` backend code, worklog entry in `888fb26` / runbook rows in `9a8a9aa`).
  Verified post-move: lint / tsc / 25 tests / build all green on HEAD.
  - **BE.1** — `lib/supabase.ts` `bootstrapPlanAccess()` returns a typed
    `PlanAccessDenial` (`anonymous-disabled` ≠ `not-found` ≠ `claim-failed` …),
    fails closed in prod. Still **wired nowhere** — the vote page runs its own
    inline `bootstrapAccess`. See cross-lane request to T2.
  - **Migration 023** (`migration-023-vote-idempotency.sql`) — partial unique
    index `votes (plan_id, participant_token_hash, phase, pool_number)` +
    `cast_plan_vote` ON CONFLICT upsert + jsonb return. Closes a concurrent
    double-vote race the tally would double-count. `security` subagent review
    in flight.
  - Live probes 2026-09-01: 021 still unapplied (`valid_control_secret` →
    `200 false`); 022 not externally probable (forged-secret short-circuit) —
    owner verifies in SQL editor, queries in the worklog entry.
  - Migrations 021 / 022 / 023 all unapplied — owner applies in order (B2/B4).
  - Next: address any `security` findings; then BE.3 guard-rail is standing,
    pick up remaining backend queue with the orchestrator.

### T2 — Frontend
- 2026-09-01: FE.1 (`ba6ba6b`) + FE.2/FE.8 (`9bd4042`) verified and committed — gate green (lint/tsc/25 tests/build), desktop hero confirmed in both themes (no login redirect; `.token` offset on primary CTAs). Did the `.home-primary-cta:hover` cleanup T3 noted (removed the touch-device soft glow). No `security` subagent — FE.1/FE.2 touch no RLS/writes/Realtime/model output. Next: FE.3/FE.5/FE.6 per `design-system/SPECS.md` (later wave).

### T3 — Design
- 2026-09-01: Reviewed T2's in-flight FE.1/FE.2 (front door + `.token` revival) —
  ratified. Wrote `design-system/SPECS.md` with four specs for T2: FE.2 token reach
  (vote card + primary commit actions + payoff panel; not Discover/tiles), FE.1
  night hero upgrade (halo + lattice + brass "Tonight in Dubai" plate), FE.5 payoff
  (day cleanup of `DecidedPlan` off-standard Tailwind + After Dark night layer +
  one-shot `ad-sheen` reveal), FE.6 (delete orbit/ticker/scribble, keep skyline
  dormant for FE.3). Updated `FRONTEND_DESIGN_STANDARDS.md` (outcome row, token
  reach, motion budget). Next: regenerate `design-system/` bundle + push canvas.

---

## Cross-lane requests

Format:
> **From → To** · _need_ · _why_ · blocked? · status

- **T3 → T2** · implement `design-system/SPECS.md` (FE.1 night hero upgrade, FE.5
  payoff day-cleanup + After Dark layer, FE.6 orbit deletion + skyline dormant note;
  FE.2 is ratified, one small `.home-primary-cta:hover` cleanup noted) ·
  the visual direction for wave 1 is settled and specced · not blocked · **open**
- **T1 → T2** · in `app/plan/[id]/page.tsx`, replace the inline `bootstrapAccess`
  with `bootstrapPlanAccess()` from `lib/supabase.ts` and give each
  `PlanAccessDenial` reason its own screen: `anonymous-disabled` → an honest
  "guest voting is paused — ask the host to open it, or sign in" (NOT the current
  "link may be invalid"); `captcha-required` → existing Turnstile; `sign-in-failed`
  / `claim-failed` → generic retry; `not-found` → existing cold-link screen.
  Optionally consume the new `cast_plan_vote` jsonb (`CastVoteResult`) to
  reconcile optimistic vote state. · today a guest on a live share link hits a
  dead "could not be opened" screen that blames their link for our B1 toggle ·
  not blocked (helper is committed) · **open**
- **T1 → qa-test** · two tests against a local/live Supabase (never `schema.sql`
  re-run): (1) `cast_plan_vote` twice with identical args → identical jsonb,
  exactly one `votes` row; (2) **tally concurrency** — two `cast_plan_vote` for
  the same participant/round on different spots, fired in parallel → exactly one
  row survives and `execute_plan_command` counts it once. This is the tally
  concurrency test the BE.1 brief asked to place. Also: the `smoke-test.mjs`
  `cast_plan_vote` guards now short-circuit on the post-020 anon grant (401
  "permission denied for function") rather than reaching the validation branch —
  real validation coverage needs an authenticated session. · the winner-deciding
  tally has zero concurrency coverage · not blocked · **open**

---

## Decisions log

Short, dated, one line each. Anything another terminal must not re-litigate.

- 2026-09-01: 4 terminals (T0–T3). Subagents used only to parallelize real fan-out, never for linear work.
- 2026-09-01: Model policy — T1 Backend on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked. See Model policy note above.
- 2026-09-01: Wave-1 visual direction (T3, owner-approved) — front door = ratify T2's structure + add the After Dark night atmosphere; `.token` reach = decision-committing surfaces only (vote card, primary actions, payoff panel), not Discover/tiles; FE.6 = delete the decision-orbit/ticker/scribble CSS, keep the skyline dormant until FE.3. Spec: `design-system/SPECS.md`.
