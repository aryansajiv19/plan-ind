# Context hygiene

Owned by **T0**. The goal is simple: every session should start knowing what it
needs and nothing else. Context is the scarcest resource in a 4-terminal setup —
every token spent re-reading stale history is a token not spent on the work.

This file is both the policy and the running ledger.

## The rules

1. **`CLAUDE.md` is a router, not an encyclopedia.** It auto-loads into every
   session in this repo, so every line costs tokens four times over. It should
   say *where* to look, not *what* is there. Target: under ~60 lines.
2. **Hierarchical `CLAUDE.md`.** A directory-scoped `CLAUDE.md` only loads when
   a session is working in that directory, so put domain rules next to the
   domain. See "Hierarchy" below.
3. **Live state and history are different files.** `worklog.md` is live state
   (recent, actionable). `worklog-archive.md` and `CHECKPOINT.md` are history —
   read only when chasing *why* something was built. Split again when
   `worklog.md` passes ~600 lines.
4. **Every doc states its own read-trigger.** A file nobody knows when to open
   gets opened always (waste) or never (rot).
5. **Delete beats archive; archive beats leaving it in the hot path.** A doc
   describing code that no longer exists is worse than no doc — it actively
   misleads. This repo has done that twice already (`CLAUDE.md`'s "Repo state"
   section, `.claude/agents/README.md`'s RLS claims).
6. **Dead code is context debt too.** Unused exports, orphaned components and
   zombie CSS all get read by whoever greps nearby. Removing them shrinks every
   future session's working set, not just the bundle.

## Startup reading order (keep this current)

1. `CLAUDE.md` — auto-loaded, routes you.
2. `AGENT_COORDINATION.md` — who is doing what right now, file ownership.
3. `PRIORITIES.md` — the queue.
4. The **last** entry of `worklog.md` — current state.
5. Query `graphify-out/` for structure. **Do not scan the repo.**

Anything else is opened on demand, per its stated trigger.

## Hierarchy

Root `CLAUDE.md` holds only what is true everywhere: the invariants, the
routing, the engineering bar. Domain rules live in a scoped `CLAUDE.md` that
loads only when someone works there:

| Path | Holds |
|---|---|
| `CLAUDE.md` (root) | Invariants, startup order, lane routing, engineering bar |
| `supabase/CLAUDE.md` | Migration rules, RLS posture, the probe traps that have caused false conclusions |
| `components/CLAUDE.md` + `app/CLAUDE.md` | Next 16 / React 19 traps, the CSS restraint rules, theme scoping |
| `lib/ai/CLAUDE.md` | Responses-API contract (training data will steer you wrong here) |

Status, corrected 2026-09-04 — **the ledger here was stale, not the work**:
`supabase/CLAUDE.md`, `app/CLAUDE.md` and `components/CLAUDE.md` all already
exist and hold exactly what this table says. Only `lib/ai/CLAUDE.md` is
genuinely still missing, and for a real reason — `lib/ai/` doesn't exist as a
directory yet (B3 blocks all AI work from starting), so there's nothing for
it to auto-load for. Build it alongside the first real file under `lib/ai/`,
not standalone before then; the `openai-responses` skill covers the same
ground by explicit invocation in the meantime.

## Ledger

Append an entry per pass. Numbers, not adjectives.

### 2026-09-04 — pass 1 (T0)

**Baseline:** 7,399 lines of Markdown outside `node_modules`.
Hot-path docs: `CLAUDE.md` 88, `AGENT_COORDINATION.md` 199, `PRIORITIES.md` 136,
`worklog.md` 910, `NEXT_AGENT.md` 306.

- **`worklog.md` 910 → 595 lines** (−35%). Split 2026-08-10/11's v1 build-out
  (323 lines: participant identity seam, RSVP choices, host-command security,
  early UI/UX + mobile checkpoints, migration-order audits) into
  `worklog-archive.md`. The migration runbook and everything from 2026-08-19
  onward stay live. Nothing deleted.

### 2026-09-04 — pass 2 (T0)

- **`worklog.md` 1,042 → 498 lines** (−52%). Grew back past the 600-line
  trigger from a single day's shipped work (§1-§14, migration 035, the
  critical bug fix, load testing). Archived 2026-08-19 through 2026-09-02
  (production hardening through the palette-reset handoff) into
  `worklog-archive.md`, now 877 lines. Kept every 2026-09-04 entry live —
  today is the day actually being chased for "why," not history yet.
- **Dead-code sweep, verified not guessed**: `saveMe`/`newPersonId`
  (`lib/device.ts`) + `upsertMe` (`lib/social.ts`) removed — confirmed
  superseded by `ensure_authenticated_profile`+`cacheMe` via commit
  ordering (792b84b predates 8c3581c), not deferred work; zero callers
  confirmed with a word-boundary grep after an earlier pass falsely
  flagged `randomAvatar` by excluding same-file callers. Found one real
  gap in the same sweep, not dead code: `clearMe()` existed, nothing
  called it on sign-out — fixed. One security note the deleted code
  carried (`people`/`visits` fully bulk-readable, an untracked "H1")
  preserved in `PRODUCTION_CHECKLISTS.md` before the code holding it was
  deleted. `git-secrets` scan also done this pass (gitleaks, clean,
  `PRODUCTION_CHECKLISTS.md`).

**Planned next:** hierarchical `CLAUDE.md` split; `NEXT_AGENT.md` folded into
scoped files (its §1 hard rules and §3 traps are the valuable part and belong
next to the code they describe) — not done this pass, `NEXT_AGENT.md` was
only touched to fix one stale reference the dead-code sweep left behind.

## Dead code — method

Do **not** delete on a hunch. The rule that has held here:

1. Find candidates via `graphify-out/` (zero-caller exports) or `grep -r`.
2. **Confirm zero callers**, including dynamic references — a string in a config
   or a `data-*` attribute is a caller.
3. Check `git log` for *why* it exists. Something added deliberately and left
   dormant (e.g. the skyline CSS kept for a planned phase engine) is deferred
   work, not dead code — leave it and note it.
4. Delete in its own commit, separate from behavioral change, so it reverts
   cleanly.

Known standing candidates, unverified: `lib/device.ts` (documented as "partly
dead, do not build on it"), several `lib/social.ts` exports with no UI callers,
`components/DemoPlanningTools.tsx` + `lib/planning.ts` (localStorage demo
features with no backing tables). **None of these are cleared for deletion** —
the social ones are pending features, not corpses. Verify before touching.
