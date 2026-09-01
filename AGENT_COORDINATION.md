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

| # | Lane | Owns | Current focus |
|---|---|---|---|
| **T0** | Orchestrator / Platform | `.github/**`, root `*.md`, `tests/**` config, deploy, load-test harness | context hygiene → CI + Vercel deploy → observability + load baseline |
| **T1** | Backend | `supabase/**`, `app/api/**`, `lib/types.ts`, `lib/supabase.ts`, `lib/ai/**`, `lib/spots/**` | BE.1 share-link vote path; verify migrations 021/022 |
| **T2** | Frontend | `app/**`, `components/**`, `globals.css`, `lib/dubai-phase.ts` | FE.1 real front door → FE.2 signature element |
| **T3** | Design (owner-driven) | `design-system/**`, `FRONTEND_DESIGN_STANDARDS.md`, Claude Design canvas | visual direction + component specs feeding T2 |

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

## Lane status

### T0 — Orchestrator / Platform
- 2026-09-01: trimmed `CLAUDE.md` + `NEXT_AGENT.md` startup reading list; created this file. Next: commit CI workflow, add schema↔types sync check, set up Vercel deploy.

### T1 — Backend
- _(post status here)_

### T2 — Frontend
- _(post status here)_

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
