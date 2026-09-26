# plan-ind agent team

Six subagents, each owning a distinct slice of the work. The main
Claude Code session acts as **orchestrator**: it reads a task, routes it, and
sequences the handoffs. You can also invoke any agent directly by name.

**The app:** a Dubai group-plan decider. A planner deals nine places across
three pools and gets a share link; the group votes each pool down to one, and a
final vote picks the outing. Next.js 16 (App Router) + React 19 + Tailwind v4 +
Supabase, plus a natural-language layer ("Luna") over the OpenAI Responses API.

`worklog.md` is the source of truth for what is applied live.

---

## The roster

| Agent | Owns | Never touches |
|---|---|---|
| **`frontend`** | `app/**` JSX, `components/**`, `app/styles/*`, forms, browser Realtime subscriptions | `supabase/schema.sql`, RLS, `lib/types.ts` shapes, decide logic |
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
app/styles/*.css         → frontend       (Tailwind v4 @theme: app/styles/tokens.css)
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

## Lanes

`orchestrator.md` groups these into Frontend / Backend / Security lanes for
parallel waves. The order above still holds for one task that spans layers.

State (what is applied live, what is open) lives in `worklog.md` and
`PRIORITIES.md`, never here.
