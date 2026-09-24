@AGENTS.md

# plan-ind

A Dubai hangout decider. One person hosts a plan; the app deals nine curated
spots across three rounds of three; the group votes each round down to a
finalist, then a final round picks the winner. Next.js 16 + React 19 +
Tailwind v4 + Supabase, deployed on Vercel. Intended flow: `docs/PRODUCT_FLOW.md`.

## Start here every session

1. `PRIORITIES.md` — the queue, and what is waiting on the owner.
2. The **last** entry of `worklog.md` — current state. On disagreement,
   `worklog.md` wins and this file gets fixed.
3. Open code on demand. Directory rules auto-load: `app/`, `components/`,
   `lib/`, `lib/ai/`, `supabase/`, `tests/`, `scripts/` each have a `CLAUDE.md`.

Reference, opened only when the task needs it: `docs/` (deployment, design
standards, place import, production checklists). History, only when chasing
*why*: `docs/archive/`.

## Size budgets — context is the scarcest resource

| What | Budget | On breach |
|---|---|---|
| A `CLAUDE.md` | 200 lines, root 80 | Move rules next to the code they describe, or delete what is no longer true |
| A `.ts` / `.tsx` file | 300 soft, 500 hard | Split by responsibility before adding to it |
| `app/globals.css` | no net growth | Delete as much as you add |
| `worklog.md` | 300 lines | Move the oldest entries to `docs/archive/worklog-archive.md` |

Known breaches — leave each smaller than you found it, never add a feature to
one without splitting first: `app/globals.css`, `app/plan/[id]/page.tsx`,
`lib/social.ts`, `components/AccountViews.tsx`.

## Keeping docs true

- A `CLAUDE.md` or skill is a **rule set, not a diary**. Change a rule → edit
  the file in the same commit. A false rule → delete it, don't annotate it.
- Status and history go in `worklog.md` only. No new root-level docs.
- Dead code is context debt: confirm zero callers (including tests, scripts,
  string references), then delete it in its own commit.

## Git and deploys

- Production (`https://plan-ind.vercel.app`) is promoted from the Vercel CLI;
  every pushed branch gets a protected preview. Never push to `main` or
  `ai-engineering` without checking which commit production is running.
- Commit promptly and push. Stage explicit paths while a subagent is working in
  the same tree — never `git add -A`.
- Subagents for genuine fan-out only (independent audits, unrelated files).
  `security` is audit-only; `qa-test` writes tests only.

## Invariants

- **`lib/types.ts` mirrors `supabase/schema.sql`.** Hand-synced; they change
  together. `npm run check:schema` enforces column names in CI.
- **`supabase/schema.sql` DROPs every table on re-run.** Scratch projects only.
  Live change ships as a numbered `supabase/migration-0NN-*.sql`, staged until
  the owner approves the apply, recorded in `worklog.md` the same day.
- **RLS is membership-scoped.** Reads go through `plan_access`;
  `votes`/`rsvps`/`ratings` have no direct write policy — writes go through
  security-definer RPCs. Never add one.
- **Identity is a Supabase Auth session**, anonymous for share-link guests. Age
  comes from server-owned `member_ages`, never a request body or `user_metadata`.
- **`status` is exactly `'open' | 'decided'`.**
- **The publishable/anon key is public by design.** No service-role key exists;
  if one is ever added it is server-only. Nothing secret in `NEXT_PUBLIC_*`.
- Anything touching RLS, voting writes, the Realtime publication, or where
  model output reaches a query/filter/screen → run the `security` subagent.
- Before touching `lib/ai/**` or smart-search, read the `openai-responses`
  skill — Responses API, not Chat Completions.
- **Every live database write is an owner decision**, migrations included.

## Engineering bar

Portfolio-grade: when a change genuinely needs concurrency-safety, idempotency,
caching, background jobs or load work, build the real version and benchmark
before/after. Never add technology for its own sake — clean, concise code that
solves a problem the app actually has.
