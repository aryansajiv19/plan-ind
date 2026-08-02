# Session handoff — agent team setup

**Date:** 2026-08-02. Written by the Claude Code session that set up
`.claude/agents/`, for whichever session picks up next. Sessions share no
context — only this repo — so this file is the handoff.

## What this session did

Set up a four-agent team in `.claude/agents/`, nothing else. **No application
code was written or modified by this session.** The `app/`, `lib/`, and
`supabase/` files were created by a parallel session, not this one.

Files created:

- `.claude/agents/frontend.md`
- `.claude/agents/backend-data.md`
- `.claude/agents/security.md`
- `.claude/agents/qa-test.md`
- `.claude/agents/README.md` — roster, ownership map, handoff flow, open issues
- `.claude/SESSION-HANDOFF.md` — this file
- `CLAUDE.md` — the `@AGENTS.md` import was **preserved**; a routing block,
  invariants, and repo state were appended below it

All six are **uncommitted** as of writing.

## What happened mid-session (worth knowing)

The working tree was **wiped once** — everything except `.git` was deleted while
this session was writing files, almost certainly a concurrent `create-next-app`
run from the parallel session. It destroyed both this session's files and the
parallel session's first scaffold. Everything was rewritten afterward against
the real code.

Practical lesson for whoever is next: **commit early**. Two sessions in one tree
with uncommitted work is how that happened.

## Ground truth these agents were written against

Read directly from the code, not assumed:

- Product is a **Dubai dinner decider** — plan = share link (the plan uuid is
  the URL slug), exactly three curated spots, yes/no approval voting.
- Four tables in `supabase/schema.sql`: `spots`, `plans`, `plan_spots`, `votes`.
- **No auth.** Identity is a self-typed `voter_name` text field.
- Every RLS policy is `using (true)` / `with check (true)` — a documented,
  intentional v1 tradeoff, with v2 meant to move writes behind an edge function.
- `votes` is unique on `(plan_id, spot_id, voter_name)` and designed for upsert
  so voters can change their mind.
- `votes` and `plans` are in the `supabase_realtime` publication.
- Next 16.2, React 19.2, Tailwind v4 (no `tailwind.config.ts` — `@theme` in
  `globals.css`), TypeScript 5. `app/` at repo root, no `src/`.
- `lib/types.ts` is **hand-written** and hand-synced with the schema.

## What still needs doing

Not started by anyone as far as this session could tell:

1. **Seed `spots`** with real Dubai venues — the app is empty without them.
   → `backend-data`
2. **Build the actual screens.** Only the default Next.js `page.tsx` exists:
   create-plan, `/plan/[id]` vote screen, decided state. → `frontend`
3. **Decide/tally logic** including a deterministic tie-break. Three options and
   a small group tie constantly; nothing implements this yet. → `backend-data`
4. **No test runner installed.** Vitest + Playwright from scratch. → `qa-test`
5. **`@supabase/ssr` is a dependency but unused** — `lib/supabase.ts` builds only
   a browser client. Either use it for server-side reads or drop the dep.
   → `backend-data`

Known issues worth an early `security` pass (detail in
`.claude/agents/README.md`): vote impersonation via `voter_name`, cross-plan
read/update reach from unscoped `using (true)`, `schema.sql` dropping all tables
on re-run, `deadline` and `decided` status being unenforced, `voter_name` not
normalized.

## How to use the team

Invoke by name — "use the `backend-data` agent to seed the spots table" — or
just describe the task and let the orchestrator route it. Full flow in
`.claude/agents/README.md`.
