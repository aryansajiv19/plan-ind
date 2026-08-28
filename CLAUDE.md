@AGENTS.md

# plan-ind

A Dubai dinner decider. One person starts a plan and gets a share link; friends
open it, type a name, and vote yes/no on exactly three curated spots on their
own time; the plan resolves to a winner. Next.js 16 + React 19 + Tailwind v4 +
Supabase, **no auth in v1** — access is "you have the link."

## Agent routing

An **orchestrator** (`.claude/agents/orchestrator.md`) sits above five agents
grouped into three lanes. It owns `PRIORITIES.md`, dispatches lanes in parallel,
and commits per wave once the verifier is green.

| Lane | Agents | Writes | Never touches |
|---|---|---|---|
| **Frontend** | `frontend` | `app/**`, `components/**`, `globals.css`, `lib/dubai-phase.ts` | `supabase/**`, `lib/types.ts` |
| **Backend** | `backend-data`, `ai-engineer` | `supabase/**`, `lib/types.ts`, `lib/supabase.ts`, `app/api/**`, `lib/ai/**` | `components/**`, `globals.css` |
| **Security** | `security` | *nothing* — no Write/Edit tool | everything |

`qa-test` is the shared verifier run **between** waves, not a lane: it writes
tests only and reports defects rather than patching them.

The lanes touch disjoint file sets, which is what makes parallel dispatch safe.
Two boundary calls already made: `app/page.tsx` is a route file, so Frontend's
despite `app/api/**` being Backend's; `lib/dubai-phase.ts` is Frontend's.

Skills live in `.claude/skills/`. Frontend: `design-standards`,
`ui-implementation`, `a11y-responsive`. Backend: `migrations`, `rls-policies`,
`openai-responses`. Security: `security-review`, `code-review`, `secrets-audit`.
Every lane inherits `house-rules`.

Anything touching RLS, voting writes or the Realtime publication always includes
the Security lane — as does anything where model output reaches a query, a
filter, or the screen.

Before any change under `lib/ai/**` or the smart-search route, read the
`openai-responses` skill: this repo uses the Responses API, not Chat
Completions, and training data will steer you wrong.

Full ownership map and handoff protocol: `.claude/agents/README.md`.
Current work queue: `PRIORITIES.md`.

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

## Repo state

Re-verified 2026-08-28. This section described the v1 scaffold for a long time
after it stopped being true — if it disagrees with `worklog.md`, `worklog.md`
wins and this gets fixed.

- **`app/`** — `home`, `home-preview`, `login`, `onboarding`, `plan/[id]`,
  `privacy`, `terms`, plus `api/` (`plans`, `plans/[id]/command`, `smart-search`,
  `place-import`, `spots/deal`) and `auth/callback`. 16 routes build.
- **`lib/`** — `supabase.ts` (browser **and** server clients; `@supabase/ssr` is
  in use), `types.ts`, `auth.ts`, `age-policy.ts`, `avatar.ts`, `deal.ts`,
  `spots/match.ts`, `security/`, `ai/`.
- **`supabase/`** — 21 numbered migrations plus `schema.sql`. Far more than four
  tables: the core four, plus `auth.users`, `people`, `friendships`, `visits`,
  `rsvps`, `ratings`, `plan_access`, `plan_host_tokens`, `member_ages`,
  `app_control_secrets`, `app_rate_limits`, `security_events`, and the
  place-import and visit-collection tables.
- **Tests exist.** Node's built-in runner: `npm run test` → 25 tests across
  `tests/*.test.ts`. `test:security` and `test:wrapped` are aliases for it and
  filter nothing. `test:smoke` needs a live server and real credentials.
- **`design-system/`** — a generated preview bundle synced to Claude Design.

More than one Claude Code session may be working in this tree — check
`git status` before large edits, and commit promptly. An uncommitted tree was
destroyed here once.
