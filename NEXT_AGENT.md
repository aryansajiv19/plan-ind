# Instructions for the next agent

**Startup reading is now `CLAUDE.md` → `PRIORITIES.md` → the last `worklog.md`
entry → `AGENT_COORDINATION.md`.** Do not read `CHECKPOINT.md` or all of
`worklog.md` unless a task sends you there.

This file is kept for **§1 (hard rules)**, **§3 (traps that caused real bugs)**,
and the probe traps below — those don't age. Skim them once per session. The
dated handoff narrative below §3 is historical; trust `worklog.md` over it.
Query `graphify-out/` for structure; open only the files your task touches.

## Current handoff — 2026-08-24 (AI-engineering workstream)

**Working branch: `ai-engineering`** (from `main` at `3dd972b`). Current commits:

- `38d0138` — the `ai-engineer` agent + `openai-responses` skill.
- `ece3d3d` — migration 021 implementation and migration-020 smoke guard.
- `470ca28` — shared-plan access/RLS race fix.
- `3d07a6a` — real-data monthly Wrapped recap.

**Full plan: `~/.claude/plans/i-want-to-build-binary-heron.md`. Read it — it has
the phase order, the design decisions and the reasoning behind each.**

### 🔴 Two live blockers the OWNER must clear, in this order

**1. Enable anonymous sign-ins in Supabase Auth.** Live status is
`anonymous=false`; session creation returns `anonymous_provider_disabled`.
Migration 020 made the share-link flow redeem a UUID into `plan_access` via an anonymous
session — so with anon sign-ins off, **no browser can reach `access === "ready"`
and the entire shared-plan vote path is dead.** Plan *creation* works; opening a
share link does not. This is `SECURITY_SETUP.md` §2 and it is not optional
post-020. Verify by loading `/plan/22222222-2222-2222-2222-222222222222`.

**2. Paste `supabase/migration-021-revoke-anon-execute.sql`.** Fixes a live
brute-force oracle — `valid_control_secret` is callable by `anon` and returns a
boolean, confirming whether a guessed server-control secret is correct. Root
cause: `revoke ... from public` does not cancel Supabase's named grants to
`anon`/`authenticated`. The file ends with a `select` that reports the resulting
privileges. Then set the runbook row in `worklog.md` to applied.

Still open from `SECURITY_SETUP.md`: Turnstile, OTP expiry <= 10 min, and the
daily `purge_security_operational_data()` cron.

### Completed implementation checkpoint

- `470ca28` guards the initial plan read until `access === "ready"` and renders
  the access-checking state before the not-found branch. This prevents post-020
  RLS from turning the pre-claim read into a false not-found result. Live browser
  reproduction remains blocked until anonymous sign-ins are enabled.
- `3d07a6a` moves Wrapped into the real signed-in Profile view. It computes the
  current `Asia/Dubai` calendar month from real plans, visits, group labels,
  ratings and spot metadata; uses deterministic tie-breaking; labels the best
  place as a group rating; omits unavailable partial stats; and shows an honest
  empty/error state. Share uses Web Share with clipboard fallback and accessible
  status feedback. Demo-only hard-coded Wrapped was removed.
- Wrapped has eight focused aggregation tests. `npm run lint`,
  `npx tsc --noEmit --pretty false`, `npm run test:security`,
  `npm run test:wrapped`, `npm run build`, `npm run test:smoke`, and
  `git diff --check` passed. The build covered 15 routes. `test:smoke:020`
  remains red only at the live migration-021 oracle guard.

### The AI phases, and what gates them

`OPENAI_API_KEY` is valid, `gpt-5.6-luna` is a real model and
`text-embedding-3-small` is available, but **the account has zero credits** — a
1-token embeddings call returns `429 insufficient_quota`. Backfilling the whole
spot catalog would cost about **$0.0002**. Everything below is buildable and
testable offline against fixtures; none of it can be demonstrated live until the
account is topped up. Do not report a 429 as a pass.

Recommended order (details and reasoning in the plan file):

1. **Server-side retrieval, no AI yet.** Move the body of `dealSpotsForCategory`
   into `POST /api/spots/deal`; reduce `lib/deal.ts` to a `secureJsonFetch` with
   the same signature. `lib/deal.ts` runs in the **browser**, so it can never
   embed a query. This also closes a real hole: `age` is a client-supplied prop
   (`StartPlanForm.tsx:296`) used by a browser-side filter, so a hostile client
   passes `age: 99`; server-side it comes from `memberAge()`.
2. **Migration 022 — pgvector.** `vector(1536)` on `spots`, a generated
   `embed_text` column plus `embedding_hash` for free incremental staleness, the
   missing `spots (source, category)` btree index, and a `match_spots()` RPC that
   is **`security invoker`** so it respects 020's `read permitted spots`.
   **No vector index at ~100 rows.** Age/budget in `WHERE`, similarity only in
   `ORDER BY` — ranking must never re-admit an excluded row.
3. **Observability.** Cheap version first: `security_events` already has a
   `metadata jsonb` column and 90-day retention; widening its type list to
   include `ai_call` is a few lines. Only add Langfuse (~6 packages, a root
   `instrumentation.ts`, a flush dance) if a `security_events` row stops
   answering the question. Langfuse can only trace the *product's* LLM calls,
   never Claude Code's subagents.
4. **Tool-calling loop.** Two tools, one object literal, no registry
   abstraction. `search_spots` (the RAG step) and `check_weather`
   (**Open-Meteo — verified working with no API key and no SDK**). Security
   filters are never model-callable: the model picks what to look for, the
   server decides what it may see.

**Friend invites are not a frontend-only task.** Current RSVP companions are
typed names, not consented account identities, and the existing direct symmetric
friendship write has no request/acceptance seam. Preserve **022 for pgvector**.
Build the account-linking and consent-based friend-request seam as **migration
023**, then wire the UI. Do not expose broad profile search or infer identity by
matching display names.

Wrapped on real data is complete in `3d07a6a`.

### Probing the live database — two traps that already caused false conclusions

- **PostgREST resolves functions by exact parameter-name set.** A wrong arg list
  returns `PGRST202`, identical to a missing function. Copy signatures out of the
  migration file. A 4-arg probe of `cast_plan_vote` (it takes 7) produced a false
  "missing" this session.
- **Do not test the control secret through `consume_app_quota`.** Its guard is
  `not valid_control_secret(...) or uid is null or ...`, so an unauthenticated
  call raises the same `42501` whether the secret is right or wrong. That
  produced a false "secret rejected" conclusion before it was caught.

---

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
6. **Migrations are additive and numbered.** Migration 020 is **applied and
   verified live** (2026-08-24). Migration 021 is written, committed and
   **unapplied** — fix it in place only until it is applied; after that the next
   number is 022. Record application in `worklog.md` that same day.
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

## 4. What to build next, in this order

Each item says what "done" means. Do one at a time and commit it.

### 4.0 Test plans available

- `11111111-1111-1111-1111-111111111111` — legacy **single-round** plan. Does
  not exercise rounds, round dots or pool advancement.
- `22222222-2222-2222-2222-222222222222` — **three rounds of three**, seeded by
  `supabase/seed-multi-round-plan.sql`. Use this one for anything touching the
  pool flow. The file's footer has the host token and how to test as the host.

### 4.1 Verify and refine the phone layout

Mobile Preview 3.1.9 is installed in Cursor and now renders the app at an
iPhone viewport. The first screenshot confirms the home preview loads, but a
systematic alignment pass has not happened yet.

Open the app in a real phone or DevTools device mode at 390px and check:
`/login`, `/onboarding`, `/home` (all five tabs), `/plan/[id]`. Look for
horizontal overflow, the bottom tab bar overlapping content, and the app bar
spacing. Fix what is broken. Done when all five screens are clean at 390px.

### 4.2 Deploy and verify migration 020

Follow `SECURITY_SETUP.md`: apply migration 020, insert the hashed server-control
secret, enable anonymous sign-ins and Turnstile, configure legal variables,
and schedule cleanup. Then test one permanent user and one anonymous guest on
a shared plan. Do not claim the new RLS/quota layer is live until this is done.

### 4.3 Been collections and photos

Migration 010 created `visit_collections`, `visit_collection_items`,
`visit_photos` and a private Storage bucket. Nothing uses them. The Been view
in `components/AccountViews.tsx` currently lists visits with no grouping.

Add collections backed by those tables, and connect the photo picker to the
Storage bucket. Done when a collection and a photo persist across devices.

### 4.4 Friends that can actually be added

`getFriends` works and is wired, but there is no way to add a friend:
`addFriend`, `removeFriend`, `areFriends`, `getPeople`, `getSpotVisitors`,
`getTaggedVisits`, `deleteVisit` and `untagCompanion` in `lib/social.ts` all
have **zero callers** — deferred, waiting on this exact feature, not dead.
(`upsertMe` used to be on this list too; removed 2026-09-04's dead-code sweep
— it predated `ensure_authenticated_profile`/`cacheMe`, which replaced it,
not a function still waiting on this feature.) Friendships currently only
exist if someone writes them by hand.

Give the Friends tab a way to add someone — the natural source is companions
already tagged on a visit, which `logVisit` writes. Done when tagging a
companion who has an account can become a friendship from the UI.

### 4.5 Durable rate limiting (completed, verify after deployment)

Migration 020 adds Postgres-backed per-minute/per-day quotas and a global AI
cap. Server routes use `lib/security/controls.ts`; process-local maps are gone.
The live database needs migration 020 and the hashed control secret before
these RPCs enforce production traffic.

### 4.6 Test runner (completed)

`tests/security.test.ts` runs with Node's built-in runner. Extend it for pure
security/request logic and keep `scripts/smoke-test.mjs` for HTTP/live guards.

---

## 5. Decisions waiting on the owner — do not decide these yourself

- **Champagne contrast.** `#9b7d4e` is 3.37:1 on the ivory ground. That fails
  WCAG AA for small text and affects every uppercase kicker in the app.
  Darkening to about `#7a6038` passes, but it visibly shifts a brand colour the
  owner has iterated on repeatedly. Ask before changing it.
- **Per-category colour.** `lib/categories.ts` used to carry 23 accent colours
  that nothing rendered; they were removed. If category colour is wanted, it
  must be added deliberately and actually applied — not restored blindly.
- **The local-only demo tools.** `components/DemoPlanningTools.tsx` and
  `lib/planning.ts` hold moodboards, circles, the plan lifecycle, reminders and
  "Wrapped" in `localStorage`. **No tables exist for any of them.** Do not
  invent schema for these without being asked which are real product features.

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
- `lib/device.ts` is a legacy device-identity store that predates auth. It is
  partly dead. Do not build new features on it.
- The anon key is public by design. There is no service-role key in this
  project and there must not be one.
