@AGENTS.md

# plan-ind

A Dubai dinner decider. One person starts a plan and gets a share link; friends
open it, type a name, and vote yes/no on exactly three curated spots on their
own time; the plan resolves to a winner. Next.js 16 + React 19 + Tailwind v4 +
Supabase, **no auth in v1** — access is "you have the link."

## Agent routing

Four specialized subagents live in `.claude/agents/`. Acting as orchestrator,
route work to them rather than doing it inline:

- **`frontend`** — `app/**` JSX, `components/**`, Tailwind v4 theme in
  `globals.css`, forms, browser Realtime subscriptions
- **`backend-data`** — `supabase/schema.sql`, RLS, Realtime publication,
  `lib/types.ts`, `lib/supabase.ts`, spot seed data, decide/tally logic
- **`security`** — audit-only, no write tools
- **`qa-test`** — unit, Supabase integration, and E2E tests

**Default full-stack order:** `backend-data` → `security` → `frontend` →
`qa-test`. Single-layer tasks go straight to the one owner. Anything touching
RLS, voting writes, or the Realtime publication always includes `security`.

Full ownership map, handoff protocol, and known open issues:
`.claude/agents/README.md`.

## Invariants

- **`lib/types.ts` mirrors `supabase/schema.sql`.** Hand-synced, no codegen.
  They change together, in one pass, by one agent.
- **`supabase/schema.sql` drops all four tables when re-run.** Safe for
  structure, destroys all data. Never run it against a database holding real
  plans, and never point integration tests at one.
- **RLS is intentionally permissive in v1** (`using (true)` everywhere), a
  documented MVP tradeoff. Don't loosen it further; don't silently tighten it
  either — surface the choice.
- **Identity is a self-typed `voter_name`.** There is no user or session. Any
  feature that assumes a trusted identity is building on sand.
- **`status` is exactly `'open' | 'decided'`.** No `closed`.
- The **anon key is meant to be public**. There is no service-role key in this
  project; if one is ever added it must be server-only.

## Repo state

`app/` (layout, page, globals.css), `lib/supabase.ts` (browser client only),
`lib/types.ts`, `supabase/schema.sql` (four tables: `spots`, `plans`,
`plan_spots`, `votes`). **No test runner installed.** `@supabase/ssr` is a
dependency but unused so far. More than one Claude Code session may be working
in this tree — check `git status` before large edits and commit promptly.
