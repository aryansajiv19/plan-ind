# plan-ind agent team

Five specialized subagents, each owning a distinct slice of the work. The main
Claude Code session acts as **orchestrator**: it reads a task, routes it, and
sequences the handoffs. You can also invoke any agent directly by name.

**The app:** a Dubai group-plan decider. A planner deals nine places across
three pools and gets a share link; the group votes each pool down to one, and a
final vote picks the outing. Next.js 16 (App Router) + React 19 + Tailwind v4 +
Supabase, plus a natural-language layer ("Luna") over the OpenAI Responses API.

> **This file described the original v1 in places and is being corrected as
> areas are touched.** The app now has Supabase Auth (Google + email OTP),
> 20 migrations, pooled voting, and a security model far past `using (true)`.
> The public share-link vote is still name-based and link-trusted — that part
> of the v1 posture is real. Treat `worklog.md` as the source of truth for what
> is applied live, and `CHECKPOINT.md` for what was built.

---

## The roster

| Agent | Owns | Never touches |
|---|---|---|
| **`frontend`** | `app/**` JSX, `components/**`, `globals.css` theme, forms, browser Realtime subscriptions | `supabase/schema.sql`, RLS, `lib/types.ts` shapes, decide logic |
| **`backend-data`** | `supabase/schema.sql`, tables, RLS, Realtime publication, `lib/types.ts`, `lib/supabase.ts`, spot seed data, decide/tally logic | JSX, components, Tailwind, copy |
| **`security`** | Audits everything. Findings only — **no write tools** | Any implementation, refactor, or test edit |
| **`qa-test`** | `**/*.test.ts`, `e2e/**`, `scripts/smoke-test.mjs`, fixtures, test config | Production code in `app/`, `components/`, `lib/`, `supabase/` |
| **`ai-engineer`** | `app/api/smart-search/**`, `lib/ai/**`, `lib/spots/match.ts`, `lib/deal.ts`, embedding backfill, `instrumentation.ts` | `supabase/**.sql`, components, styling, tests |

Two rules make this work:

1. **One owner per file.** Need a file you don't own? File a cross-boundary
   request (below) — don't edit across the line.
2. **The builder never audits their own work.** `security` reviews the others;
   `qa-test` verifies behavior independently.

---

## File ownership map

```
app/**/*.tsx             → frontend
app/globals.css          → frontend       (Tailwind v4 @theme lives here)
components/**            → frontend
supabase/*.sql           → backend-data   (migrations are additive + numbered)
lib/types.ts             → backend-data   (must mirror schema.sql exactly)
lib/supabase.ts          → backend-data
**/*.test.ts, e2e/**     → qa-test
scripts/smoke-test.mjs   → qa-test
app/api/smart-search/**  → ai-engineer
lib/ai/**                → ai-engineer
lib/spots/match.ts       → ai-engineer
lib/deal.ts              → ai-engineer
instrumentation.ts       → ai-engineer
```

**`ai-engineer` writes no SQL.** It needs a column, an index or an RPC → it
files a cross-boundary request to `backend-data` naming the exact signature.
The `.claude/skills/openai-responses` skill holds the model-call contract and
should be read before any change under `lib/ai/**`.

`lib/types.ts` and `supabase/schema.sql` are **hand-synced** — no generated
types. They must change together, in one pass, by one agent. That pairing is the
single most breakable thing in this repo.

---

## The default handoff flow

```
  backend-data  ──▶  security  ──▶  frontend  ──▶  qa-test
   schema, RLS,      audit the       wire the       lock the
   types, decide     data layer      UI to it       behavior in
                          │                              │
                          └──── findings go back ────────┘
                               to the owning agent
```

**Why this order:** the typed contract in `lib/types.ts` is what everything else
codes against, so data goes first. Auditing before the UI exists means a policy
fix costs one file instead of six. Tests come last so they lock in settled
behavior rather than guessing at the spec.

**Loop back, don't push through.** A Critical from `security` returns to
`backend-data` and gets re-audited before `frontend` builds on it.

### Shorter routes

| Task | Route |
|---|---|
| Restyle the vote card, fix mobile layout | `frontend` only |
| Add an index, seed more spots | `backend-data` only |
| "Can someone vote as me?" | `security` only |
| Backfill tie-break cases | `qa-test` only |
| Tune a prompt, add a tool, change the intent schema | `ai-engineer` only |
| Semantic retrieval / embeddings | `backend-data` (column + RPC) → `ai-engineer` (query path) → `security` |
| Feature touching UI + data | full chain |
| Anything touching RLS, voting writes, or the Realtime publication | full chain — **always** include `security` |
| Anything where model output reaches a query, a filter, or the screen | include `security` — prompt injection and the age gate are its beat |

---

## Cross-boundary requests

An agent that needs something it doesn't own stops and reports:

> **To:** `backend-data`
> **Need:** a deterministic tie-break for the 3-spot case, exposed as a pure
> function I can render the result of.
> **Why:** the decide screen currently shows whichever row came back first.
> **Blocked:** yes.

The orchestrator routes it; the requester resumes once the contract exists.

---

## Known state and open issues

Grounded in the actual code as of setup — worth confirming before acting, since
these agents were written while another session was scaffolding.

**Accepted v1 tradeoff:** every RLS policy is `using (true)` / `with check
(true)`. The schema comments own this explicitly ("no auth in v1... acceptable
for an MVP link-shared app; v2 tightens this by moving writes behind an edge
function"). Do **not** report that as a novel finding — but do report where it
reaches further than "you have the link" implies.

Real open issues these agents are primed to catch:

- **Vote impersonation.** Identity is a self-typed `voter_name`. Upsert on
  `(plan_id, spot_id, voter_name)` means typing a friend's name silently
  overwrites their vote. Sharpest issue in the app.
- **Cross-plan reach.** `using (true)` isn't scoped by `plan_id`, so reads and
  the `decide plans` update policy may span every plan in the database, not just
  the one you were linked.
- **`schema.sql` drops all four tables on re-run.** Advertised as "safe to
  re-run" — safe for structure, destroys all data. Never point integration tests
  at a database with real plans.
- **`deadline` is decorative.** Nothing rejects a post-deadline vote, and
  nothing stops votes on a `decided` plan.
- **"Exactly three options" is app logic**, not a database constraint.
- **`voter_name` isn't normalized** — `"Sara"` and `"sara "` are different
  voters, which quietly breaks the tally.

**Not yet installed:** no test runner (Vitest/Playwright), no server-side
Supabase client, no service-role key. `@supabase/ssr` is a dependency but
`lib/supabase.ts` only builds a browser client.

---

## Working notes

**Read `AGENTS.md` first.** It warns that this is Next.js 16 and its APIs differ
from training data — check `node_modules/next/dist/docs/` before using an App
Router API you haven't verified in this version.

**Parallel sessions.** Claude Code sessions share **no memory or context** — only
this repo. Files on disk are the entire handoff medium, which is why `CLAUDE.md`
(auto-loaded in every session here) carries the invariants and this README
carries the boundaries. Check `git status` before large edits.

**Commit promptly.** This tree was wiped once by a concurrent scaffolding run
while these files were being written. Uncommitted work is the only work at risk.

**Keep these files honest.** They describe the code as it is today. When the
schema changes, update the agent that owns it in the same pass.
