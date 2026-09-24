# Instructions for the next agent

**Startup reading is now `CLAUDE.md` → `PRIORITIES.md` → the last `worklog.md`
entry → `AGENT_COORDINATION.md`.** Do not read `CHECKPOINT.md` or all of
`worklog.md` unless a task sends you there.

This file is kept for **§1 (hard rules)**, **§3 (traps that caused real bugs)**,
and the probe traps below — those don't age, and several other docs point at
them by rule number (`house-rules` skill, `.claude/agents/*`, other skills),
so the numbering here stays stable even though the same content is also
duplicated (correctly, not by accident) in `house-rules`, `app/CLAUDE.md` and
`supabase/CLAUDE.md` for sessions that load those automatically. §4-§6 below
are trimmed to what's still true — **2026-09-04's dead-code sweep found and
fixed one fact here that had gone stale** (see §6). Query `graphify-out/` for
structure; open only the files your task touches.

## 1. Hard rules — do not break these

1. **Never show invented data as a signed-in user's own.** `DemoAccountViews`
   is fixtures and renders **only** when `demoMode` is true (`/home-preview`).
   `AccountViews` is the real one. If a screen has no data, write an honest
   empty state. Do not "fill it in" with examples.
2. **Never read date of birth from `auth` user_metadata.** The browser can
   rewrite it. Use `memberAge(supabase, userId)` from `lib/age-policy.ts`. The
   only write path is the `set_birth_date` RPC, which is write-once.
3. **Never add a column holding a secret to `plans`.** Plan reads are now
   membership-scoped by migration 020, but Realtime can still broadcast whole
   authorized rows. Secrets stay in a separate table with no select policy —
   see `plan_host_tokens`.
4. **Never add a direct insert/update/delete policy on `votes`, `rsvps` or
   `ratings`.** Those writes go through the security-definer RPCs
   (`cast_plan_vote`, `set_plan_rsvp`, `rate_plan`). Adding a policy reopens
   the hole migration 018/019 closed.
5. **`lib/types.ts` mirrors the schema.** Change them together, in one pass.
6. **Migrations are additive and numbered.** Fix one in place only until it's
   applied; after that the next number is the only option. Record application
   in `worklog.md`'s runbook table the same day. (Was pinned to a specific
   migration number/date; genericized 2026-09-04 so this rule stops going
   stale every time a new one applies — check `worklog.md` for what's
   actually live today, this rule is about the process, not a snapshot.)
7. **`supabase/schema.sql` is the end-state for a scratch project, not an
   update path.** It DROPS every table. Never run it against the live project.
   If you add a migration, add the same objects to `schema.sql` — including
   functions and indexes, not just columns. A previous agent added only
   columns and left the file unable to produce a working database.
8. **No new dependencies without a reason you can state.** Focused security
   tests use Node's built-in test runner via `npm run test:security`.
9. Do not use green glowing dots or pulsing status lights. Recorded
   permanently in `FRONTEND_DESIGN_STANDARDS.md`.

---

## 2. Verification — run all of these before you say you are done

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run test:security
npm run build
npm run test:smoke     # needs the dev server; BASE_URL=http://localhost:3001
git diff --check
```

`npm run test:smoke` asserts routes, security headers, CSRF behavior, and live
database guards with the publishable key. **If
any fail, stop and fix it — do not commit.** A failure there means a security
control is off in the live project.

Report failures honestly. If something does not pass, say so with the output.
Do not describe work as complete when a check is red.

---

## 3. Traps that have already caused real bugs here

These are mistakes that were actually made in this codebase. Read them before
writing code that looks similar.

- **`setState` inside a `useEffect` body fails lint** (React 19
  `react-hooks/set-state-in-effect`). Derive the value instead, or fetch in the
  Server Component and pass it down as a prop.
- **Do not scroll in a click handler after `setState`.** The DOM has not
  updated yet; the scroll gets undone when the old view unmounts. Put it in an
  effect keyed on the value that changed. This silently broke per-tab scroll.
- **Do not use `router.push` for tab or view state on `/home`.** Its Server
  Component runs three Supabase queries and they all re-run. Use
  `window.history.pushState` — Next supports it and it costs zero requests.
- **A CSS comment inserted between selectors does not split a rule group.**
  Adding a comment above the last selector in a comma list silently applied
  that block's declarations to every selector above it too.
- **Focus rings must not project outward.** Controls here sit 0–9px apart. Use
  `outline: 2px solid var(--color-ink); outline-offset: -2px`. Inline prose
  links are the only exception (`outline-offset: 1px`).
- **Define colours in `@theme` in `app/globals.css`, not per-component.** The
  old palette survived for weeks because `.home-experience` and
  `.vote-experience` each redefined every token locally, so any screen outside
  those two classes rendered in the wrong colours.
- **`PostgREST` returns `200 []` when RLS hides rows AND when a table is
  empty.** A read test that passes either way proves nothing. Assert on a
  write attempt instead.
- **Screenshots from the browser tool in this environment are sometimes
  stale.** Three "bugs" this session were capture artifacts. Confirm anything
  visual with `getComputedStyle` / `getBoundingClientRect` before changing
  code.

---

## 4. Test plans available

Trimmed 2026-09-04 — this section used to be "what to build next," but
`PRIORITIES.md` is that queue now and was drifting out of sync with it. This
part doesn't age, so it stays:

- `11111111-1111-1111-1111-111111111111` — legacy **single-round** plan. Does
  not exercise rounds, round dots or pool advancement.
- `22222222-2222-2222-2222-222222222222` — **three rounds of three**, seeded by
  `supabase/seed-multi-round-plan.sql`. Use this one for anything touching the
  pool flow. The file's footer has the host token and how to test as the host.

---

## 5. Local-only demo tools — do not invent schema for these unasked

`components/DemoPlanningTools.tsx` and `lib/planning.ts` hold moodboards,
circles, the plan lifecycle, reminders and "Wrapped" in `localStorage`, no
backing tables. **Status as of 2026-09-04**: Been's half (`visit_photos`/
`visit_collections`, migration 010) has real schema and is being wired for
real now (`PRIORITIES.md`, `design-system/SPECS.md` §15.2) — that one's no
longer "local-only." The moodboard half genuinely still has zero schema
(§15.3, blocked on a new migration Backend hasn't written yet). Don't assume
either half is still fully fake; check current state before touching.

---

## 6. Facts about this codebase that are easy to get wrong

- `people.id` **equals** the auth user id for authenticated profiles. The
  profile row is created by the idempotent `ensure_authenticated_profile` RPC,
  called server-side in `app/home/page.tsx`.
- The shared plan page (`app/plan/[id]/page.tsx`) now creates a Supabase
  anonymous-auth guest session, redeems the share UUID into `plan_access`, and
  uses authenticated participant RPCs. The typed-name token remains the
  participant identity seam. Do not create durable social profiles for guests.
- The host of a plan holds a one-time token in `localStorage`
  (`plan-host:<planId>`). It is never in the URL. Losing it means losing host
  control — account-based recovery is not built.
- `execute_plan_command` is the **only** tally. The client no longer computes
  winners; do not add a second implementation.
- `lib/device.ts` is **live, not "partly dead"** — corrected 2026-09-04. Its
  pre-Supabase-Auth write path (`saveMe`/`newPersonId`, plus `upsertMe` in
  `lib/social.ts`) was confirmed superseded and removed in this session's
  dead-code sweep; what's left (`getBeen`/`addBeen`, `getMe`/`cacheMe`/
  `clearMe`) is the real, current, fully-wired device-cache mechanism. Build
  on it freely.
- The anon key is public by design. There is no service-role key in this
  project and there must not be one.
