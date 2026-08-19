# Instructions for the next agent

Read this file, then `worklog.md` and the latest section of `CHECKPOINT.md`.
Do not scan the whole repository. Query the Graphify index in `graphify-out/`
first (rebuilt 2026-08-19: 794 nodes / 1,245 edges), then open only the files
the task touches.

## Current handoff — 2026-08-19

- A large, intentional security and visual-quality implementation is present
  in the worktree and is **not committed**. Do not discard or reset it.
- `supabase/migration-020-production-security.sql` is implemented and mirrored
  in `supabase/schema.sql`, but has **not been applied to the live Supabase
  project**. Deployment instructions are in `SECURITY_SETUP.md`.
- The next product task is visual alignment verification in the installed
  Mobile Preview extension at `http://localhost:3001`. Workspace defaults are
  in `.vscode/settings.json` (iPhone 13 Pro). The phone auto-scales to remaining
  vertical space, so keep the terminal short by dragging its top divider down.
- Development intentionally omits anti-framing headers so the extension can
  embed localhost. Production still sends `X-Frame-Options: DENY`, COOP/CORP,
  and CSP `frame-ancestors 'none'`.
- Latest green checks: ESLint, TypeScript, `npm run test:security`, webpack
  production build, expanded HTTP/database smoke suite, `git diff --check`,
  and `npm audit` with zero findings.

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
6. **Migrations are additive and numbered.** Migration 020 is pending live
   deployment. Fix it in place only before it is applied; after deployment the
   next number is 021. Record application in `worklog.md` that same day.
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
`getTaggedVisits`, `deleteVisit`, `untagCompanion` and `upsertMe` in
`lib/social.ts` all have **zero callers**. Friendships currently only exist if
someone writes them by hand.

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
