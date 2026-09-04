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

Status: **not yet built** — planned in this pass. Most of that content exists
today inside `NEXT_AGENT.md` §1/§3 and the `.claude/skills/*`, which is the
right content in the wrong place: it loads for everyone or no one.

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

**Planned next in this pass:** hierarchical `CLAUDE.md` split; `NEXT_AGENT.md`
folded into scoped files (its §1 hard rules and §3 traps are the valuable part
and belong next to the code they describe); dead-code sweep with `graphify-out/`
to find genuinely-unreferenced exports rather than guessing.

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
