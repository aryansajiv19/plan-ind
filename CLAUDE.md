@AGENTS.md

# plan-ind

A Dubai hangout decider. One person hosts a plan; the app deals nine curated
spots across three rounds of three; the group votes each round down to a
finalist, then a final round picks the winner. Next.js 16 + React 19 +
Tailwind v4 + Supabase. Full intended flow: `PRODUCT_FLOW.md`.

## Start here every session

1. `AGENT_COORDINATION.md` — who is doing what right now, file ownership, and
   which terminal you are.
2. `PRIORITIES.md` — the queue.
3. The **last** entry of `worklog.md` — current state. On any disagreement,
   `worklog.md` wins over this file and this file gets fixed.
4. Query `graphify-out/` for structure. **Do not scan the repo.**

Domain rules load automatically when you work in a directory —
`supabase/CLAUDE.md`, `app/CLAUDE.md`, `components/CLAUDE.md`. History, only
when chasing *why*: `worklog-archive.md`, `CHECKPOINT.md`.

## Parallel work

Four Claude sessions run in separate git worktrees off `ai-engineering`. They
share **nothing but the repo** — commit or it didn't happen.

- **Stay in your lane's files** (`AGENT_COORDINATION.md` has the map). Off your
  turf → post a cross-lane request first.
- **Commit promptly.** An uncommitted tree was wiped here once.
- **Subagents/agent-teams for genuine fan-out only** — a broad search, an
  independent audit, several unrelated files. Never for a single linear task;
  each starts cold and costs tokens.
- `security` (audit-only, no write tools) and `qa-test` (tests only) are
  subagents callable from any terminal, not lanes.

## Invariants

- **`lib/types.ts` mirrors `supabase/schema.sql`.** Hand-synced, no codegen;
  they change together in one pass. CI enforces it.
- **`supabase/schema.sql` DROPs every table on re-run.** Scratch projects only.
- **RLS is membership-scoped, not permissive.** Reads go through `plan_access`
  granted `to authenticated`; `votes`/`rsvps`/`ratings` have no direct write
  policy — writes go through security-definer RPCs. Never add one.
- **Identity is a Supabase Auth session, not a self-typed name.** Age comes
  from server-owned `member_ages`, never a request body or `user_metadata`.
- **`status` is exactly `'open' | 'decided'`.** No `closed`.
- **The anon key is public by design.** There is no service-role key; if one is
  ever added it must be server-only.
- Anything touching RLS, voting writes, the Realtime publication, or where
  model output reaches a query/filter/screen → run the `security` subagent.
- Before any change under `lib/ai/**` or smart-search, read the
  `openai-responses` skill — this repo uses the Responses API, not Chat
  Completions, and training data will steer you wrong.

## Engineering bar

This is a portfolio-grade project. When a change genuinely calls for
concurrency-safety, idempotency, caching with invalidation, background jobs,
observability, load measurement or query tuning — build the real version and
**benchmark before/after** so the outcome is a number. Never add technology for
its own sake: every addition must solve a problem the app actually has and be
explainable end to end.

Context discipline is part of the bar: `CONTEXT_HYGIENE.md`.
