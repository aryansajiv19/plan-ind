@AGENTS.md

# plan-ind

A Dubai dinner decider. One person starts a plan and gets a share link; friends
open it, vote yes/no on three curated spots on their own time, and the plan
resolves to a winner. Next.js 16 + React 19 + Tailwind v4 + Supabase. Auth is a
real Supabase session post-migration-020; the share-link guest path uses
anonymous sessions.

## Start here every session

1. `PRIORITIES.md` — the work queue and the owner-blocked list.
2. The **last** entry in `worklog.md` — current state. On any disagreement,
   `worklog.md` wins over this file and this file gets fixed.
3. `AGENT_COORDINATION.md` — what the other live terminals are doing right now.
4. Query `graphify-out/` for structure; open only the files your task touches.
   Do not scan the repo.

Deeper history when a task needs it: `CHECKPOINT.md` (archive), `NEXT_AGENT.md`
(§1–3 are traps + hard rules that don't age).

## Parallel work

More than one Claude Code session runs in this tree. Sessions share nothing but
the repo — files on disk are the whole handoff medium.

- **Check `git status` and `AGENT_COORDINATION.md` before large edits. Commit
  promptly** — an uncommitted tree was wiped here once by a concurrent run.
- **Stay in your lane's files** (table below). One owner per file; need one you
  don't own, file a cross-lane request in `AGENT_COORDINATION.md`.
- **Use subagents / agent teams to parallelize when it genuinely saves wall
  clock** — a broad fan-out search, an independent audit, several unrelated
  files. Do **not** spawn them for a single linear task; each one costs tokens
  and starts cold. Default to doing the work yourself; reach for `Agent` only
  when the work is actually parallel.

## Lanes

| Lane | Agents | Writes | Never touches |
|---|---|---|---|
| **Frontend** | `frontend` | `app/**`, `components/**`, `globals.css`, `lib/dubai-phase.ts` | `supabase/**`, `lib/types.ts` |
| **Backend** | `backend-data`, `ai-engineer` | `supabase/**`, `lib/types.ts`, `lib/supabase.ts`, `app/api/**`, `lib/ai/**` | `components/**`, `globals.css` |
| **Security** | `security` | *nothing* — audit only, no Write tool | — |

`qa-test` is the verifier run **between** waves, not a lane: it writes tests only
and reports defects rather than patching them. `app/page.tsx` is Frontend's (it
is a route file); `lib/dubai-phase.ts` is Frontend's. Full ownership map and
handoff protocol: `.claude/agents/README.md`.

Anything touching RLS, voting writes or the Realtime publication always includes
Security — as does anything where model output reaches a query, a filter, or the
screen. Before any change under `lib/ai/**` or the smart-search route, read the
`openai-responses` skill: this repo uses the Responses API, not Chat
Completions, and training data will steer you wrong.

## Invariants

- **`lib/types.ts` mirrors `supabase/schema.sql`.** Hand-synced, no codegen.
  They change together, in one pass, by one agent.
- **`supabase/schema.sql` drops all four tables when re-run.** Safe for
  structure, destroys all data. Never run it against a database holding real
  plans, and never point integration tests at one.
- **RLS is membership-scoped, not permissive.** Migration 020 (applied live
  2026-08-24) replaced the old `using (true)` posture: reads go through
  `plan_access` granted `to authenticated`, and `votes`/`rsvps`/`ratings` have
  no direct write policy at all — writes go through security-definer RPCs.
  **Never add a direct write policy on those three**; that reopens the hole
  migrations 018/019 closed.
- **Identity is a Supabase Auth session, not a self-typed name.** `voter_name`
  is still the display label on a vote, but post-020 essentially every read and
  write requires an authenticated user. Age comes from server-owned
  `member_ages` via `memberAge()` — never from a request body or
  `auth.user_metadata`, which the browser can rewrite.
- **`status` is exactly `'open' | 'decided'`.** No `closed`.
- The **anon key is meant to be public**. There is no service-role key in this
  project; if one is ever added it must be server-only.

## Engineering bar

This project is being taken seriously as a software-engineering portfolio piece.
When a change naturally calls for concurrency-safety, idempotency, caching with
invalidation, background jobs, observability (request IDs, structured logs,
metrics), load/perf measurement, or DB query tuning — implement the real version
and **benchmark before/after** so the outcome is a concrete number. Do not add
technology for its own sake, and do not overengineer: every addition must solve a
problem the app actually has and be explainable end to end. See the owner's full
brief in the session that recorded it and in auto-memory `engineering-bar`.
