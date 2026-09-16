# Agent coordination board

The shared handoff medium for the parallel sessions. Sessions share **only the
repo** — if it isn't committed, the others can't see it.

Owned by T0. Read it at startup; edit **only your own lane's block** plus
Cross-lane requests. History lives in `worklog.md` / `worklog-archive.md`, not
here — this file is current state only.

---

## ⟳ Re-orged 2026-09-16 — content over palette, and a real scale target

The four previous sessions dropped their connections and were closed. **Nothing
was lost** — all worktrees verified clean, every lane branch already merged into
`ai-engineering`.

Two things changed the plan since the last board:

1. **`DESIGN_DIAGNOSIS.md` ended the palette work.** Nine palette revisions in
   one day did not move the owner's complaint once. The cause is not colour —
   it is that there is **nothing to show** (6 photos across 82 venues) and the
   feed is **gated behind auth + DOB**. Read that file before proposing any
   visual work. A tenth palette round is the one thing explicitly forbidden.
2. **The owner wants this to hold real traffic.** Verbatim: deployed on the
   web, "a lot of users," "it has to be able to handle this." Scale is now a
   first-class lane, not a deprioritised hardening list.

| Terminal | Worktree path | Branch | Role |
|---|---|---|---|
| **T0** Lead / Orchestrator | `~/plan-ind` | `ai-engineering` | Integration, merges, CI, context hygiene, owner interface. Writes no feature code. |
| **T1** Backend / Security | `~/plan-ind-backend` | `lane/backend` | `supabase/**`, `app/api/**`, `lib/security/**`, `lib/supabase.ts`, `lib/types.ts`, `next.config.ts` |
| **T2** Frontend | `~/plan-ind-frontend` | `lane/frontend` | `app/**` (not `app/api/**`), `components/**`, `app/globals.css`, `lib/**` (not security/supabase) |
| **T3** QA / Scale | `~/plan-ind-qa` | `lane/qa` | `tests/**`, load/concurrency harnesses, `package.json` test scripts |

**Design lane is parked**, not deleted. `~/plan-ind-design` / `lane/design` stay
on disk at `dcabd9e`. Its remaining queue is downstream of photography, and the
one open aesthetic question is the owner's to answer, not Design's to guess.

`security` (audit-only, no write tools) and `qa-test` remain **subagents**
callable from any lane, not lanes themselves.

### The mission, in priority order

Straight from the corrected diagnosis. Everything below #1 is downstream of it:

1. **Photography** — 6 of 82 venues have a photo. The single largest gap, and
   every app the owner compared us to is photo-led. `PLACES_INGESTION_SCOPE.md`,
   ~$0 at this volume. **T1 leads.**
2. **Faces and presence** — the only item needing no new content, and the
   *social* half of what the owner asked for is about people, not photographs.
   Actionable immediately. **T2 leads.**
3. **Scale** — prove the app holds thousands of concurrent users, with numbers.
   **T3 leads**, T1 fixes what it finds.
4. **Ungate the feed** — `app/home/page.tsx:26` `requireUser()` + `:29` DOB
   redirect mean nobody sees a single Dubai venue without an account. Cheap,
   but only worth arriving at once (1) has landed.
5. **Deal nine on defaults immediately**, configuration as refinement. Do
   **not** delete the configuration — it is the product's value.

### Open owner decisions — ask, never assume

- **Metallics / high contrast.** The diagnosis floated "gold on black"; the
  owner has already rejected that verbatim (*"i dont like the navy blue gold
  theme"*). It must be **asked**, not proposed as the answer. Round ten wearing
  a different hat is the exact failure this is guarding against.
- **Migration 039 is HELD** — it points six `photo_url`s at a bucket containing
  zero files. The owner uploads `scripts/spot-photos/`'s six images first. A
  broken image is worse than a null, because it asserts a photo exists.
- **Vercel is PARKED.** Linked, 8 env vars set, one preview verified, production
  never deployed. The scale work does not un-park it. Do not resume deploying
  without an explicit go.

---

## Standing rules — every lane, every time

**Reporting (owner, 2026-09-06):** keep owner-facing messages **short**. Lead
with the decision or the ask. Approvals: what it is, what it changes, one line
of risk. Findings: what broke, what it means, whether it's fixed. Depth goes in
`worklog.md`, not the message.

**Show, don't tell (owner, 2026-09-06):** if a change is *visible*, the owner
sees it — screenshot it and send it, before/after when it's a fix. A described
change they cannot see does not count as reported. Known trap: the hero
entrance animation doesn't run headless, so `/home-preview` shots blank there —
that's the harness, not the app.

**Report to T0 before you commit, push, or implement anything non-trivial.**
Owner's instruction, 2026-09-16, and it applies to subagents too — a subagent
reports to its parent lane, the lane reports to T0.

**Live writes are an owner decision, every time.** That covers schema
migrations *and* any mutating click during live-browser verification. If
there's doubt whether a click writes, read the computed state instead.

**No new palette rounds.** See `DESIGN_DIAGNOSIS.md`.

**Mobile work stays paused** (owner, 2026-09-04) — but this is *not* licence to
remove the 44px tap-target floor or any existing media query. That's regression
territory.

**Don't over-engineer.** Owner, 2026-09-16: "clean, concise code… spiraling can
cause unwanted garbage code that is not even used." Every addition solves a
problem the app actually has. Benchmark before/after when the claim is
performance — a number, not an adjective.

### Isolation rules — non-negotiable

These exist because four sessions in one tree raced and nearly lost work once.

1. **Work only inside your own worktree.** Never `cd` into another's, never
   `git checkout` another's branch, never edit through another's path.
2. **Commit only to your own branch.** T0 does every merge.
3. **Stay on your turf.** Need a file you don't own? Post a cross-lane request.
   Do not "just quickly fix" someone else's file.
4. **Claim shared files with an expiry condition, never an open end.** A
   `⚠️ FILE CLAIM` names the paths *and* what releases it. A claim with no
   release condition already blocked a lane for two days once.
5. **Talk through T0.** SendMessage T0 for integration or another lane's work;
   async status goes in this file.
6. **`npm install` after any sync that changed `package.json`** — worktree
   `node_modules` are real directories, not symlinks, so they drift.
7. **Never kill processes by name pattern** (`pkill -f "next dev"`) — every
   worktree runs the same process names. Kill only a PID you've confirmed is
   yours.
8. **Never `git add -A` while a subagent is working in your worktree.** Stage
   explicit paths. Worktrees isolate lanes from each other; they do **not**
   isolate a subagent from its parent. This already corrupted two commits.

**Subagents:** genuine fan-out only (a broad search, an independent audit,
several unrelated files) — never a single linear task, that burns tokens for no
speed gain.

### Verification gate

`npm run lint && npm run typecheck && npm test && npm run build` green **in your
own worktree** before any non-trivial commit. The `security` subagent runs
before committing anything touching RLS, write RPCs, the Realtime publication,
or a path where model output reaches a query/filter/screen.

### Engineering-bar technique ownership

| Technique | Owner |
|---|---|
| Concurrency-safety, idempotent mutations, indexing/query tuning, rate limiting, authz/input validation, audit logging, structured logging + request IDs | **T1** |
| Load/perf testing (p50/p95/throughput/error-rate), concurrency + integration coverage, E2E | **T3** |
| E2E against the running app (Playwright) | **T3**, with T2 fixing UI defects it finds |
| Caching (Redis or otherwise) | **T1 implements, only once T3 measures a real hotspot.** Never speculative. |
| Background jobs/queues, outbox | **Nobody yet** — revisit when the photo ingestion backfill lands, which is the first genuinely async workload. |
| CI/CD, deploy, observability infra | **T0** |
| AI / search (`lib/ai/**`) | `ai-engineer` subagent. **B3 is not what the record said** — the key works; it is a free-tier 10 req/min + 50/day cap. Read `lib/ai/`'s worklog entry before touching it. |

## Worktrees

- `.env.local` in each lane worktree is a **symlink** to the main tree — leave it.
- `node_modules` is a real directory per worktree (~500MB each), not a symlink.
- **T0 integrates:** `lane/*` → `ai-engineering`, then back down to each `lane/*`
  so everyone shares one base. Ask T0 for a sync when you need another lane's work.

## File ownership

Home turf, no ping needed — the table in the re-org section above. Ownership is
deliberately fuzzy between T1 and T2 on anything with a bug in it; the tiebreak
is which file it lives in.

- `app/page.tsx` is a route file → T2.
- `qa-test` writes `tests/**` only. `security` has no write tools.
- Root `*.md`, `.github/**`, deploy config → T0.

---

## Lane status

Each lane maintains its own block. Replace, don't append — this is state, not a log.

### T0 — Lead / Orchestrator
Re-org done 2026-09-16: board rewritten (780 → ~200 lines), QA lane and
`~/plan-ind-qa` worktree created, stale waves cleared from `PRIORITIES.md`.
Next: dead-code sweep, then integration as lanes report in.

### T1 — Backend / Security
Dispatched 2026-09-16 on P1.1 (venue photography pipeline). Plan owed to T0
before building.

### T2 — Frontend
P2.2 was already shipped (`a739f26`). Dead-code sweep committed (`ef1ead5`,
663 lines). P2.1 plan approved (roster from visible traces, "3 picked" never
"N of M"); combined P2.1 + R5/R6 plan with T0. R4 held: wiring `addFriend`
needs a consent model first (see T2 → T1 below).

### T3 — QA / Scale
Dispatched 2026-09-16 on P3.1 (concurrency at thousands of users). Measurement
plan owed to T0 before the harness is built.

---

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

- **T2 → T1** · plan membership with names: save the display name at
  `claim_plan_access`, plus a membership-scoped RPC that reads a plan's member
  names · the client can see only people who left a trace (vote, RSVP, rating,
  presence), so P2.1 cannot honestly show "3 of 5" — the denominator is
  unknowable today · not blocked (P2.1 ships on "3 picked") · **open**
- **T2 → T1 / security** · ⚠ `friendships` consent: "add own friendships" allows
  any `friend_id`, `mirror_friendship` (security definer) writes the reverse
  edge, and "read permitted visits" then exposes that person's visit log. Any
  permanent account can befriend an arbitrary uuid and read their history with
  no consent — reachable via PostgREST today. `user_id` on votes/rsvps (043)
  may hand plan co-members those uuids. Needs a request/accept model before
  R4 (`addFriend` UI) ships · blocks R4 · **open**
- **T1 → T2** · 🟡 `app/plan/[id]/page.tsx`'s `setRsvp()` needs one line: pass
  `p_transport: mine?.transport ?? null, p_seats_available: mine?.seats_available ?? null`
  to the existing `set_plan_rsvp` RPC · migration 035 **is live**, and its update
  branch fully replaces both fields from whatever it's given — so every ordinary
  "coming/maybe/no" tap silently nulls out a carpool answer · not blocked ·
  **open, real now that 035 is applied**
- **T1 → T2** · venue-link enrichment has a real API contract —
  `GET /api/place-import` returns `status`, `resolvedSpot`, and `candidates` when
  `needs_input`. Result/candidate-picker UI is T2's · not blocked · **open**
- **T1 → T0** · `images.remotePatterns` in `next.config.ts` · every `next/image`
  currently sidesteps the missing config with `unoptimized`; **this stops being
  low-priority the moment photography lands** — it is the app's most
  bandwidth-heavy asset class · **open, now coupled to priority #1**
- **T2 → T1** · `verifyEmailCode` (`app/auth/actions.ts`) has no app-level
  throttle on OTP guesses — `requestEmailCode` got one in migration 026
  (request-side), but the 6-digit *verify* brute-force surface has only
  Supabase's built-in cap. Assess or add a counter · not blocked · **open**
- **T0 → T2** · `.home-nav`'s `max(1rem, calc((100vw - 76rem) / 2))` (`globals.css:664`)
  still mixes `100vw` against `100%` padding · not reproducible on Mac overlay
  scrollbars; real (~7-8px) on classic-scrollbar users · low priority · **open**
- **T0 → T2** · 🧹 **dead-code deletions, audited and verified 2026-09-16 — ~452 lines, all in your turf.** Zero-reference confirmed by word-boundary grep across `app/**` + `components/**`; take them as one subtractive commit, no refactor riding along:
  - `app/globals.css:1367-1517` — `.home-system*` cluster, 24 rules, **151 lines**. The panel was replaced by the card deck.
  - `components/TiltCard.tsx` — whole file, **108 lines**. Matched pair with the above; the only surviving reference is a passing comment at `HomeExperience.tsx:189`, delete that too.
  - `app/globals.css:725-910` — `.sky-*` skyline + 7 `[data-phase]` palettes, **127 lines**. `data-phase` appears 7× in CSS and **0×** in any `.tsx`; `components/SkylineBackdrop.tsx` no longer exists, and FE.3 (the revival that justified keeping it) never shipped. Git has the component at `44804eb` if it is ever genuinely wanted back — reviving it now means rebuilding, not re-tinting.
  - `app/globals.css:2331-2370` `.home-library*` (**34**), `:1189-1204` `.home-eyebrow` (**16**), `:1059-1066` `.home-theme-toggle` (**8**, toggle never built), `:578-582` `.rosette`/`.rosette-show` (**5**, dropped from `OptionCard` in `8c3581c`), `:2447,2449` `.auth-field` singular (**2**, only `.auth-fields` is used), `:485` `.wall-tile--fill-blue` (**1**).
  - `lib/deal.ts:40` `dealThreeForCategory` (**3**, thin wrapper, zero callers), `lib/age-policy.ts:45` `venueAllowedForAge` (**3**, zero callers).
  - **Do NOT touch** `lib/social.ts`'s 8 friend/visit functions or `lib/dubai-phase.ts`'s `subscribeToGround`/`currentGround` — both verified **deferred, not dead** (the latter by commit `2be06b4`, *"Park dark mode: disable the path, keep the machinery"*). And `lib/supabase/proxy.ts`'s `updateSession` is live via root `proxy.ts` (Next 16 renamed middleware→proxy), invisible to a naive grep.
  · not blocked · **open**
- **T1 → T2 (informational)** · the design README specifies that **vote contents
  must not reach the client before a round closes**, server-enforced. Today votes
  are readable as cast. A real product-mechanics change, not scoped — but it is
  written into the intended product.

---

## Decisions log

Binding decisions only. The reasoning lives in `worklog.md`.

- 2026-09-16: **Re-orged to 4 sessions — T0 lead, T1 backend/security, T2
  frontend, T3 QA/scale.** Design parked. Mission reordered behind
  `DESIGN_DIAGNOSIS.md`: photography → faces/presence → scale → ungate →
  deal-on-defaults. Palette work closed.
- 2026-09-07: **Migration 045 applied live** — all five published tables now
  `replica identity full`. Under `default`, a DELETE's WAL record carries only
  the PK, so Realtime **silently dropped the event while the client stayed
  SUBSCRIBED**: un-voting left every other participant reading a stale tally.
  Production defect, not local.
- 2026-09-07: **The repo's dominant bug class, stated precisely.** A discarded
  error is only dangerous when the empty value is a plausible reading of the
  world. `[]` votes means "nobody voted" — plausible, therefore dangerous. `[]`
  spots means "a plan with no places" — impossible, therefore self-caught. Use
  that test to decide which error sites matter instead of guarding all of them.
  Treat **empty, refused and truncated as three different things.**
- 2026-09-07: **Trust the app over the instrument.** A standalone probe reported
  Realtime had "never worked in production" and nearly justified a migration; the
  probe was wrong (it called `realtime.setAuth()` before joining, which the real
  client doesn't). The more dramatic version would have been believed.
- 2026-09-07: **B3 was never "credits exhausted."** Free tier, 10 req/min and 50
  req/day. The OpenAI SDK's default `maxRetries: 2` sleeps through a
  minutes-long `Retry-After` — in production that holds a serverless invocation
  open for up to half an hour. Both harness and route now pass `maxRetries: 0`.
- 2026-09-07: **AI evals are UNRUN, and reported as such.** Two scored cases got
  through before the daily cap. Two is not an accuracy number. Exit code 2,
  printed UNRUN — explicitly not a pass and not a failure.
- 2026-09-06: **Never hand-edit a security-reviewed migration during its own
  apply.** 035 shipped with a known NULL-guard bug rather than being amended
  mid-apply; the fix got its own migration (040).
- 2026-09-06: **Migrations 035/036/037/038/040/041 are LIVE. 039 is HELD**
  pending the owner uploading six images. 045 live as of 2026-09-07.
- 2026-09-06: **Observability exists** — `instrumentation.ts` +
  `lib/observability/log.ts`. Redaction matches by substring marker, not exact
  name; probing a running server caught two credential headers no list would
  have held. Tracing deferred until a deploy target exists.
- 2026-09-04: **Photos and transportation both resolved to the free version.**
  No paid Places API yet. Transit = straight-line distance + "Open in Maps,"
  which already renders RTA's live data. A direct RTA integration is gated
  behind a government data-exchange, not a self-serve key.
- 2026-09-01: **Worktrees.** Four sessions in one tree was racing. Each lane
  isolated on its own branch; T0 integrates.
