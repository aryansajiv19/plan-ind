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

## Lanes and parallel dispatch

Added 2026-08-28. The five agents below are unchanged; they are now grouped into
three lanes under an **orchestrator** (`orchestrator.md`), which owns
`PRIORITIES.md`, dispatches lanes in parallel, and commits per wave.

```
orchestrator
├── FRONTEND ····· frontend
├── BACKEND ······ backend-data, ai-engineer
└── SECURITY ····· security   (audit-only, enforced by its tools: line)

shared verifier ·· qa-test    (between waves, not a lane)
```

The old default order (`backend-data → security → frontend → qa-test`) still
describes a **single full-stack task**. It is no longer the default *schedule* —
independent tasks in different lanes run concurrently, because the lanes write
disjoint file sets. When one task genuinely spans layers, it still follows that
order: types are the contract everything codes against, and auditing before the
UI exists means a policy fix costs one file instead of six.

`qa-test` stays a gate rather than a lane because it reports defects instead of
patching them. Running it once after a wave is what lets three lanes proceed
without three separate test passes.

Two boundary calls, so they are not re-litigated: `app/page.tsx` is a route file
and belongs to **Frontend** despite `app/api/**` being Backend's;
`lib/dubai-phase.ts` is new and belongs to **Frontend**.

## Known state and open issues

**Re-verified 2026-08-28 against the live schema.** This section described the
pre-auth v1 world for a long time after that world stopped existing, and every
agent that read it started from a false map. Confirm against `worklog.md` — it
is the migration source of truth — before trusting anything here.

**The old "accepted v1 tradeoff" no longer applies.** This section used to say
every RLS policy was `using (true)` and instruct agents not to report it.
Migration 020 (`production-security`, **applied and verified live 2026-08-24**,
`worklog.md:33`) replaced that posture entirely. There is **no `using (true)`
policy left** on `spots`, `plans`, `plan_spots`, `votes`, `rsvps` or `ratings`.

What is actually true now:

- **Reads are membership-scoped.** `plans`, `plan_spots`, `votes`, `rsvps`,
  `ratings` and `spots` all select through the `plan_access` capability table,
  granted `to authenticated`. `plan_access` itself exposes own-rows-only.
- **Those tables have no direct write policy at all.** Writes go through the
  security-definer RPCs `cast_plan_vote`, `set_plan_rsvp`, `rate_plan`, plus an
  `enforce_plan_membership` trigger. **Never add a direct write policy** — that
  reopens exactly what migrations 018/019 closed.
- **Secrets are isolated.** `plan_host_tokens` has no select policy at all;
  `member_ages` is write-once via `set_birth_date`; `app_control_secrets`,
  `app_rate_limits` and `security_events` have RLS on and **zero** policies,
  reachable only by definer functions.
- **Identity is no longer a self-typed `voter_name`.** Essentially everything
  now requires an authenticated session.

Real open issues, re-probed and still current:

- **The share-link vote path is dead in production.** Anonymous sign-ins are
  disabled in Supabase Auth (`422 anonymous_provider_disabled`), and post-020
  every read needs a session. Nobody but a plan's creator can read or vote on it.
  This is a functional outage, not a leak, and it is the sharpest issue in the
  app. Owner-only fix (dashboard toggle).
- **`valid_control_secret` is a live unauthenticated oracle.** `revoke ... from
  public` in 020 did not cancel Supabase's named grants to `anon`, so it still
  returns `200 false` / `200 true` to a caller with no session.
  `migration-021-revoke-anon-execute.sql` fixes it, is committed, and is
  **unapplied**. Practical risk is low — the secret is 256 random bits.
- **`execute_plan_command` is still `anon`-executable** for the same reason. It
  fails safe (raises rather than returning a boolean), so this is
  defence-in-depth, not a break. Same migration fixes it.
- **Age-restricted venues are enumerable.** `read permitted spots` has no age
  predicate, so any authenticated 13-year-old can list every 21+ venue by name.
  Catalog visibility, not an authorization bypass — `create_secure_plan` does
  enforce age server-side from `member_ages`. Owner-deferred, recorded.
- **No quota on `/api/spots/deal`.** `consume_app_quota` only accepts
  `smart-search`, `plan-create` and `place-import`. Deferred to migration 022.
- **`supabase/schema.sql` DROPs every table on re-run** — far more than the
  original four. Scratch-only. Never point integration tests at real data.

**Superseded, do not re-report:** vote impersonation by typing a friend's name,
cross-plan reach from unscoped `using (true)`, and the open `people`/
`friendships`/`visits` write policies were all real before 020 and are all
closed by it.

**Now installed** (the old "not yet installed" note is stale): a test runner
(`node --test`, 25 tests), a server-side Supabase client, and 21 migrations.
There is still **no service-role key**, and none may be added.

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
