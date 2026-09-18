# Agent coordination board

The shared handoff medium for the parallel sessions. Sessions share **only the
repo** — if it isn't committed, the others can't see it.

Owned by T0. Read it at startup; edit **only your own lane's block** plus
Cross-lane requests. History lives in `worklog.md` / `worklog-archive.md`, not
here — this file is current state only.

---

## ⏹ All sessions closed 2026-09-18 — production is live

**Every lane branch is merged into `ai-engineering`, every worktree verified
clean, and `ai-engineering` is pushed.** Nothing is in flight. A session
restarting here starts from a settled tree, not a handoff.

The app is deployed: **https://plan-ind.vercel.app**. See `DEPLOYMENT.md` —
including the two owner-only Turnstile steps that still gate sign-in.

| Terminal | Worktree path | Branch | Role |
|---|---|---|---|
| **T0** Lead / Orchestrator | `~/plan-ind` | `ai-engineering` | Integration, merges, CI, deploy, context hygiene, owner interface. Writes no feature code. |
| **T1** Backend / Security | `~/plan-ind-backend` | `lane/backend` | `supabase/**`, `app/api/**`, `lib/security/**`, `lib/supabase.ts`, `lib/types.ts`, `next.config.ts` |
| **T2** Frontend | `~/plan-ind-frontend` | `lane/frontend` | `app/**` (not `app/api/**`), `components/**`, `app/globals.css`, `lib/**` (not security/supabase) |
| **T3** QA / Scale | `~/plan-ind-qa` | `lane/qa` | `tests/**`, load/concurrency harnesses, `package.json` test scripts |

**Design lane is parked**, not deleted — `~/plan-ind-design` / `lane/design`
stay on disk at `dcabd9e`.

`security` (audit-only, no write tools) and `qa-test` are **subagents** callable
from any lane, not lanes themselves.

### Where to pick up

`PRIORITIES.md` holds the queue. The short version, in order:

1. **Owner's two Turnstile steps** — hostname list, secret into Supabase Auth.
   Sign-in is dead in production until both are done.
2. **Migrations 049 + 051** — their gate was the client deploy, which happened.
3. **End-to-end sign-in proven on the live URL.** Everything verified in
   production so far is signed-out.
4. **The cinematic pass (X1–X5)** — queued behind the deploy by the owner.

### Standing owner decisions — ask, never assume

- **No new palette rounds.** Nine revisions moved the complaint zero times; the
  cause was sparseness and content, not colour. `DESIGN_DIAGNOSIS.md`. The
  owner has separately rejected navy-and-gold verbatim.
- **Every live database write is an owner decision, every time** — migrations
  and any mutating click during live verification alike. If it is unclear
  whether a click writes, read the computed state instead.
- **Migration 046 is blocked on the owner**, not on us: 13 approved photos that
  cannot be uploaded from here because bucket writes are refused for every
  client role, by design.

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
   yours. **This covers docker containers and images too** — it bit exactly
   there on 2026-09-16: a cleanup filtered on the Realtime *image* deleted
   another lane's running container mid-load-run, because `docker ps` was not
   printing names and the filter silently matched more than its author could
   see. Remove by exact name or by ids you have just listed and read. A filter
   that matches nothing and a filter that matches too much look identical at
   the call site.
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

**All four closed 2026-09-18.** Each lane maintains its own block when running;
replace, don't append — this is state, not a log.

### T0 — Lead / Orchestrator
Closed. Deployed production, applied eight migrations live with owner approval,
corrected the migration ledger against the catalog and the ledger's filenames
against `supabase/` on disk, archived `worklog.md` back under budget. Merged
every lane and pushed `ai-engineering`.

### T1 — Backend / Security
Closed, tree clean, fully merged. Delivered the C1–C9 "full control" migrations
(052, 054–057, 059, 060) and the apply runbook. Left deliberately: **058 and
059's age-gate consolidation** — both rewrite `create_secure_plan` /
`create_direct_plan` wholesale for no behaviour change, so they are applied
**from the file, never retyped**.

### T2 — Frontend
Closed, tree clean, fully merged. Focus rings unified on `currentColor` (every
filled primary button had no visible ring in day mode), 44px hit areas,
`scroll-margin-top` for the sticky header, `/demo` as the real no-signup page,
demo assets 9.4 MB → 676 KB. Visual baselines deliberately **not** created:
the cinematic pass will invalidate them, and they must be generated on Linux,
not macOS.

### T3 — QA / Scale
Closed, tree clean, fully merged (`a8fdee8`). The Realtime fan-out harness now
separates a refusal from silence — non-ok `system` messages, socket close
codes, per-channel errors — which is what the unexplained 8% event loss at 50
clients needs before anyone theorises about it again. **Never run:** the
automated round-trip tests for C1–C9.

## Cross-lane requests

Format: **From → To** · _need_ · _why_ · blocked? · status

Pruned 2026-09-18 — each entry below was re-checked against the code, not
against memory. Six were found already done and deleted rather than annotated:
friendship consent (closed by migration 048, live), `setRsvp`'s carpool nulling
(`app/plan/[id]/page.tsx:791`), the venue-link result/candidate-picker UI, the
`.home-nav` `100vw` mismatch (now `100%`), and the whole ~452-line dead-code
sweep (`TiltCard.tsx`, `.home-system*`, `.sky-*`, `dealThreeForCategory`,
`venueAllowedForAge` — all verified gone).

- **T2 → T1** · plan membership with names: save the display name at
  `claim_plan_access`, plus a membership-scoped RPC that reads a plan's member
  names · the client can see only people who left a trace (vote, RSVP, rating,
  presence), so the roster cannot honestly show "3 of 5" — the denominator is
  unknowable today · not blocked (it ships as "3 picked") · **open**
- **T2 → T1** · `verifyEmailCode` (`app/auth/actions.ts:103`) still has no
  app-level throttle on OTP guesses. `requestEmailCode` got one in migration
  026, but that is the *request* side; the 6-digit **verify** brute-force
  surface has only Supabase's built-in cap · re-checked 2026-09-18, still true ·
  not blocked · **open, and it matters more now the app is public**
- **T1 → T0** · `images.remotePatterns` in `next.config.ts` · every `next/image`
  sidesteps the missing config with `unoptimized` (`PhotoTile.tsx:60` says so in
  a comment) · re-checked 2026-09-18, still absent. This stops being low
  priority the moment batch-2 photography lands — images are the app's most
  bandwidth-heavy asset class, and on Vercel `unoptimized` means paying full
  size to every visitor · **open, coupled to migration 046**
- **T1 → T2 (informational)** · the design spec says **vote contents must not
  reach the client before a round closes**, server-enforced. Today votes are
  readable as cast. A real product-mechanics change, not scoped — but it is
  written into the intended product.

## Decisions log

Binding decisions only. The reasoning lives in `worklog.md`.

- 2026-09-18: **Production is live at https://plan-ind.vercel.app, and the
  production alias is public on purpose** — the owner puts it on a CV. Only the
  `plan-*-safebox.vercel.app` deployment URLs stay behind deployment protection.
- 2026-09-18: **A `NEXT_PUBLIC_*` variable is verified in the built bundle, not
  in the dashboard.** It is inlined at build time, so "set in Vercel" and
  "present in the app" are different facts that look identical from the
  settings page. Grep the chunk.
- 2026-09-18: **A migration that only refactors is not applied by hand.** 058
  and 059's age-gate consolidation rewrite `create_secure_plan` /
  `create_direct_plan` wholesale for zero behaviour change. Retyping the app's
  two most important functions to buy nothing is a bad trade — apply from the
  file or not at all.
- 2026-09-18: **Delete the data before writing code to protect it.** 053 was a
  rewrite of three core voting RPCs, with its own rehearsal, to guard 45 legacy
  rows that turned out to be the owner's own fixture data. One `delete` closed
  it. Ask what the data *is* first.
- 2026-09-18: **A sentinel must be distinguishable from the failures it
  detects.** 060's privilege probe raised `P0001`, which any ordinary trigger
  also raises, so it swallowed real failures. It raises a private `PT060` now.
  Same shape as the wider rule below: empty, refused and truncated are three
  different things.
- 2026-09-18: **Verify a ledger's filenames against the disk, not just its
  claims against the catalog.** Six of ten rows added to the migration runbook
  today named files that do not exist. The ledger has been wrong three times;
  every time it was trusted prose rather than a checked fact.
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
