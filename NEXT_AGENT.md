# Instructions for the next agent

Read this file, then `worklog.md`. Do not scan the whole repository — query
the Graphify index in `graphify-out/` first (it was rebuilt 2026-08-10 and is
current), then open only the files the task touches.

---

## 1. Hard rules — do not break these

1. **Never show invented data as a signed-in user's own.** `DemoAccountViews`
   is fixtures and renders **only** when `demoMode` is true (`/home-preview`).
   `AccountViews` is the real one. If a screen has no data, write an honest
   empty state. Do not "fill it in" with examples.
2. **Never read date of birth from `auth` user_metadata.** The browser can
   rewrite it. Use `memberAge(supabase, userId)` from `lib/age-policy.ts`. The
   only write path is the `set_birth_date` RPC, which is write-once.
3. **Never add a column holding a secret to `plans`.** `read plans` is
   `using (true)` and realtime broadcasts whole rows. Secrets go in their own
   table with no select policy — see `plan_host_tokens`.
4. **Never add a direct insert/update/delete policy on `votes`, `rsvps` or
   `ratings`.** Those writes go through the security-definer RPCs
   (`cast_plan_vote`, `set_plan_rsvp`, `rate_plan`). Adding a policy reopens
   the hole migration 018/019 closed.
5. **`lib/types.ts` mirrors the schema.** Change them together, in one pass.
6. **Migrations are additive and numbered.** Next is `migration-020-*.sql`.
   Never edit an applied migration — write a new one. Record it in the runbook
   table in `worklog.md` on the day you apply it.
7. **`supabase/schema.sql` is the end-state for a scratch project, not an
   update path.** It DROPS every table. Never run it against the live project.
   If you add a migration, add the same objects to `schema.sql` — including
   functions and indexes, not just columns. A previous agent added only
   columns and left the file unable to produce a working database.
8. **No new dependencies without a reason you can state.** There is no test
   runner and that is deliberate for now.
9. Do not use green glowing dots or pulsing status lights. Recorded
   permanently in `FRONTEND_DESIGN_STANDARDS.md`.

---

## 2. Verification — run all of these before you say you are done

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run build
npm run test:smoke     # needs the dev server; BASE_URL=http://localhost:3001
git diff --check
```

`npm run test:smoke` asserts 13 live database guards with the anon key. **If
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

### 4.1 Verify the phone layout (do this first — it is cheap and blocks judgement)

The mobile-first pass shipped **visually unverified**: the environment's
browser would not resize below 1342px. The `@media (max-width: 520px)` rules
parse and apply, but nobody has seen them render.

Open the app in a real phone or DevTools device mode at 390px and check:
`/login`, `/onboarding`, `/home` (all five tabs), `/plan/[id]`. Look for
horizontal overflow, the bottom tab bar overlapping content, and the app bar
spacing. Fix what is broken. Done when all five screens are clean at 390px.

### 4.2 Persist the place importer

`components/PlaceLinkImporter.tsx` saves to `localStorage`
(`deal-three:place-links`) and `app/api/place-import/route.ts` validates a URL
and returns it without writing anything. Migration 012 already created
`place_imports`, `place_collections` and `place_collection_items` and **no
code touches them**.

Wire the route to insert into `place_imports` for the signed-in user, and read
the saved list from there. Done when a saved link survives a different
browser. Do not attempt scraping or venue resolution — see the boundary note
in `PLACE_IMPORT_ARCHITECTURE.md`, which describes a pipeline that does not
exist. That document overpromises; treat it as a design sketch, not a
description of the code.

### 4.3 Been collections and photos

Migration 010 created `visit_collections`, `visit_collection_items`,
`visit_photos` and a private Storage bucket. Nothing uses them. The Been view
in `components/AccountViews.tsx` currently lists visits with no grouping.

Add collections backed by those tables, and connect the photo picker to the
Storage bucket. Done when a collection and a photo persist across devices.

### 4.4 Friends that can actually be added

`getFriends` works and is wired, but there is no way to add a friend:
`addFriend`, `removeFriend`, `areFriends`, `getPeople`, `getSpotVisitors`,
`getTaggedVisits`, `deleteVisit`, `untagCompanion` and `upsertMe` in
`lib/social.ts` all have **zero callers**. Friendships currently only exist if
someone writes them by hand.

Give the Friends tab a way to add someone — the natural source is companions
already tagged on a visit, which `logVisit` writes. Done when tagging a
companion who has an account can become a friendship from the UI.

### 4.5 Rate limiting that survives a restart

`app/api/plans/route.ts:7`, `app/api/smart-search/route.ts:31` and
`app/auth/actions.ts:18` are module-level `Map`s. They reset on every cold
start and are bypassed by fanning out across serverless instances. The OTP one
is also **unbounded** — attacker-supplied emails are keys that are never
evicted, which is a memory leak reachable from the internet.

Minimum fix now: cap the OTP map size. Proper fix: move all three to a shared
store (a Postgres table with a timestamp is enough; no new service needed).

### 4.6 A test runner

There is none. `scripts/smoke-test.mjs` is the only automated check. `node --test`
is in the standard library — use it before reaching for a framework. The
highest-value first tests are the pure functions in `lib/age-policy.ts` and
`lib/deal.ts`.

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
- The shared plan page (`app/plan/[id]/page.tsx`) is **anonymous**. Participants
  are identified by a per-plan token whose SHA-256 hash is sent to the RPCs.
  There is no account there. Do not assume `auth.uid()`.
- The host of a plan holds a one-time token in `localStorage`
  (`plan-host:<planId>`). It is never in the URL. Losing it means losing host
  control — account-based recovery is not built.
- `execute_plan_command` is the **only** tally. The client no longer computes
  winners; do not add a second implementation.
- `lib/device.ts` is a legacy device-identity store that predates auth. It is
  partly dead. Do not build new features on it.
- The anon key is public by design. There is no service-role key in this
  project and there must not be one.
