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
- _(post status here — start from the ⚠️ section above)_

### T2 — Frontend
- 2026-09-01: found FE.1/FE.2/FE.8 fully implemented but uncommitted in the tree. Verifying (lint/tsc/build/browser) and committing the frontend-owned files in two commits. Not touching backend/security files.

### T3 — Design
- _(post status here)_

---

## Cross-lane requests

Format:
> **From → To** · _need_ · _why_ · blocked? · status

- _(none yet)_

---

## Decisions log

Short, dated, one line each. Anything another terminal must not re-litigate.

- 2026-09-01: 4 terminals (T0–T3). Subagents used only to parallelize real fan-out, never for linear work.
- 2026-09-01: Model policy — T1 Backend on Opus, T0/T2/T3 on Sonnet medium, `security` subagent on Opus when invoked. See Model policy note above.
