# Deal three worklog — archive (2026-08-10 → 2026-08-11)

Split out of `worklog.md` on 2026-09-04 for context hygiene. Historical only:
the v1 build-out and its checkpoints. The migration runbook and everything
from 2026-08-19 onward stay in `worklog.md`.


## Security handoff re-verification — 2026-08-11

- Re-ran the live 019 guard suite after the security review: all 13 smoke checks passed, including host-secret isolation, forged host rejection, participant RPC validation, and immutable age storage.
- `npm run lint`, `npx tsc --noEmit --pretty false`, `git diff --check`, and `npm run build` pass.
- No duplicate security migration is needed. Continue from `NEXT_AGENT.md` with the 390px phone-layout verification.

`schema.sql` is the end-state description for a scratch project, not an update
path. It now includes the RPCs, which it was missing — a project built from the
old copy could be read but never written to. `setup.sql` was deleted: it was a
drifted subset of the same thing.

## Security hardening — 2026-08-10

Closed the P0/P1 findings the previous review recorded but did not implement.
All of them were still open; the shape of each fix is the same, moving a secret
or a rule somewhere the client cannot reach.

- **Host token.** `plans.host_token_hash` was readable by anyone with a share
  link (`read plans` is `using (true)`) and was broadcast over realtime on every
  host command. Moved to `plan_host_tokens`, insert-only, no select policy.
  Patching the individual `select("*")` calls was rejected as a fix: the next one
  would reintroduce it.
- **Participant RPCs.** Migration 018 validated a token-hash regex and nothing
  else — no function read `plans` at all. Added spot-in-plan membership, plan
  status, stage/phase agreement, pool bounds, winner-only rating, and non-empty
  names.
- **Date of birth.** Lived in auth `user_metadata`, which any signed-in browser
  can rewrite, so the 13/18/21 gates were self-certified. Now `member_ages`,
  written only by the write-once `set_birth_date` RPC. Existing accounts are
  carried over by the migration. `safeAgeFromMetadata` is replaced by
  `memberAge()` so no caller can read the age from metadata again.
- **Legacy write paths.** The three direct-write fallbacks in
  `app/plan/[id]/page.tsx` were revoked by 015 and failing silently — the decide
  fallback did not check its error at all. Deleted, along with the duplicate
  client-side tally that only existed to feed them. `execute_plan_command` is now
  the sole tally. The deadline auto-pick is host-only, so participant browsers no
  longer race to fire commands they cannot run.
- **Plan creation.** A failed `plan_spots` insert left an unusable plan behind a
  live share link. The plan row is now rolled back on failure.

Still open, deliberately: rate limiters are in-process `Map`s that reset on cold
start, and the OTP one grows unbounded on attacker-supplied emails.

## Architecture foundation — 2026-08-10

- Added shared planning-domain types and versioned local-storage helpers in `lib/planning.ts`.
- Migrated the demo circles, moodboards and lifecycle state to those shared types.
- Added development demo-mode entry: unauthenticated `/` now opens `/home-preview` locally, so auth setup is no longer a blocker for the core product.
- Verification: lint, TypeScript, smoke checks and production build pass.

## Planind Wrapped — 2026-08-10

- Added a Profile action called “Create my Wrapped.”
- The local demo recap includes monthly plan count, favourite area, active circle, signature plan and best-rated place.
- Added share/copy behavior using the browser Share API when available, with clipboard fallback.
- Wrapped is intentionally local/demo data for now; production monthly aggregation will follow once account persistence is enabled.
- Verification: lint, TypeScript, smoke checks and production build pass.

## Implementation update — 2026-08-10

- Added local-first named friend circles in the Friends view.
- Added moodboards with place/link/photo items and a “turn this board into a plan” action in Discover.
- Added a local plan lifecycle panel with idea → vote → confirm → remember stages, RSVP reactions, event date and local reminder toggle.
- Added local memory capture with a note and image preview in Been.
- Added profile reminder status.
- Demo state persists in localStorage under versioned feature keys; existing Supabase/auth flows were not changed.
- Verification: lint, TypeScript, smoke checks and production build pass.

## Scope update — 2026-08-10

- Authentication setup is intentionally deferred. Google OAuth and email login remain in the codebase, but upcoming product work should not be blocked on configuring them.
- Prioritize the core planning experience, local/demo usage, recommendation quality, testing, and security review that can be exercised without external auth credentials.

This is the running implementation log. `CHECKPOINT.md` keeps the longer architectural history; this file is the short handoff for active work.

## Host-command security checkpoint — 2026-08-10

- Added `supabase/migration-015-host-plan-commands.sql`: new plans store only a SHA-256 host-token hash; pool advancement, winner decisions and committed event edits run through a locked, security-definer RPC.
- Added `app/api/plans/[id]/command/route.ts` with strict command/token validation and mapped authorization errors.
- Plan creation now returns the one-time host token and stores it only in the creator’s browser local storage; the shared URL never contains it.
- The shared plan page uses the protected command path for new plans and retains a legacy fallback for plans created before migration 015.
- Canonical schema policies now remove anonymous plan/spot transition updates.
- Verification: lint, TypeScript, diff check, smoke checks against the dev server on port 3002, and an escalated production build all pass. A sandbox-only smoke attempt failed because local network access was blocked; the escalated run passed.
- Deployment checkpoint: apply migration 015 after 014 before creating new authenticated plans. Existing plans remain readable and use the compatibility path.

## Audit follow-up

- Remaining high-priority gap: public votes, RSVPs and ratings are still keyed by typed names and share links, so identity impersonation remains possible. This is intentionally not silently changed in this checkpoint because it needs a participant identity design.
- Removed the legacy public `clear plan_spots` delete policy in migration 015 and the canonical schema; plan membership can no longer be deleted by any link visitor.
- Remaining operational gap: host tokens are browser-local; account/device recovery for host controls should be added with authenticated ownership before production launch.

## Smart-search validity checkpoint — 2026-08-10

- Smart search now requires the model to classify the input as a coherent Dubai social plan before returning an intent.
- Gibberish, unrelated text, impossible requests, and non-hangout prompts return a clear 422 invalid-plan response instead of silently defaulting to dinner.
- Existing length, adult-venue, age, rate-limit, and API-key checks remain active.
- Verification: ESLint, TypeScript, and diff check pass.
- Follow-up diagnosis: the configured OpenAI key reaches the API, but the organization returns `429 insufficient_quota`; the endpoint now reports a clear 503 credit-exhaustion message instead of a generic 502.

## UI/UX audit checkpoint — 2026-08-10

- Audited the plan composer, shared voting flow, preview mode, navigation, and responsive form states against `FRONTEND_DESIGN_STANDARDS.md`.
- Smart-search guidance now explains the accepted prompt shape, shows a live character count, and clears stale interpreted intent whenever the prompt changes.
- Shared voting now explains why the primary action is disabled and what the next round requires.
- Unauthenticated preview mode now clearly routes users to sign in before attempting to create a real saved/shared plan.
- Verification: ESLint, TypeScript, diff check, and live smoke checks pass.

## Shared voting mobile checkpoint — 2026-08-10

- Added a responsive shared-vote header treatment for narrow screens so long plan names and deadlines wrap cleanly.
- Tightened mobile shell/card spacing and pool progress sizing without changing the voting logic.
- Kept completed-pool guidance textual and restrained; no decorative status lights or improvised icon UI were added.
- Verification: ESLint, TypeScript, diff check, and live smoke checks pass.

## RSVP choices checkpoint — 2026-08-10

- Added migration 016 with a backwards-compatible `rsvps.choice` field: `coming`, `maybe`, or `no`.
- Updated the real shared-plan result flow to show all three choices instead of a binary “I’m in” toggle.
- Existing `coming` rows remain valid and are mapped safely when read.
- Verification: ESLint, TypeScript, diff check, smoke tests, and production build pass.
- Deployment: apply `supabase/migration-016-rsvp-choices.sql` after migration 015.
- Live schema verification after application: Supabase REST returned the `choice` column successfully.

## Participant identity seam checkpoint — 2026-08-10

- Added migration 017 with nullable participant-token hashes on votes, RSVPs, and ratings plus lookup indexes.
- New shared-plan browsers generate one random per-plan token locally and write only its SHA-256 hash to new interaction rows.
- Legacy name-only rows remain readable; this is a compatibility seam, not the final server-authoritative identity system.
- Verification: ESLint, TypeScript, diff check, smoke tests, and production build pass.
- Deployment: apply `supabase/migration-017-participant-token-seam.sql` before testing new shared-plan votes or RSVPs.

## Participant write enforcement checkpoint — 2026-08-10

- Added migration 018 with security-definer RPCs for votes, RSVPs, and ratings.
- Shared-plan client writes now call those RPCs; anonymous direct insert/update policies are removed from the canonical schema and migration.
- RPCs validate token shape, bind updates to the token hash, and reject a different token claiming an already-tokenized participant name.
- Legacy rows can still be read and safely claimed during transition; full identity/account recovery remains future work.
- Verification: ESLint, TypeScript, diff check, smoke tests, and production build pass.
- Deployment: apply `supabase/migration-018-participant-write-rpcs.sql` after migration 017.
- Live verification after application: an invalid-token RPC call returned 401 / SQLSTATE 42501 without writing data.

## Participant recovery UX checkpoint — 2026-08-10

- Added a clear NameGate disclosure that participant choices are remembered on the current device/browser for the plan.
- Avoided exposing participant tokens in URLs or copyable links while account authentication is intentionally deferred.
- Verification: ESLint, TypeScript, diff check, and live smoke checks pass.
- Future seam: authenticated account/device recovery can reclaim a participant identity without weakening shared-link privacy.

## Live migration-order audit — 2026-08-10

- Live REST schema verification found migration 009 prerequisites are not present: `plans.stage`, `plan_spots.pool_number`, `votes.phase`, and `spots.source` are missing.
- Migration 017’s token columns are present, and migration 018’s invalid-token RPC guard returns 401, but pool voting cannot be considered production-ready until migrations 009–012 are applied in order.
- Required action: apply the missing foundation in order: 005, 006, 007, 008, 009, `010-recommendations-collections`, `011-smart-search`, then `012-place-link-imports`; rerun the shared-plan smoke path afterward. Do not apply 017/018 again unless Supabase reports they were rolled back.
- Follow-up live verification succeeded: stage, pool, phase, source, and participant-token columns are present; invalid-token RPC calls still return 401 / SQLSTATE 42501.

## Security/code-review handoff — 2026-08-10

- Read-only review completed across auth actions, server routes, shared-plan client writes, RLS migrations, participant RPCs, age policy, and public social reads.
- Live checks confirmed direct anonymous vote writes are blocked with 401 / SQLSTATE 42501 and invalid participant RPC tokens are rejected.
- Highest-priority findings for the next agent:
  1. `host_token_hash` is exposed through public `plans.select("*")` reads and plan realtime payloads; move it to a private host table or remove it from every public projection/broadcast.
  2. Migration 018 RPCs need integrity validation: plan/spot membership, phase/pool bounds, plan status, winner/decision state, and non-empty voter names.
  3. DOB remains user-editable through `saveBirthDate`; protect age metadata in a server-owned profile record and prevent unrestricted age escalation.
- Medium-priority findings: plan creation is two writes and can orphan plans; in-memory rate limits are not distributed; legacy direct plan-transition fallbacks no longer work after migration 015; migration ordering needs a single runbook; public social reads expose broad profile/visit relationships.
- No code changes were made for this review checkpoint.

## Exact next-agent start order

1. Read this handoff and `CHECKPOINT.md`; do not rescan the whole repository.
2. Inspect `app/plan/[id]/page.tsx` public projections/realtime, `supabase/migration-015-host-plan-commands.sql`, `supabase/migration-018-participant-write-rpcs.sql`, and `app/auth/actions.ts`.
3. Fix host-token exposure first and add an explicit safe plan projection.
4. Harden all three participant RPCs with relational/state validation and add negative SQL/API tests.
5. Design the immutable/protected DOB record before changing age-sensitive behavior.
6. Run lint, TypeScript, diff check, smoke tests, production build, and live read-only security checks.
7. Update this file and `CHECKPOINT.md` before moving to distributed rate limiting or social privacy.

## Completed

- Built the responsive Dubai planning experience with Plan, Discover, Been, Friends and Profile views.
- Added the three-pool plan flow: nine places, three pools, finalists, then a final vote.
- Added budget, origin area, travel radius, custom places and natural-language smart search.
- Added Supabase Auth with Google OAuth support, email OTP, protected home, callback handling and sign-out.
- Added private date-of-birth onboarding and age-aware recommendations. Accounts are 13+; venue thresholds include 18+ and 21+.
- Blocked sexually explicit/adult-entertainment venue types across custom places, imports, smart search and database constraints.
- Restyled the auth screen to match the product’s architectural ivory, graphite and champagne visual system.
- Added server-side plan creation at `/api/plans`, age/venue/ownership checks, authenticated plan ownership and plan rate limiting.
- Added OTP throttling and the lightweight `npm run test:smoke` checks.
- Applied Supabase migrations 013 and 014 successfully.

## Current issue

- Google sign-in is not enabled in the connected Supabase project. A read-only Auth settings check reports `external.google: false`. Email auth is enabled.
- The login page now explains this clearly instead of showing a generic error.

## Next steps

1. Enable Google in Supabase Authentication → Providers → Google, add the Google client credentials, and allow `http://localhost:3001/auth/callback` in Supabase URL Configuration.
2. Test a real signed-in plan: age capture, restricted category visibility, custom place ownership, nine-place creation and shared voting.
3. Add Playwright browser smoke tests for login, onboarding and plan creation.
4. Add distributed production rate limiting and abuse monitoring for OTP, smart search and public plan actions.
5. Add account deletion/data export and custom-place reporting/moderation.
6. Close the remaining shared-plan promotion gap with a server-side validation path.

## Verification

- `npm run lint` passes.
- `npx tsc --noEmit --pretty false` passes.
- `npm run build` passes.
- `npm run test:smoke` passes: `/login` 200, `/home-preview` 200, unauthenticated `/api/plans` 401.
- Supabase read-only check confirms age-restricted spots are live.

## 390px phone layout checkpoint — 2026-08-11

- Inspected the responsive rules for auth/login, onboarding, home’s five-tab navigation, and the voting surface.
- Confirmed intentional phone behavior in CSS: auth collapses to a single-column flow at 760px; home switches to a fixed, safe-area-aware five-tab bar at 520px; voting cards and controls wrap at 640px.
- No browser engine (Chromium/Playwright/Puppeteer) is installed in this workspace, so pixel-level rendering and tap-target inspection could not be performed honestly.
- Local route/security smoke checks passed against the existing dev server on port 3001: all 13 guards green.
- Next build item remains the signed-in place-link importer persistence; revisit visual verification when a browser-capable environment is available.

## Signed-in importer persistence checkpoint — 2026-08-11

- `/api/place-import` now persists authenticated imports in `place_imports` and associates them with the Planning collection through `place_collection_items`.
- Added authenticated GET loading so saved links survive browser/device changes; duplicate normalized links remain idempotent.
- Demo `/home-preview` keeps its localStorage-only behavior and now classifies links locally instead of attempting an anonymous save.
- Import validation still strips tracking parameters and rejects adult-entertainment links before persistence.
- Verification: ESLint, TypeScript, diff check, and all 13 live smoke guards pass. Production build is blocked only by unavailable Google Fonts network fetches in this sandbox.

## Saved-link collections interaction checkpoint — 2026-08-11

- Added All / Want to try / Planning filters to the saved-link list.
- Kept the filter horizontally scrollable on narrow screens and used existing token styling for active state.

## Interaction polish checkpoint — 2026-08-11

- Added dependency-free horizontal swipe navigation across the five home tabs.
- Added optional haptic feedback for tab changes; unsupported browsers safely no-op.
- Added tactile press states and a restrained avatar focus motion.
- Existing reduced-motion CSS remains authoritative and disables animation/transition effects.

## Playful energy layer checkpoint — 2026-08-11

- Added restrained spring-like hover/press moments to tabs, CTAs, category cards, moodboard items, friend rows, and reactions.
- Added a subtle active-plan pulse and reaction pop to make progress feel rewarding.
- Kept the palette and layout intact; all extra motion is opt-in through `prefers-reduced-motion`.

## Claude handoff checkpoint — 2026-08-11

### Completed in this session

- Added authenticated place-link persistence through `/api/place-import` using `place_imports` and `place_collection_items`.
- Added cross-device loading for saved links and All / Want to try / Planning filters.
- Preserved demo mode as localStorage-only; demo imports classify links locally.
- Added mobile swipe navigation between the five home tabs.
- Added optional haptics with feature detection, tactile press states, reaction-pop feedback, avatar focus motion, and restrained playful hover motion.
- Kept reduced-motion support and existing adult-entertainment restrictions.
- Updated checkpoints throughout the session.

### Verification

- ESLint passes.
- TypeScript passes.
- `git diff --check` passes.
- All 13 live smoke guards pass against the local server.
- Existing server is responding at `http://localhost:3001` (`/login` returns 200).
- Production build is currently blocked only when the sandbox cannot fetch Google Fonts; this is an environment/network issue, not a TypeScript or application error.

### Important handoff context

- No browser engine is installed in this workspace, so 390px visual/pixel verification is still pending.
- Do not recreate migrations 017–019; their security fixes are already applied and verified live.
- Do not invent signed-in data or read DOB from auth metadata.
- `NEXT_AGENT.md` contains the broader security/schema rules and build order.

### Recommended next build order

1. Finish authenticated visit collections and photo memories in the Been view, including Storage/RLS verification.
2. Add authenticated friend invites/circles without exposing broad profile data.
3. Replace process-local rate limiting with a distributed production-safe strategy.
4. Add browser-based 390px tests when a browser-capable environment is available.
5. Add deeper drag/reorder interactions only where persisted ordering exists.

## Useful commands

```bash
npm run dev
npm run test:smoke
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

## Colour-for-state and swipeable voting — 2026-08-11

- One live accent `--color-live` for state only; champagne reserved for the
  outcome. Theme-scoped (`#2f4bd6` day / `#8aa0ff` night) because no single hue
  clears AA on both grounds. Rule recorded in `FRONTEND_DESIGN_STANDARDS.md`.
- Voting round is a native `scroll-snap` carousel on phones; round progress is
  dots; the round animates in once; live tallies bump and clear.
- Removed the infinite `active-row-pulse`; mirrored hover-only tilts onto
  `:active` so touch devices get press feedback at all.
- Committed the previous agent's pending work first (`5a66ae6`) so the two
  passes are separable: importer persistence, swipe tabs, haptics, motion CSS.
- Verification: ESLint, TypeScript, build, 13/13 smoke guards.

### Still open (highest value first)

1. **See it on a phone.** The `<=520px` layout, the voting carousel and the
   round dots have never been observed rendering. This is the top item.
2. ~~Seed a multi-round plan~~ — done. `supabase/seed-multi-round-plan.sql`
   creates plan `22222222-2222-2222-2222-222222222222` with three rounds of
   three, a host token, and three votes already in round 1. Run it in the
   Supabase SQL editor; it is re-runnable and touches only that plan id.
   Testing instructions are in the footer of that file.
3. Visit collections and photos (migration 010 tables still unused).
4. A way to add a friend (`addFriend` and 8 other `lib/social.ts` functions
   still have zero callers).
5. ~~Distributed rate limiting~~ — implemented in migration 020; pending live apply.
6. ~~A test runner~~ — focused Node security tests now run with `npm run test:security`.

Full instructions, hard rules and the list of traps that have already caused
bugs here are in `NEXT_AGENT.md`. Read that first.


---

## Production-hardening implementation — 2026-08-19

### Implemented

- Added production HTTPS/HSTS, CSP nonces, security and cookie headers,
  restrictive permissions, CSRF protection, capped streaming JSON readers,
  origin/Fetch Metadata checks, and client helpers for protected requests.
- Added Cloudflare Turnstile to email OTP and anonymous shared-plan entry.
  Email requests use enumeration-resistant responses.
- Added Supabase anonymous guest sessions and migration-020 `plan_access`
  membership so shared plans and private Realtime Presence are plan-scoped.
- Replaced multi-write client plan creation with the transactional,
  server-authoritative `create_secure_plan` RPC. It enforces permanent auth,
  immutable age, exact same-category candidates and an allowlisted payload.
- Added Postgres-backed request quotas, including 30 AI searches per user/day
  and 300 globally/day, plus minimized security events and retention cleanup.
- Restricted social reads, durable profiles, custom spots, participant writes,
  storage MIME types and image sizes. Added client decode/dimension checks.
- Added Terms and Privacy pages backed by required production legal variables.
- Removed template-like skyline/confetti/grid/orb/shadow/hover decoration and
  rendered emoji avatars. Fonts are now self-hosted and open licensed.
- Upgraded Next.js and ESLint config to 16.3.1; resolved npm audit to zero.
- Added `tests/security.test.ts`, expanded smoke coverage and documented hosted
  configuration in `SECURITY_SETUP.md`.

### Database status

- Migration 020 exists locally and its end state is mirrored exactly in
  `supabase/schema.sql` (apart from the migration-only heading).
- Migration 020 is **not applied live**. Existing smoke checks prove the live
  migration-019 guards only. Follow `SECURITY_SETUP.md` for the migration,
  control-secret hash, Auth settings and cleanup cron.

### Verification

- ESLint and TypeScript pass.
- Focused security tests pass (sanitization, double-submit CSRF, JSON/content
  type/body caps).
- Next 16.3.1 production build passes across 15 routes with webpack.
- Expanded localhost smoke suite passes, including CSP/security headers,
  missing-CSRF 403, valid-CSRF unauthenticated 401 and all prior DB guards.
- `npm audit` reports zero vulnerabilities; `git diff --check` passes.
- Graphify update completed: 794 nodes, 1,245 edges, 68 communities.

## Cursor mobile-preview handoff — 2026-08-19

- `lirobi.phone-preview` 3.1.9 is installed in Cursor.
- `.vscode/settings.json` sets `mobile-preview.url` to
  `http://localhost:3001` and the device to iPhone 13 Pro.
- Local development omits X-Frame-Options, COOP/CORP and CSP frame-ancestors
  so the extension iframe works. Those protections remain enabled in
  production.
- The preview is in editor column two. Hide the Secondary Sidebar to free the
  right side. Keep the terminal visible and drag its upper divider downward;
  the extension auto-scales the phone according to remaining vertical space.
- Immediate next coding task: use this preview to audit real alignment,
  wrapping, overflow and safe-area behavior at phone width. Start with the
  home screen visible in the latest screenshot, then login, onboarding, all
  home tabs and a multi-round shared plan.

## Migration 020 applied + AI-engineering workstream opened — 2026-08-24

### Migration 020 is live. It was also an outage fix, not just hardening.

`app/api/plans/route.ts:48` calls `create_secure_plan`, which is defined **only**
in migration 020. Because 020 was unapplied, **plan creation had been broken
against the live project** — every attempt hit `PGRST202`, fell into the
`status = 500` branch, and returned "Couldn't start the plan." In production it
would have failed one step earlier, since `consumeQuota` fails closed when
`consume_app_quota` is missing (429). Nobody had noticed because no automated
check covered the 020 boundary.

Applying 020 exposed a **second, separate** failure: `SECURITY_CONTROL_SECRET`
was absent from `.env.local`, so `controlSecret()` returned the dev fallback
string, `consume_app_quota` rejected it, and plan creation returned 429 instead
of 500. The `PGRST202` escape hatch in `consumeQuota` no longer applies once the
function exists. **Both halves are now done:** a 32-byte secret is in
`.env.local` and its bcrypt hash is stored as `app_control_secrets.name =
'server-control'`. Verified matching.

The same value must be set as a server-only Vercel variable before deploying.

### Live verification (read-only probes with the publishable key)

| Probe | Result |
|---|---|
| `set_birth_date` (019 control) | `42501 Sign in first` — proves the probe method |
| `create_secure_plan` | `42501 A permanent account is required` — exists, body check reached |
| `claim_plan_access` | `42501 Authentication required` |
| `consume_app_quota` | `42501 Server authorization required` |
| `purge_security_operational_data` | `42501 permission denied` — correctly revoked |
| anon insert `plans` | `42501 permission denied for table plans` — REVOKE active |
| anon read `spots` | `[]` — the new `to authenticated` policy |
| `valid_control_secret(<real secret>)` | `true` — env and DB hash match |

`npm run test:smoke` 19/19 green. New `npm run test:smoke:020` 10/10 deployment
guards green (see defect 1 for the 11th).

**Method note for whoever probes next:** PostgREST resolves functions by exact
parameter-name set, so a wrong arg list returns `PGRST202` and looks identical
to a missing function. Always copy the signature out of the migration file. A
4-arg probe of `cast_plan_vote` (it takes 7) produced a false "missing" here.

Also do not test the control secret through `consume_app_quota`: its guard is
`not valid_control_secret(...) or uid is null or ...`, so an unauthenticated
call raises the same `42501` whether the secret is right or wrong. That produced
a false "secret rejected" conclusion in this session before it was caught.

### Defect 1 — `valid_control_secret` is an anon-callable brute-force oracle

**Open live. Migration 021 is committed locally but unapplied.** Found by
`qa-test`, reproduced
live with nothing but the publishable key and no session:

```
POST /rest/v1/rpc/valid_control_secret {"p_secret":"definitely-not-it"} -> 200 false
POST /rest/v1/rpc/valid_control_secret {"p_secret":"<real secret>"}     -> 200 true
```

An unauthenticated, unmetered oracle confirming whether a guessed value is the
server-control secret that gates `consume_app_quota` and `record_security_event`.

**Root cause, and it generalises:** migration 020 line ~352 does `revoke all on
function valid_control_secret(text) from public;`. Supabase's default privileges
already granted EXECUTE to `anon` and `authenticated` **by name**, and revoking
from `PUBLIC` does not cancel a named grant. Line ~418 of the same file gets it
right — `revoke ... from public, anon, authenticated` — and that function does
correctly answer `permission denied`.

The same root cause leaves `create_secure_plan`, `claim_plan_access` and
`consume_app_quota` executable by `anon`. Those fail *safe* today only because
each body checks `auth.uid()` first. `valid_control_secret` is the one that
leaks, because it returns a boolean instead of raising.

Practical risk today is low — the live secret is 256 bits of entropy. The danger
is that every `revoke ... from public` line in 020 reads as protection it is not
providing.

### Defect 2 — share-link "plan not found" flash (fixed in `470ca28`)

The load previously ran before `bootstrapAccess` completed anonymous sign-in +
`claim_plan_access`. Post-020 RLS hid that pre-claim read, so `.maybeSingle()`
returned `{data: null, error: null}` and the page treated it as missing.
`470ca28` makes the load wait for `access === "ready"` and keeps the checking
state ahead of not-found. Live browser verification remains blocked while
anonymous sign-ins are disabled.

### OpenAI status — verified, blocks the AI phases

| Check | Result |
|---|---|
| Key | valid, `GET /v1/models` 200 |
| `gpt-5.6-luna` (`smart-search/route.ts:14`) | **real**, present in the account's model list |
| `text-embedding-3-small` | available |
| **Credits** | **ZERO** — a 1-token embeddings call returns `429 insufficient_quota` |

Backfilling the whole spot catalog would cost roughly **$0.0002** (~100 spots ×
~60 tokens). A minimum top-up unblocks RAG, tool calling and the trace demo.
Do not report AI behaviour as working off a 429.

`https://api.open-meteo.com` verified working with **no API key and no SDK**,
correct `Asia/Dubai` timezone — that is the weather tool for the agent loop.

### Verification

- `npm run test:smoke` — 19/19 green against localhost:3000
- `npm run test:smoke:020` — 10/10 deployment guards green, 1 red (defect 1)
- Migration 020 confirmed live by direct probe, not by assumption

## Shared-plan race fix + real-data Wrapped — 2026-08-24

- `470ca28` fixes the post-020 access race: the plan read waits for access to be
  ready and the render shows the checking state before not-found. Anonymous
  sign-ins are still disabled live, so the shared-plan path is not browser-
  verifiable and remains unavailable to guests.
- `3d07a6a` moves Wrapped into the signed-in Profile and computes the current
  `Asia/Dubai` month from real plans, visits, group labels, ratings and spots.
  It has deterministic ties, honest empty/error states, group-rating labeling,
  partial-stat omission, and accessible Web Share/clipboard feedback.
- Security review kept all aggregation behind authenticated, RLS-scoped reads
  and introduced no schema or new client write path. Friend invites were not
  wired: typed RSVP companion names are not account identity, and direct
  symmetric friendship creation lacks consent. Reserve 022 for pgvector and
  023 for the account-link/request/acceptance seam.
- Verification passed: lint, TypeScript, 3/3 security suites, 8/8 Wrapped tests,
  the 15-route production build, normal smoke, and `git diff --check`.
  `test:smoke:020` remains red only because migration 021 is unapplied.
- Live blockers rechecked: anonymous sign-in is disabled;
  `valid_control_secret({"p_secret":"wrong"})` returns `200 false`; and the
  one-token embeddings call returns `429 insufficient_quota`. AI behavior is
  not live-tested.

## Blocker re-probe + two corrections — 2026-08-24 (later)

### All three blockers re-probed live and still open

| Blocker | Probe | Result |
|---|---|---|
| Migration 021 | `valid_control_secret {"p_secret":"wrong"}` | `200 false` — **oracle still live, not applied** |
| Anonymous sign-ins | `POST /auth/v1/signup {}` | `422 anonymous_provider_disabled` |
| OpenAI credits | 1-token `text-embedding-3-small` | `429 insufficient_quota` |

The share-link vote path remains dead, so `470ca28` still cannot be
browser-verified.

### Correction: the client-supplied `age` was NOT a security hole

An earlier note in this session described the client-supplied `age` in
`lib/deal.ts` as a live hole that moving retrieval server-side would close.
**That was overstated. Recording it so it does not propagate.**

`create_secure_plan` enforces age properly server-side: it reads `age_value`
from the server-owned write-once `member_ages` table (not from the request),
applies the 18/21 category thresholds, and rejects the plan unless **all nine**
spots satisfy `age_value >= greatest(s.minimum_age, category threshold)`.
Plan creation is correctly gated. A tampered client-side age changes what the
picker *displays*, not what can be created.

The honest reasons to move retrieval server-side are: RAG requires it (a browser
cannot embed a query — the OpenAI key is server-only), and `lib/deal.ts`
currently ships the whole candidate pool plus every matching `ratings` row to
the client on every deal.

### Finding — age-restricted venues are enumerable. Owner decision, not fixed.

`read permitted spots` (migration 020, line 68) has **no age predicate**:

```sql
create policy "read permitted spots" on spots for select to authenticated using (
  source = 'curated' or visibility = 'community' or ...
```

Any authenticated account — including a 13-year-old — can list every
`source = 'curated'` spot straight from `GET /rest/v1/spots`, 21+ nightlife
venues included. Moving `lib/deal.ts` server-side does **not** change this;
only an age-aware policy would.

Severity is catalog visibility, not an authorization bypass — plan creation is
properly gated (above). Fixing it means joining `member_ages` into the policy,
which costs a lookup on **every** spots read. Owner chose to record and defer.

### Note for the next probe

Two probe traps already produced false conclusions in this project; both are
documented in `NEXT_AGENT.md`. A third to add: `consume_app_quota` cannot be
used to test the control secret, because its guard is
`not valid_control_secret(...) or uid is null`, so an unauthenticated call
raises the same `42501` either way. Use `valid_control_secret` directly — which
is possible only because migration 021 is still unapplied.

### Server-side dealing landed — `0de2fc8` + tests

`lib/deal.ts` (112 lines, browser) → `lib/spots/match.ts` (pure core + I/O
shell) + `app/api/spots/deal/route.ts`. `lib/deal.ts` is now a 40-line
`secureJsonFetch` wrapper with byte-identical exported signatures, so
`components/StartPlanForm.tsx` is **unchanged** — `getBeen()` still runs in the
browser inside `deal.ts` and rides along in the request body.

**Equivalence was proved, not assumed.** A fixture parity harness ran the
pre-move algorithm verbatim against `dealFromPool` with a seeded RNG across 8
cases (baseline, exclude+age 18, age 13, budget, vibe keywords, avoid keywords,
origin/radius, and the `< count → null` path). Identical output on all 8.
`tests/spots-match.test.ts` adds 14 tests; the suite is now 25 (3 security +
8 wrapped + 14 dealing) under a consolidated `npm run test`.

Deviations from the original spec, both deliberate: `readJsonBody` cap is 16 KB
not 4 KB (200 uuids is ~7.5 KB on its own, so 4 KB would 413 anyone with a real
`been` list), and a missing `memberAge` falls back to `MIN_ACCOUNT_AGE` (13) —
fail closed, not open.

**No quota on this route yet.** `consume_app_quota` accepts only
`smart-search | plan-create | place-import`, and borrowing `plan-create` would
spend the plan bucket on re-deals and lock users out of creating a plan. The
route is an authenticated RLS-scoped read with no writes and no external I/O.
A `"spot-deal"` scope rides along with migration 022.

**The `SpotAffinity` seam** is `(spot) => number | null`, applied as
`embed(spot) ?? keywordScore(spot)` to rows that have **already passed every
filter** — it can reorder survivors, never admit one. That is the structural
guarantee that similarity can't bypass the age gate.

#### Correction: the sort comparator is fine

The implementing agent flagged the comparator as "not a consistent ordering."
**It is consistent.** Expanding it:

```
categoryBias*2 + affinity(b) - affinity(a) + score(b) - score(a)
  = (2·[b matches] + affinity(b) + score(b)) − (2·[a matches] + affinity(a) + score(a))
  = k(b) − k(a)
```

It is a single-key descending sort — antisymmetric and transitive. No action.
Recorded so the false concern doesn't get "fixed" later.

## T2 Frontend — Wave 1 FE.1 + FE.2 + FE.8 committed — 2026-09-01

Found the full FE.1/FE.2/FE.8 implementation already written but uncommitted in
the tree (a prior session's work, mixed with T1/T0 changes). Verified and
committed the frontend-owned files rather than rewriting.

- **FE.1 (`ba6ba6b`)** — signed-out `/` renders the marketing hero
  (`<HomeExperience demoMode />`) instead of `redirect("/login")`. New `fixtures`
  prop keeps invented friends/visits/photos on the dev-only `/home-preview` only;
  `accountTabs` gate hides the tab bar / avatar / account views when there is no
  account behind them, showing a "Sign in" nav link instead.
- **FE.2 (`9bd4042`)** — `--token-shadow` (graphite day / brass night, contrast
  measured in comments); `.token` signature restored on the vote card
  (`OptionCard`) and primary commit actions; hover-lift gated behind
  `@media (hover: hover)`. The end-of-file restraint block was deleted (it
  cancelled hover `transform` on every control and re-killed the signature) and
  replaced with a note — aligns with the owner's 2026-08-28 Motion reversal.
  One cleanup beyond the found diff: removed the superseded `.home-primary-cta`
  `box-shadow: none` + soft-glow `:hover`, which still fired on touch taps.
- **FE.8** — `.home-avatar` 40px → 44px touch floor, folded into the FE.2 commit
  (same file).

Verification: `npm run lint`, `npx tsc --noEmit`, `npm run test` (25/25),
`npm run build` (16 routes) all green; `git diff --check` clean. Desktop hero
confirmed in Chrome in both day and night themes — no login redirect, "Sign in"
button in the nav, token offset shadow on the primary CTA. Mobile nav CSS
reviewed (`.home-nav__signin` survives the ≤520px `.home-nav__link` hide);
live mobile/focus screenshots skipped — the extension's browser was pointed at a
different machine's `localhost:3000`. No `security` subagent invoked: FE.1/FE.2
touch no RLS, no voting writes, no Realtime publication, no model-output path.

#### Real finding: the ratings signal is largely inert

`read accessible ratings` scopes `ratings` to plans the caller already has
access to, so for most users almost every spot falls back to the unrated 3.6
prior. The "community rating" term in the ranking is effectively per-user
today. Preserved exactly by the move (the route uses the caller's session, not
a service role). Worth a product decision before RAG lands, since it means
ranking currently rests almost entirely on the keyword score.

## BE.1 — share-link vote path + migration 023 — 2026-09-01 (T1 Backend)

### Honest failure for guests (blocked on B1, not by it)

`lib/supabase.ts` `bootstrapPlanAccess()` (adopted from a prior uncommitted
pass, committed now) redeems the share uuid and returns a typed
`PlanAccessDenial` instead of throwing: `anonymous-disabled` (owner toggle B1,
not the visitor's link), `captcha-required`, `sign-in-failed`, `not-found`,
`claim-failed`. Non-prod keeps the `PGRST202` escape hatch; prod fails closed.
`lib/types.ts` gains `CastVoteResult` for the new RPC payload.

The vote page (`app/plan/[id]/page.tsx`, Frontend-owned) still runs its own
inline `bootstrapAccess` that collapses `anonymous-disabled` into a generic
"link may be invalid" screen. Cross-lane request filed to T2 to switch it to
`bootstrapPlanAccess` and give each reason its own state. End-to-end guest vote
stays **unverifiable** until B1 — not claimed as passing.

### Migration 023 — explicit vote idempotency

`cast_plan_vote` was idempotent per (plan, participant, round) by delete-then-
insert, but that races: two concurrent calls by one participant could both
delete (0 rows) then both insert, giving one participant two YES rows in a
round that `execute_plan_command` then tallies twice. 023 adds a partial unique
index `votes_participant_round_key (plan_id, participant_token_hash, phase,
pool_number) where participant_token_hash is not null`, dedupes any existing
offenders (keep newest by `(created_at, id)`), drops the redundant
`votes_participant_token_idx`, and rewrites the write path to `insert ... on
conflict do update`. Return type `void` → `jsonb` (`{plan_id, phase,
pool_number, spot_id}`), byte-identical on a replayed call. Signature and grant
unchanged; the client only checks `error`, so no app change. Reviewed by the
`security` subagent before commit.

Concurrency test on the tally handed to `qa-test`: two `cast_plan_vote` calls,
same participant/round, different spots, fired in parallel → exactly one row
survives and the tally counts it once. Also flagged that the `smoke-test.mjs`
`cast_plan_vote` guards now short-circuit on the post-020 anon grant (401
"permission denied for function") instead of exercising the validation branch —
real validation coverage needs an authenticated session.

### Live probes (2026-09-01, publishable key, no session)

| Probe | Result | Means |
|---|---|---|
| `valid_control_secret {"p_secret":"wrong"}` | `200 false` | migration 021 still unapplied — oracle live |
| `consume_app_quota {forged, "spot-deal"}` | `42501` | same as `plan-create` and a bogus scope — 022 not externally probable |
| `cast_plan_vote` (anon) | `42501 permission denied for function` | 020's anon revoke is live; 023 preserves it |
| `test:smoke` | 19/19 | — |
| `test:smoke:020` | 10 green, red only on the `valid_control_secret` oracle guard | 021 |

**022 owner verification** (SQL editor, needs owner):
`select * from pg_publication_tables where pubname='supabase_realtime' and tablename='plan_spots';` → expect one row.
`select consume_app_quota('<real server-control secret>','spot-deal');` → expect a boolean, not an exception.

Verification: `npm run lint`, `npm run typecheck`, `npm run test` (25),
`npm run build` (16 routes) all green.

## Migrations 021 / 022 / 023 applied live — 2026-09-01 (T0, via Supabase MCP)

The Supabase MCP was authenticated (OAuth, org `aryansajiv19's Org`) and all
three pending migrations applied to project `zyojaoyatunjwgbivaqu` with
`apply_migration`. This project does not use the migration ledger, so state was
verified by direct `pg_proc` / `pg_indexes` / `pg_publication_tables` probes, not
by `list_migrations`.

- **021 (`revoke_anon_execute`)** — the pre-probe already showed the target grant
  state (anon EXECUTE absent on `valid_control_secret`, `create_secure_plan`,
  `claim_plan_access`, `consume_app_quota`, `execute_plan_command`; kept on
  `record_security_event`). Re-applied for the record; idempotent. The
  2026-08-24 "`200 false`" oracle probe was stale — the grants are correct now.
- **022 (`spot_deal_quota_and_guest_realtime`)** — `consume_app_quota` now
  accepts `spot-deal` (30/min, 300/day); `plan_spots` added to
  `supabase_realtime`. Both verified.
- **023 (`vote_idempotency`)** — **the committed file is wrong**: it uses
  `create or replace function cast_plan_vote ... returns jsonb` on a function
  that currently `returns void`, which Postgres rejects (`42P13 cannot change
  return type`). Applied a corrected version with `drop function if exists
  cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text)` before the create;
  the existing `revoke/grant` lines already cover the ACL reset that drop+create
  causes. Verified live: `cast_plan_vote` returns `jsonb`, unique index
  `votes_participant_round_key` exists, old `votes_participant_token_idx` dropped,
  `anon` cannot execute it, `authenticated` can, vote count unchanged (4 — no
  duplicates to collapse), zero unique constraints on `votes`.
  **T1 action:** patch `supabase/migration-023-vote-idempotency.sql` (add the
  `drop function`) and confirm `schema.sql` carries the jsonb-returning body.

`get_advisors(security)` after: no regression from these three. The standing
noise — `rls_enabled_no_policy` on the 5 definer-only tables (intentional) and
`{anon,authenticated}_security_definer_function_executable` on the RPC surface
(by design) — is unchanged. One real follow-up for SEC.4: the same
"`revoke from public` misses the named `anon` grant" root cause 021 fixed still
leaves `set_birth_date`, `current_member_age`, `ensure_authenticated_profile`,
`ensure_default_place_collections`, `mirror_friendship`,
`people_default_place_collections`, `rls_auto_enable` anon-executable. They fail
safe in-body, but the grants should match intent.

Only remaining core-loop blocker: **B1** (enable anonymous sign-ins — dashboard).

## Migration 024 (SEC.4) written + lane progress — 2026-09-01 (T0 integrating)

- **024 committed on `lane/backend` (`75f8bd3`), integrated to `ai-engineering`, NOT yet applied** — awaiting owner approval (021–023 were explicitly authorised; 024 is a new migration against the live prod DB). Once approved, T0 applies via `apply_migration` and re-verifies with the trailing SELECT.
- **`rls_auto_enable` is live-only drift** — named in the SEC.4 advisor list but defined in no migration and not in `schema.sql`. 024 revokes it defensively if present. Owner decision pending: capture its definition into `schema.sql`, or drop it. (T0 will `pg_get_functiondef` it during the 024 apply so the decision has the actual body in front of it.)
- mig-023 file corrected (`67a0ccf`); security Low finding fix (`ec5c7fa`).
- `qa-test` dispatched by T1 for 023 idempotency + tally-concurrency (running).
- T2 FE.7 committed (`a1773b1`): new `components/VoteState.tsx`, `bootstrapPlanAccess()` wired into `app/plan/[id]/page.tsx`, per-`PlanAccessDenial`-reason screens. Integrating.

## ✅ Guest vote path verified end to end — 2026-09-01 (T2)

Against a fresh browser profile (localStorage cleared), on lane/frontend's build:
`/plan/22222222-…` → anon session minted → `claim_plan_access` → plan reads →
NameGate → typed name → cast a Round-1 vote. "Selected" state + live count bump
(3→4) both worked. `bootstrapPlanAccess` + `cast_plan_vote` (mig-023 jsonb path)
confirmed working for an anonymous guest. Host decide not run (guest has no host
token; that path unchanged by FE.7).

This is the first time the core loop has worked for a no-account guest —
`PRODUCT_STRATEGY.md` delivery item #1. Recorded as FE.10 in PRIORITIES.md: the
`/login` "Sign in" from the guest-paused screen has no `next` param, so it lands
on `/home` not the plan.

## Migration 024 applied live — 2026-09-01 (T0, owner-approved)

Applied via Supabase MCP `apply_migration`. Verification SELECT confirmed the
intended end state (anon=false on all 7; authenticated=true on the 3 RPCs,
false on the 4 internal fns). `get_advisors(security)` after:

- **SEC.4 function-grant goal met.** `anon_security_definer_function_executable`
  now flags only `record_security_event` (kept for pre-session OTP telemetry).
- **New advisor cluster from B1, not from 024:** `auth_allow_anonymous_sign_ins`
  now fires on ~20 tables. Expected — enabling anon sign-ins means every
  `to authenticated` policy also applies to anon sessions (anon users carry the
  `authenticated` role). The membership scoping (`plan_access`) is what actually
  restricts a guest; the plan/vote/rsvp/ratings/spots policies are the intended
  post-020 guest-read surface. **For `security` to assess (T1):** `friendships`,
  `people`, `visits*`, `place_*`, `storage.objects` also appear — a guest can't
  get a `people` row (profile creation now needs `is_permanent_user()`), so the
  social-graph write policies are likely inert for anon, but confirm.
- `function_search_path_mutable` still on 3 trigger fns
  (`people_before_write`, `trim_companion_name`, `trim_visit_text`) — pre-existing,
  minor, own task.
- `auth_leaked_password_protection` disabled — irrelevant, this app is passwordless.

**`rls_auto_enable` decision:** it's an event-trigger function (event trigger
`ensure_rls`) that auto-enables RLS on any new `public` table — a genuine safety
net, `security definer`, `search_path = pg_catalog`. Recommend **T1 captures its
definition into `schema.sql`** (it's live-only drift, and a scratch rebuild
should have the same guard). Not callable as an RPC (returns `event_trigger`),
so the 024 revoke is pure tidy. Definition is in the T0 session transcript.

## Design implementing directly — turn-14 palette, motion, kokonutui slice — 2026-09-02

Owner told Design's session directly to implement (not just spec) and approved
a 4-step plan; Design correctly refused to drop that on a second-hand "go back
to spec-only" relay from T0 and surfaced the conflict instead — resolution
pending the owner.

Three commits integrated (`00ed31d`, `0184c64`, `09307fc`), gate green:

- **Token layer**: a real 14-color palette, day + night, chosen by the Dubai
  clock (`lib/dubai-phase.ts`, `ThemeSync`), server-stamped so there's no
  flash. The five category-group hues are retired (decision table in the
  handoff); `.token`'s hard-offset shadow retired (supersedes FE.2). Manrope
  swapped to a variable font, 372K of static TTFs deleted.
- **Two owner calls on top**: serif display face, teal accent.
- **Motion + a curated `kokonutui` slice**: new deps `motion`, `lucide-react`,
  `clsx`, `tailwind-merge`, `shadcn` registry config (`components.json`).
  `npm audit --omit=dev`: 0 vulnerabilities.

**Two real bugs found and fixed along the way:**
1. `HomeExperience`/`app/plan/[id]` each carried a local `--night` class
   alongside the document `data-theme` — the two could disagree. This *was*
   FE.4, confirmed real (my earlier "verify, don't assume" flag was right).
   One switch now (`[data-theme="night"] .home-experience`).
2. **Correction to the 2026-09-01 "front-door blank screen = capture
   artifact" note — wrong mechanism, right practical conclusion.** It's
   `HomeExperience` gating content behind `opacity:0` + a `requestAnimationFrame`
   entrance; a backgrounded Chrome window freezes rendering so rAF never
   fires. Real users with a focused window were always fine. Screenshot
   tooling in this environment needs to force the entrance end-state before
   capturing, not just scroll.

**Environment issue found and handled:** `npm install` in the design worktree
silently replaced its symlinked `node_modules` with a real ~500MB directory
(installing the new deps). Worktree `node_modules` symlinks are retired as of
today — see `AGENT_COORDINATION.md`'s Worktrees section. `.env.local` symlinks
are unaffected.

**Two items now ownerless** (Security/Review closed before picking them up):
`next.config.ts` needs `images.remotePatterns` for the photo-led design; the
handoff spec requires vote contents withheld server-side until a round closes,
which `execute_plan_command`/the vote read path doesn't do today. Both need
reassignment.

## The two orphaned items — resolved, both deferred (2026-09-02)

- **`images.remotePatterns`** — Design's call, and it's the right one: don't
  add it yet. There's no photo pipeline and no chosen host yet (`Spot.photo_url`
  is mostly null); every current `next/image` already correctly uses
  `unoptimized` for that reason. A guessed allowlist becomes an SSRF surface
  the moment it's a wildcard, and nobody tightens a guessed one later. Park
  until a real photo source is chosen (Design's upcoming photo-wall work),
  then it needs a `security` subagent look at the specific hosts — not a lane
  picking it up as tidy-up.
- **Server-side vote-withholding** — correctly not design's to build (schema +
  RLS), but also not ready to build: it only matters once the handoff's
  keep/pass + hidden-third-card voting model exists, and nothing has started
  on that yet. Deferred with it, not separately.

Neither is actionable right now. Re-raise both when their real prerequisite
(chosen photo host; the new voting model) actually lands.

---

# Appended 2026-09-16 — 2026-09-05 through 2026-09-06

Split out of `worklog.md` for context hygiene: the migration 035-041 apply
cycle, the scale and silent-truncation findings, and the 69-commit T0 session.
Everything from 2026-09-07 onward stays live in `worklog.md`.

## 2026-09-05 — T1 Security/Backend: coordinate backfill (staged) + a benchmark that came back null

**The gap.** All 82 curated spots had null `latitude`/`longitude` on the
live project, so "getting there" (haversine distance + Maps link, shipped
that morning) could never render for a real user. Not a code bug — missing
data.

**Backfilled 40 of 82, not 82, and the gap is the point.**
`scripts/backfill-spot-coordinates.mjs` geocodes against Nominatim (OSM's
free geocoder — no paid Places API, per the standing call), sequentially at
~1 req/sec with a real User-Agent per their usage policy. It only reads the
live catalog and writes a local review file; it never touches the database
and no live code path depends on it. One-off, not a pipeline.

The strict `"name, area, Dubai"` query matched 27. A looser name-only
fallback matched 26 more — and **half of those were the wrong venue**.
"DRIFT Beach Dubai" matched Drift Burgers. "Garage Dubai" matched the Dubai
Mall Zaabeel Parking Garage. "BLU Dubai" (Al Habtoor City) matched Radisson
Blu Deira Creek. McGettigan's and VOX each matched a real branch, just the
wrong one. 13 rejected by hand, 13 kept.

The other 42 stay null deliberately. A null hides the distance line; a wrong
coordinate walks somebody to the far side of the city. Loosening the query
further is what produced the bad matches, so the remainder wants a hand
lookup, not a cleverer script. Coordinates live only in
`migration-037-backfill-curated-coordinates.sql`, with a pointer from
`seed-categories.sql` rather than a duplicate copy that would drift the
moment one of the 42 is hand-corrected. Updates are keyed by id and guarded
on `latitude is null`, so a re-run can't clobber a correction. Validated on
the local stack: 40 rows on the first run, 0 on the second. **Staged, not
applied** — owner's call, same as every migration here.

**Benchmarked 7c69a9c (T0's `Promise.all` on `getUser` + `consumeQuota`):
real uncontended, null at the ceiling.** n=1: 61.6ms → 56.3ms median p50,
winning 12/12 paired reps — about one local round trip, which is exactly
what was removed. n=50 and n=100: nothing outside run-to-run noise, and the
~n=100 ceiling did not move. The README's stated cause looks simply wrong —
the wall isn't serial round trips, it's one `next start` process saturating,
and firing two queries at once doesn't shrink the queue behind them. Kept
the change (free, less waiting, worth more off-loopback), recorded as a null
result rather than dressed up as 3%.

**Method note, because it nearly fooled me:** measuring one build then the
other showed a clean ~40% win that was entirely JIT warm-up — a cold server
runs ~2x its warm self, dwarfing the effect. Rebuilt to run both commits
simultaneously on separate ports with alternating paired reps and discarded
warm-up rounds; `scale.mjs` takes `LOAD_APP_URL` for this now. Any earlier
sequential before/after number in this repo is suspect for the same reason.

Also documented a setup trap: with `app_control_secrets` unseeded locally,
every quota-gated route returns 429 "Too many deals" on a fresh user's first
request — actually `consume_app_quota` raising 42501 and `consumeQuota()`
failing closed.

Commits: `b733703` (geocoding + migration 037, staged), `4e5a68b`
(benchmark + harness). Gate green throughout.

---

## 2026-09-05 — T1 Security/Backend: one account through the whole arc

`scripts/verify-journey.mjs` walks a single fresh account end to end against
the local stack and asserts the real rows at every hop: sign up → profile →
age → deal → create (voting path *and* direct path) → share → a second
identity claims access → pool votes → advance → final vote → decide → the
last mile (event/booking) → RSVP with carpool fields → rate → log the visit
→ Been → collection. A third identity is a negative control throughout.
**82 checks across 19 steps, 80 passing.**

**The seams hold.** `plan_access` gates an uninvited identity out of the
plan, its spots, and voting (42501). The host token is stored only as a
SHA-256 hash. `stage` gates `phase`, so a pool vote is refused once the
final round opens. One participant token carries the same `voter_name`
across vote → RSVP → rating. A re-vote replaces a pick rather than adding a
second row. Direct plans land `decided`/`decided` with one advanced
`plan_spot` and a host `plan_access` grant.

**Finding 1 — `set_plan_rsvp`'s null-choice guard doesn't guard.**
`p_choice not in ('coming','maybe','no')` evaluates to NULL, not TRUE, when
`p_choice` is NULL, so the `or` never fires and a null choice reaches the
insert and dies on the column's NOT NULL as a raw `23502` instead of the
intended `42501`. **Not reachable from the UI** — `setRsvp` in
`app/plan/[id]/page.tsx` is typed to the three literals — and there is no
integrity impact, so this is latent, not live. Migration 035's newer
`p_transport` guard avoids exactly this trap (`is not null and ... not in`);
the older `p_choice` line never got the same treatment. One-line fix; worth
riding along with the next migration rather than opening its own approval
round.

**Finding 2 — a decided plan still can't show "getting there".** The
journey's winner had null coordinates *on a stack that already has migration
037 applied*. Per category this is much sharper than "42 are null":

| coverage | categories |
|---|---|
| 0% | beach_club, escape, padel, wellness |
| 25-40% | brunch, dessert, karaoke, shisha, nightlife, water, dinner |
| 50-75% | games, sports, adventure, family, live_music, beach, cafe, movie, vibes |

Four categories can **never** render a distance line, and dinner — the
most-used category — sits at 40%. If the owner wants the last mile to feel
real, hand-pasting coordinates for those four categories (12 spots) buys
more than any further geocoding would.

**Two of my own assumptions were wrong first**, recorded so the next person
doesn't repeat them: voting is one selection per (participant, round), not a
yes/no per card — a `false` value DELETES your pick rather than recording a
"no" — and the transport value is `need_ride`, not `needs_ride`.

Commit `5b1ce3b`. Gate green (lint/tsc/38 tests). No schema change, no
migration, nothing applied.

---

## 2026-09-06 — T1 Security/Backend: journey extended to the flows off the spine

`scripts/verify-journey.mjs` now runs **120 checks across 29 steps, 116
passing**. Steps 20-29 cover what the spine didn't: the venue-link import
write path, visit photos, friends, and Wrapped. Same file, same assertion
style — an extension, not a framework.

**Venue-link import, verified end to end for the first time.** The write
path needed a permanent account, which the local stack now provides. A link
whose title names a curated spot resolves to that spot and lands in the
caller's own default collection. A re-save into a second collection reuses
the row and does **not** reset a resolved import to pending (the
fetch-then-insert design holds). Instagram — no credentials by design —
fails honestly as `needs_input`/`unsupported_provider` rather than
pretending to have looked. Two genuinely concurrent first-time saves of the
same new link both return 200 with the same id and leave exactly one
`place_imports` row and one collection item: the 23505 recovery path works
under a real race, not just in theory.

**Photos, friends, Wrapped all hold.** A photo uploads only under the
caller's own uid folder; uploading into another user's folder is refused;
the signed URL comes from the caller's own session and the friend
**cannot** sign a URL for it (private bucket, folder-scoped policy, no
server credential anywhere in the path). Friendship mirrors to both
directions on insert and clears both on delete. Wrapped's numbers are
asserted against rows this run created — exactly 2 plans, 1 visit, the
winner's spot, the 5 stars submitted — not merely non-empty.

**Finding 3 — a large page loses metadata it already downloaded.**
`safe-fetch.ts`'s `readCapped` enforces its 512KB limit by **throwing**, so
any page over the cap resolves to `fetch_failed` ("response was too large")
even though `<title>` and the `og:` tags arrived in the first chunk.
Verified directly rather than assumed: the first 512KB of the Burj Khalifa
article contains the title and 5 `og:` properties. Truncating at the cap and
parsing what was read keeps the SSRF/DoS protection intact — the point of
the cap is never reading more than 512KB, which truncation also satisfies —
and makes the feature work on large pages. User-visible: paste a link to a
big page, the app says it can't read it.

**Finding 4 — an exact title match refuses to resolve.** `match.ts`'s
`overlapScore` divides by `min(a.size, b.size)`, so a spot whose entire
post-stopword name is a single token scores a perfect **1.0** against *any*
title containing that word. On a "Mall of the Emirates" title, "The Dubai
Mall" → `{mall}` ties at 1.0 with the genuine exact match; `RESOLVE_MARGIN`
sees no gap and sends the user a pick-one list instead of the obvious
answer. **17 of the 82 curated spots have a single-token effective name**
(3Fils, Bounce, Iris, Ninive, OliOli, QDs, Saffron, Shimmers, SoBe, The
Fridge, The Nine, …), so this is systemic, and the same asymmetry means a
title like "Saffron risotto" will surface a venue.

Both reported, neither patched — that was the instruction and it is the
right call: the fix for #4 in particular is a scoring-semantics decision
(asymmetric containment vs. a length floor), not a mechanical edit.

Parked and deliberately untouched: `set_plan_rsvp`'s `p_choice` null-guard
(rides along with the next migration out) and the coordinate coverage gap
(needs the owner's 12 hand-pasted values).

Commit `9b6a487`. Gate green (lint/tsc/38 tests). No product code changed,
no migration, nothing applied.

---

## 2026-09-06 — T0: migration 037 applied live (owner-approved)

**Owner approved 037 explicitly ("i approving migration 037"); applied via MCP
against `zyojaoyatunjwgbivaqu`, verified by query, not assumed.**

Pre-checked the file before running rather than trusting its header: 40
`update` statements, 40 distinct ids, every one guarded `and latitude is
null`, zero DDL and zero destructive keywords (`drop|delete|truncate|alter|
grant|revoke` all absent). Idempotent by construction — a re-run is a no-op.

**Before:** 82 spots, 0 with coordinates. **After:** 40 with coordinates, 42
still null (the deliberate rejects — 29 with no Nominatim match, 13 that
matched a *different* venue). All 40 land inside a UAE bounding box
(lat 24.814–25.266, lon 55.129–56.160); the two out-of-city outliers are
Hatta and Al Qudra, plausible for `escape`/`adventure`.

**Correction to a number that was on record.** The repeated "42 are null"
figure came from the *local* stack, where 037 had already been applied. Live
had **all 82** null until today, because 037 had never been applied there —
so `getting there` could not render for any spot, in any category, for any
real user. Worth stating plainly: the local figure was right about local and
silently wrong about production, which is the failure mode of quoting a
number without its environment.

**Live category coverage now** (this is what decides whether the distance
line can render):

| coverage | categories |
|---|---|
| 100% | culture, outdoors, shopping |
| 67–75% | adventure, beach, cafe, family, live_music, movie, vibes |
| 25–50% | brunch, dessert, dinner (40%), games, karaoke, nightlife, shisha, sports, water |
| **0%** | **beach_club, escape, padel, wellness** |

The four zero-coverage categories still cannot ever render a distance line —
12 spots, unchanged by this migration and not fixable by more geocoding
(they are the ones Nominatim could not match or matched wrongly). Hand-pasted
coordinates remain the only fix, still the owner's call.

Migrations 035 and 036 remain staged and unapplied.
## 2026-09-06 — T1 Security/Backend: both import findings fixed, scoring re-derived

Findings 3 and 4 from the journey run are fixed, measured, and pinned with
regression tests. Journey now **118/120 across 29 steps** — the only two
failures left are the deliberately parked items (`p_choice` null-guard,
coordinate coverage).

**#3 — `readCapped` truncates instead of throwing** (`safe-fetch.ts`). The
cap's guarantee is "never read more than 512KB from an arbitrary host", and
stopping at the limit satisfies that exactly as well as aborting did — but
aborting also threw away metadata that had already arrived, so any page over
the cap failed with "response was too large" while holding its `<title>` and
`og:` tags in the first chunk. Reader is still cancelled the moment the cap
is hit. Both consumers degrade safely **by construction, not luck**:
`web-adapter`'s regex requires a *complete* quoted attribute value, so a cut
mid-attribute yields no match rather than a garbled title; `oembed` already
converts a JSON parse failure into a `SafeFetchError`, so oversized JSON
still lands as `needs_input`; and a multi-byte character split at the
boundary decodes to U+FFFD under the non-fatal decoder rather than throwing.
Five unit tests cover the boundary, including the straddling-tag and
split-character cases.

**#4 — symmetric F1 scoring replaces the `min()` divisor** (`match.ts`).
`min(a.size, b.size)` only asked "is this name contained in the title",
never "does this name explain the title", so a one-token name scored a
perfect 1.0 against any title containing that word. **Measured on the real
82-row catalog, not a fixture:**

| | exact-name self-resolve | confident false positives |
|---|---|---|
| `min()` | 77/82 | **6/6** |
| F1 | **82/82** | **0/6** |

The false-positive column is the part I had under-reported: under `min()`
*every* adversarial title resolved confidently — "Saffron risotto recipe"
→ Saffron, "How to grow an iris in your garden" → Iris. Worse, `min()`
actively mis-ranked real cases: on **Kite Beach's own title**, "O Beach
Dubai" → `{beach}` outranked Kite Beach itself. So this was never only "exact
matches don't resolve"; it was also "unrelated pages resolve to a venue".

**Thresholds re-derived, not carried over.** `RESOLVE_FLOOR`/`RESOLVE_MARGIN`
were tuned against `min()`'s distribution and mean nothing under F1, so I
swept them against the real catalog:

```
floor   margin .05/.10/.15        margin .20
0.50    82/82, 1 false positive   80/82
0.60    82/82, 0 false positives  80/82
0.65    82/82, 0 false positives  80/82
0.70    60/82 (collapses)         60/82
```

0.6/0.15 sits inside the safe plateau and **stays unchanged** — but now
because it was verified against F1's distribution, not because it was
inherited. Of the margins holding 82/82 with no false positives, 0.15 is the
most conservative (largest gap demanded before auto-resolving), so it is the
right one to keep. The sweep is recorded in `resolve.ts` next to the
constants.

Three matcher regression tests pin both directions of the old bug (a short
name must not tie with the title's real subject, must not score against an
unrelated title, and must still win its own title outright).

`readCapped` is now exported solely so the boundary is testable without a
network round trip, and `tests/resolve-aliases.mjs` gained a
`server-only`/`client-only` → empty-module shim: that package's only job is
to break a *client bundle*, which a `node --test` run does not have, so the
real Next build still enforces the boundary unchanged.

46 unit tests (up from 38). Gate green.

**`security` review of the truncation change** — sound, with one real
(pre-existing) finding that my own new comments had made worse by asserting
a bound the code did not provide:

- **The 5s timeout only covered the response head, not the body stream.**
  `clearTimeout` fired in the `finally` attached to `fetch()`, i.e. the
  moment headers arrived, leaving `readCapped` streaming with no deadline. A
  host that sends headers instantly and then dribbles one byte per second
  held the request open for days without ever exceeding the byte cap — the
  reviewer measured it still reading after 15s, 27 bytes in. Not introduced
  by the truncation change (the old loop had to read 512KB+1 before it could
  throw, so it held just as long), but `resolve.ts` and the place-import
  route both claim "worst case adds ~5s", which was simply untrue. **Fixed:**
  the timeout now stays armed across the body read, `return await` so the
  `finally` runs after streaming completes rather than before, and an abort
  mid-stream is converted to a `SafeFetchError` instead of leaking a raw
  `AbortError`. Verified 5007ms → SafeFetchError against a stubbed
  slow-dribble host. Not committed as a test: pinning it costs 5s of real
  wall time in a suite that currently runs in 0.4s, and the explicit comment
  is the cheaper guard.
- **My "no garbled value" claim was right but stated too broadly.** The
  regexes have no anchors or lookarounds, so any match in a truncated prefix
  is a match at the same offset in the full document — a captured value
  always exists verbatim in the real page, so truncation can never
  synthesize or garble one. What it *can* change is which tag wins, because
  `metaContent` falls through to a reversed-order fallback when the forward
  pattern's match spans the cut. No trust impact (the page author controls
  every candidate on their own page), but the comment now says this
  precisely instead of claiming more than it should.
- The straddling-tag test was re-declaring web-adapter's regex, so it could
  have passed while the real code drifted. It now calls the exported
  `metaContent`, and a second test pins the verbatim-substring property that
  is the actual reason truncating is safe.
- No concern with exporting `readCapped` (it holds no part of the SSRF
  boundary — host validation, redirect re-validation and the content-type
  gate all stay in `safeFetch`, and the client barrel does not re-export it),
  and the `server-only` shim was confirmed unable to affect the real build:
  enforcement is webpack-side (`next/dist/build/webpack-config.js`), which a
  Node ESM resolve hook cannot reach.

**Not fixed, reported instead** (pre-existing, out of scope for these two):
there is no length cap on the extracted title between `web-adapter` and the
`extracted_data` jsonb write, so a hostile page can persist a ~512KB title.
Unchanged by this work and never rendered today; the natural place for a
`.slice()` is whenever someone builds the "show why it matched" UI.

47 unit tests. Journey 118/120. Gate green.

---

## 2026-09-06 — T0: migrations 035 + 036 applied live (owner approved all)

Owner: "apporove all migrations". Applied via MCP, each verified by catalog
query rather than assumed. **035, 036 and 037 are now all live; the
`supabase/` directory has no unapplied migration left.**

**035 (carpool fields).** Verified: both columns present, the
`rsvps_seats_only_when_driving` constraint present, and **exactly one**
`set_plan_rsvp` — the old 5-arg signature dropped cleanly rather than
leaving an overload, which was the specific trap 035's author flagged when
writing it. Grants correct: `anon` cannot execute, `authenticated` can.
The frontend one-liner that had to land before or alongside this (passing
`p_transport`/`p_seats_available` so an ordinary RSVP tap can't null a
carpool answer) was **already shipped** — verified at
`app/plan/[id]/page.tsx:488-489` before applying, not assumed.

**036 (moodboards).** Verified: RLS enabled on both tables, one
ownership-scoped policy each, `{authenticated}` only, no anon policy.

**Deliberately NOT hand-edited at apply time:** 035 still carries the
`p_choice not in (...)` NULL-guard bug (`NULL not in (...)` is NULL, not
TRUE). It was parked to "ride along with the next migration," but amending
a security-reviewed migration during its own apply — with no re-review —
is a worse habit than shipping one latent, UI-unreachable bug. Now that the
owner has approved migrations as a class, it gets its own numbered
migration instead.

### Live grant posture, checked across all 23 tables

Every table shows `anon` holding table-level SELECT (and most, write) — the
Supabase default grant — with **RLS as the actual gate**. 036 matches that
posture exactly, so it is consistent with the existing model rather than a
regression. Recording the shape so the next reader doesn't mistake the
grant for an exposure.

**One genuine exception, and it is the only one:** `visit_photos` carries
the database's **sole anon-facing policy** — `read permitted visit photos`,
`{anon,authenticated}`, whose first clause is `visibility = 'community'`.
So an unauthenticated caller holding the (public-by-design) anon key can
read any `community` row, including `person_id` and `storage_path`.
**Not exposed today**: 0 rows in the table, and the column default is
`'friends'`, so a user must deliberately opt in. Reads as an intended
community-feed design with a safe default. Flagged for confirmation rather
than as a finding — but it is the one place where "RLS is membership-scoped,
not permissive" has a deliberate exception, and that is worth knowing.
## 2026-09-06 — T1 Security/Backend: photo sourcing measured, blocked on owner input

Measured all three free tiers before building anything. **The free path tops
out at ~10 real venue photos out of 82 (12%).** Reporting rather than
proceeding, because the gap is a product decision, not an engineering one.

**Tier 1 (venue's own site, via the existing OG extraction): 1 usable.**
Not a limitation of the machinery — a limitation of the data. Only **2 of 82**
curated spots have any URL at all (`booking_url`), and one of those two
(`reifother.com`) no longer resolves. The one that works, Tresind Studio,
returned a clean og:image on the first try. So the extraction is fine; there
is simply nothing to point it at.

**Tier 2 (Wikipedia/Wikimedia): ~9 usable, and only landmarks.** My first
probe was invalid twice over and is worth recording as a caution: 300ms
between calls got HTTP 429, and `generator=search` returns the top hit
regardless of relevance, which produced "Bla Bla" → the footballer Blas
Pérez and "The Smash Room" → Dubai International Airport. Re-run with exact
title matching and 1.2s spacing: 19/82 have a page under their own name, 11
carry an image — but the **single-token-name problem resurfaces in a
completely different system**. Verified against the articles' own text:
Hummingbird is the bird, SoBe an American drink brand, Bla Bla an interactive
animated film, Saffron the spice, and Iris / Ninive / La mer are
disambiguation pages. Stripping those leaves **9 trustworthy**: VOX Cinemas,
Cinema Akil, Deep Dive Dubai, Museum of the Future, Dubai Safari Park, Dubai
Design District, Mall of the Emirates, The Green Planet, Black Tap.

**Tier 3 (Unsplash/Pexels): blocked, and wrong by default anyway.** Both
require an API key the owner must register for. More importantly a stock
photo is not the venue — it is the exact failure mode we rejected for
coordinates, and worse here: a wrong coordinate is invisible until someone
navigates, a wrong photo *looks correct on the card*.

**Coverage by category — 15 of 23 categories get zero:**

| sourceable | categories |
|---|---|
| 2 of n | movie, shopping |
| 1 of n | adventure, culture, dessert, dinner, family, outdoors |
| **0** | beach, beach_club, brunch, cafe, escape, games, karaoke, live_music, nightlife, padel, shisha, sports, vibes, water, wellness |

**The compounding is real and confirmed.** beach_club, escape, padel and
wellness are at 0% coordinates *and* 0% photos. Those four categories can
currently render neither a distance line nor an image — they are the weakest
surfaces in the app, not two independent gaps.

**The ask that actually unblocks this:** tier 1 is the only tier that yields
genuine venue photography, and it fails purely for want of URLs. ~80 venue
website URLs, pasted once, turn machinery we already own and have already
hardened into real photos at real quality — the same shape as the 12
hand-pasted coordinates. That is a far better use of the owner's time than
approving a stock-image backfill that makes 72 cards *look* right while
showing somewhere else entirely.

Nothing built, nothing staged, no bucket created, no migration written —
the design (public `spot-photos` bucket, `photo_source`/`photo_attribution`
columns, remotePatterns at the end) is agreed but waiting on this decision,
because the answer changes what gets built.

---

## 2026-09-06 — T1 Security/Backend: scale defects, and a silent-truncation class

Four scale defects, measured against a seeded local catalogue at 1082 and
5082 rows. **The headline is not performance.** Three queries were silently
returning wrong results past 1000 rows.

**PostgREST caps every table read at 1000 rows, with no error and no flag.**
An explicit `.limit(3000)` or `.range(0, 4999)` does not lift it — both
still return 1000 (measured). None of the affected queries had a limit
clause, so nothing in the code looked capped:

- **`dealSpotIds` — the core product loop.** At 5082 spots a dinner-family
  deal matched 1109 rows and received 1000. Every plan was dealt from the
  oldest 1000 spots of the family; the rest of the catalogue was undealable.
- **`resolvePlaceImport`.** Matched a pasted link against only the first
  1000 curated spots, reporting "no match" for venues that are in the
  catalogue.
- **`app/home/page.tsx`'s `.limit(120)`.** Explicit rather than silent, but
  at 1000 venues 880 are invisible in Discover, which filters client-side.
  **Removing the limit does not fix it** — the same 1000-row cap applies, so
  a naive fix still truncates at 5000. This one needs server-side search;
  it is Frontend's file and is flagged rather than edited.

Both fixable queries now page via `lib/supabase/paginate.ts`. Verified at
5082: resolve returns all 5082 (56ms, 6 round trips), deal returns all 1109.

**Indexes — measured, with an honest crossover.** Medians of 15 runs of
Postgres's own Execution Time, two warm-ups discarded.

| n=5082 | common term | no match | rare term | deal |
|---|---|---|---|---|
| before | 0.082 ms | 2.256 ms | 2.302 ms | 0.656 ms |
| after | 0.087 ms | **0.074 ms** | **0.109 ms** | **0.340 ms** |
| | −6% | **30x** | **21x** | **1.9x** |

Two things worth stating plainly. The existing `spots_name_idx` was **not**
unused as assumed: with `order by name limit 8` Postgres walks it in name
order and exits early, which is fast for a *common* term. The pathological
case is a rare or absent term — a typo, or a venue we do not stock — where
it must walk everything. That is the case users actually generate, and it is
the one the trigram index fixes. The common-term case gets marginally
*slower*; that is the right trade.

**The crossover is the more useful number: ~1,200 rows.** At 1082 the
planner ignores the trigram index and seq-scans anyway, because scanning
1082 rows is genuinely cheaper than the GIN machinery. So this index does
nothing at today's 82 spots and nothing at the owner's near-term 1000 — it
starts paying just past it. Added because the target is "500–1000s", not
because it helps today.

**`area` deliberately not indexed.** It is never a SQL filter anywhere in
this codebase — only read in JS for coordinate lookup. An index no query
shape can use costs writes and buys nothing.

**A regression I introduced, and the journey caught it.** Migration 038's
"no client writes to spot-photos" policies were written as ordinary
PERMISSIVE policies. Permissive policies are OR'd, so
`with check (bucket_id <> 'spot-photos')` did the opposite of its name: it
GRANTED insert into every other bucket unconditionally, defeating
visit-photos' own `foldername(name)[1] = auth.uid()` ownership check and
letting any signed-in user write into anyone's folder. `verify-journey.mjs`
step 25 failed on exactly that assertion. Fixed with `as restrictive`, which
is AND'd and can actually subtract permission. **A permissive policy can
never express "deny"** — worth remembering, because the intent ("say nobody
out loud") was right and the mechanism was backwards.

Migration 040 also carries the parked `p_choice` null-guard fix, verified
returning 42501 instead of a raw 23502.

Journey 119/120 — the only remaining failure is the known coordinate gap.

---

## 2026-09-06 — T0: migrations 038 + 040 applied live; 039 HELD

Owner: "approve all migrations". Applied 038 and 040, verified by catalog
query. **039 deliberately NOT applied.**

**038** — verified: both photo columns present, `spot-photos` bucket exists
and is public, 4 storage policies of which **3 are RESTRICTIVE** (the read
policy is correctly permissive; the three write-denial policies are not).
That restrictive/permissive distinction is the whole point: the version of
038 staged earlier today had them as ordinary permissive policies, where
`with check (bucket_id <> 'spot-photos')` does the opposite of its name —
permissive policies are OR'd, so it *granted* unconditional insert into
every other bucket, defeating `visit_photos`' folder-ownership check.
Backend caught it via `verify-journey.mjs` step 25 and fixed it before
apply. A permissive policy can never express "deny".

**040** — verified: `pg_trgm` installed, both indexes created, and the
parked `p_choice` NULL-guard finally shipped (`p_choice is null or p_choice
not in (...)`), so a null choice raises 42501 instead of a raw 23502.

**039 held, and this is the point of checking rather than assuming.** It
sets `photo_url` on six spots to `.../storage/v1/object/public/spot-photos/
<id>.jpg`. The bucket is live but **contains 0 files** — the reviewed images
were never uploaded. Applying it would have pointed six cards at 404s, which
is strictly worse than the null they have now: a broken image asserts that a
photo exists. Backend uploads the six files first; 039 applies after, and
the guarded `where photo_url is null` clauses mean it stays a no-op until
then.

Live photo state is unchanged: **0 of 82**.

---

## 2026-09-06 — T1 Security/Backend: front-door wall was unreadable, not unpassed

The "Dubai, right now" wall showed its empty state to every visitor. The
reported cause — `app/page.tsx` passing no spots — was only half of it.

**The other half: a signed-out visitor could not read `spots` at all.** Every
policy on the table was granted `to authenticated`, so an anon read returned
**zero rows and no error**. That silence is why it looked like "no spots
passed" rather than "no permission" — the same silent-empty shape as the
1000-row truncation class. The busiest page in the app has been telling every
prospect "no places in the catalog yet" against a catalogue of 82.

**Migration 041** grants anon `select` on `spots` scoped to
`source = 'curated'` and nothing else. Custom (user-created) spots stay
governed solely by the authenticated policy. Verified locally: anon reads
curated, gets 0 custom rows, and is refused on insert.

**The query is a bounded display sample, not a catalogue read**, and the
distinction is the point: PhotoWall renders at most 12 tiles, so `limit(12)`
is the wall's own size rather than an arbitrary cap. A query that means "all"
and takes what it gets is a truncation bug; one that means "twelve" and asks
for twelve is not. Photos sort first so the six queued images land where they
earn most.

**`security` review — policy sound, four findings, all fixed:**

- **Medium, and a regression I introduced.** Passing 12 spots trips
  `CardStackExample`'s `spots.length >= 9` check, so the hero deck switched
  from its curated illustrative cards to real rows — and `toDeck` reads
  `category` and `price_band`, which my select omitted. Every card fell back
  to the generic chip with a blank price. **The `as Spot[]` cast is what hid
  it from the type checker.** Both columns added; verified 0 generic chips
  and 9 price bands rendering.
- The query discarded its `error`, rebuilding the exact silent-empty failure
  the migration condemns. Now logged.
- `photo_attribution` added to the select ahead of 039: several queued photos
  are CC-BY and the licence requires credit wherever the image renders. The
  data is now there; **PhotoTile still does not render it**, which is
  Frontend's and must land before 039 puts CC images on this page.
- A comment I wrote in 038 and `schema.sql` claimed "the backfill writes via
  the service role". There is no service-role key by design. Corrected —
  prose asserting a credential exists is what authorises someone to mint one.

Review also asked for two widenings to be stated plainly in 041's header,
and they now are: RLS is row-level, so the policy exposes all curated
columns rather than the nine the page selects; and "age-restricted venues
are enumerable", previously accepted as requiring an account, now needs no
session. Both low for a public list of licensed venues, neither should be
rediscovered as a surprise.

Journey 119/120. Gate green. 041 staged, not applied.

---

## 2026-09-06 — T0: migration 041 applied live

Applied and verified: exactly one anon policy on `spots`, SELECT only,
`using (source = 'curated')`. Custom spots remain authenticated-only.

Applied under the owner's blanket migration approval rather than held like
038, and the distinction is deliberate: 038 created a public *write-target*
bucket, which is a posture change worth a separate yes. 041 grants read on
curated venue rows that are already the app's public marketing content, and
without it the front door is broken for every signed-out visitor — every
policy on `spots` was `to authenticated`, so an anon read returned zero rows
**and no error**. Same silent-empty shape as the 1000-row truncation class:
the page looked like it was passed no spots when it was actually refused.

Two widenings recorded rather than left to be rediscovered, both flagged by
Backend in 041's own header: RLS is row-level, so the policy exposes every
curated column and not merely the nine the page selects; and enumerating
age-restricted venues, previously requiring an account, now needs no
session. Both low for a public list of licensed venues, both stated to the
owner.

---

## 2026-09-06 — Property of this system: it fails by silence, not by refusal

Recording this as a pattern rather than as two coincidences, because it has
now cost real bugs twice in one day and both were invisible from the code.

1. **PostgREST caps a table read at 1000 rows** and says nothing. No error,
   no truncation flag, and an explicit `.limit(3000)` does not lift it. Three
   queries were silently returning wrong results — including `dealSpotIds`,
   the core product loop, which dealt every plan from the oldest 1000 spots.
2. **A missing RLS grant returns zero rows**, not a permission error. The
   front-door wall read `spots` as an anon visitor and got `[]` with no
   complaint, which read as "no data passed" rather than "no read
   permission" — so the diagnosis went to the wrong half of the problem.
3. **A malformed request arrives as an empty grid.** An unquoted search term
   containing a comma breaks PostgREST's `or` grammar: `"a,b"` returns
   PGRST100 and a **400**, not zero matches. The client discarded the error,
   so someone searching "beach, dubai" saw an empty grid and read it as "no
   such place" — a rejected request wearing the same face as an honest miss.
   (Found by Frontend, 2026-09-07; quoting the value fixes it.)
4. **A view created without `security_invoker` runs as its OWNER and bypasses
   RLS entirely.** Nothing errors; it simply returns more than it should.
   Migration 044 turns on exactly this option, and the whole safety of that
   view rests on it.

Both have the same shape: **the database answers a question it could not
actually answer, and returns an empty success.** An empty result is
therefore never evidence of an empty table. It means "empty, or truncated,
or forbidden", and those are indistinguishable at the call site.

Practical consequences, applied in today's fixes:

- Never destructure `{ data }` alone from a Supabase call whose emptiness
  would be meaningful. Take `error` and log it (`app/page.tsx`).
- When a query means "every matching row", say so explicitly and page —
  `lib/supabase/paginate.ts`. When it means "a bounded sample", make the
  limit the consumer's own size so the intent is legible (`limit(12)` for a
  12-tile wall).
- When probing this database, prove a positive. `verify-journey.mjs`'s
  negative controls assert a specific error code, not merely absence of
  rows — `supabase/CLAUDE.md` already says `200 []` is ambiguous, and these
  two bugs are what that warning looks like in production.

Related: `as Spot[]` casts over narrowed selects hide the same class of
problem from the type checker. One of those cost a marketing-hero regression
today (`CardStackExample` receiving rows without `category`/`price_band`).
A cast that quiets tsc about data shape is worth distrusting on sight.

---

## 2026-09-06 — T1 Security/Backend: the paging fix reintroduced the bug it removed

A silent-failure review of today's diff found four criticals in my files. The
first is the one that matters: **`fetchAllRows` returned the rows it had
gathered when a later page failed**, as a plain `T[]` the caller could not
distinguish from a complete answer. `dealSpotIds` checks only for null, so a
transient error on page 1 would have dealt a plan from the oldest 1000
spots — byte-for-byte the incident the helper was written to remove, reached
through its own fix.

Fixed, and the contract is now stated in the file: **`T[]` means complete,
null means ask again.** Any page error returns null (logged, rows
deliberately discarded); exhausting `MAX_PAGES` with every page full is also
an error, because 50k-truncated and exactly-50k are indistinguishable — the
PostgREST cap again with a bigger number.

**Eight tests now pin that contract** (`tests/supabase-paginate.test.ts`),
including the one the review called the highest-value in the tree: page 0
succeeds, page 1 errors, assert the caller cannot mistake the result for
complete. There was no test for this helper at all despite it being the fix
for three incidents.

**The ratings read** (`lib/spots/match.ts`) sat two lines below the paging
fix, unpaged, with its error destructured away. Worse than truncation:
unrated spots score 3.6, *above* a mediocre rating, so a short read silently
**promotes** every spot whose ratings fell off the end — two identical plans
dealt a second apart return different winners and both look correct. Now
chunked at 100 ids (a large `.in()` serialises into the query string and
returns HTTP 414 past a few thousand, which read as "nobody has rated
anything"), paged, and fails hard: ranking on a partial read is worse than
not dealing.

**`resolvePlaceImport`'s `?? []`** turned "the read failed" into "the
catalogue is empty", which the matcher renders as no_match — and the next
line *wrote that to the database*. A transient error while someone saved a
real venue durably recorded "we couldn't match this", and a resolved row is
not re-resolved. Now returns early: leaving an import pending is
recoverable, persisting a false negative is not. Its bare `catch {}` binds
and logs the error (it was swallowing aborts, scorer errors and shape
mismatches into one anonymous code, and because it caught, `onRequestError`
never saw them), and the outcome write checks its row count — a PostgREST
update matching zero rows is a successful no-op, so an RLS refusal left the
import pending while the POST returned 200.

**`safe-fetch` had two bounds claimed but not enforced.** `TIMEOUT_MS` was
armed fresh per redirect hop, so three hops was 15s against an advertised
~5s; there is now one deadline for the whole call. And `assertPublicHost`
ran *before* the AbortController existed, so DNS was covered by no timeout
at all — the same slot-holding failure the body-read fix closed, one
function earlier. `lookup()` is now raced against a 2s deadline.

Also: `verify-journey`'s `skip()` recorded `pass: true`, so a permanently
broken import pipeline would skip forever and keep the suite green — the
same "no complaint reads as success" shape. Now `pass: null`. And the
scale seeder no longer discards its count error, since migration 040's
benchmark numbers are quoted against the row count it reports.

Journey **120/120**. 64 unit tests (was 56). Gate green.

---

## 2026-09-06 — T0 session summary (69 commits, all four branches synced)

Written as a handoff. `AGENT_COORDINATION.md`'s decisions log has the
per-item detail; this is the shape of the day.

### Live database — six migrations applied, one deliberately held

035, 036, 037, 038, 040, 041 are **all applied and verified by catalog
query**, not assumed. **039 is held**: it sets `photo_url` on six spots to
`spot-photos` bucket URLs, and the bucket contains **zero files**. Applying
it would point six cards at 404s, which is worse than the nulls they have —
a broken image asserts a photo exists. The owner uploads the six files
(`scripts/spot-photos/`, named by spot id, `MANIFEST.json` has each
licence), then 039 goes.

Live photo state: **0 of 82**. Live coordinates: **40 of 82**, with
beach_club / escape / padel / wellness at 0%.

**Two apply-time judgements worth keeping.** 035 shipped with its known
`p_choice` NULL-guard bug rather than being hand-edited mid-apply —
amending a security-reviewed migration during its own apply, with no
re-review, is a worse habit than one latent UI-unreachable bug. It got its
own migration (040) once blanket approval existed. And 038 was held for
explicit approval where 041 was not: 038 created a public *write-target*
bucket, 041 grants read on content that is already the public marketing
surface.

### The day's defining bug class

**The system reporting success for a question it could not answer.** Seven
instances, three of them found in code written the same day:

- PostgREST silently caps every table read at 1000 rows, no error, no flag,
  and an explicit `.limit(3000)` does not lift it. Every plan was dealt from
  the oldest 1000 spots.
- Every policy on `spots` was `to authenticated`, so an anon read returned
  zero rows **and no error** — the front door looked unfed rather than
  refused.
- A Supabase Storage policy written PERMISSIVE instead of RESTRICTIVE
  *granted* the write it was named to deny.
- `fetchAllRows`, written to fix the first item, returned a partial page-set
  as a plain `T[]` on a mid-page error — reintroducing the exact shape one
  layer up.
- The ratings read sat unpaged two lines below that fix, error discarded.
  Worse than truncation: unrated scores 3.6, *above* mediocre, so a short
  read **promotes** every spot whose ratings fell off the end.
- A failed catalogue read was written to the database as the verdict
  "no match" for a venue that is in the catalogue.
- `verify-journey`'s `skip()` recorded `pass: true`, so a permanently broken
  pipeline would skip forever and stay green.

All fixed. `lib/supabase/paginate.ts` now states its contract — `T[]` means
complete, `null` means ask again — with eight tests pinning it. Found by the
`pr-review-toolkit` silent-failure agent pointed at the day's own diff.

### Observability — errors were invisible

`instrumentation.ts` wires Next 16's `onRequestError` to a dependency-free
structured logger (`lib/observability/log.ts`). Before it, an unhandled
error in a Server Component, route handler or Server Action went nowhere:
the app's 7 `console.error` calls were all on paths that had already caught
their error. Tracing (`@vercel/otel`) deliberately deferred — nowhere to
send a span until a deploy target exists.

**Redaction is the security half and is tested.** Verified against a running
production server rather than by inspection, which caught two credential
headers no exact-name list would hold: Next's own `x-middleware-set-cookie`
(carries `__Host-csrf`) and `referer` (carries the OAuth `?code=` on
`/auth/callback`). Matching is by substring marker for exactly that reason.

### Testing

- **Five environments**, not one: chromium, webkit, firefox, Mobile Safari,
  Mobile Chrome. The guest path is mostly a *mobile* path and had never been
  tested as one.
- **`tests/e2e/layout-consistency.spec.ts`** asserts design-independent
  invariants at the **real** breakpoint boundaries (520/640/760/850/1100,
  ±1), not round numbers. Currently **red on purpose**: 3 real failures.
- **`tests/e2e/visual.spec.ts`** scaffolded and skipping — baselines are
  deliberately not generated mid-redesign. `npm run test:visual:update`.
- Unit tests 38 → 64.

**Harness traps recorded so they are not rediscovered:** the hero entrance
animation does not run in the MCP browser (`/home-preview` screenshots
blank); forcing opacity is safe but `transform:none` destroys the card fan's
layout; the MCP's `resize_window` does not change `innerWidth`, though
Playwright's `setViewportSize` does — verified, so the 14-width matrix is
real.

### Design — the palette settled at v7 after seven rounds

Owner's six exact hexes: `#051822 #2D383E #7C5841 #AA7452 #969A9E #D4C9C7`.
Three text-capable colours in light (v6 had one), and a real dark end, which
is what makes a dark theme honest rather than invented.

- **§20 italics**, Cormorant. The blocker was **mine**: I committed the
  *Cyrillic* subsets of both faces because Google's css2 endpoint returns
  one `@font-face` per unicode-range and I took `head -1`. That explained
  every symptom — headlines falling back to a sans, and roman and italic
  rendering identically because neither was being used. Frontend was right
  to stop rather than enable on that evidence.
- **§21 rewritten** after the owner rejected position-based fills as
  "forcing the colors". Colour now belongs to a **component**, never an
  instance; the default instrument is brown accent *text*, not fills;
  ceiling is one filled surface per screen.
- **§22 spacing**, from the one fix the owner explicitly approved on sight:
  a container distributes free space through an **alignment property**,
  never by leaving slack where it falls. 0-above/152-below was not a wrong
  value, it was an undecided container. **Not a spacing scale** — 0/152 can
  be built from entirely valid tokens.
- Dark theme **mocked, not built**, at the owner's request.

### Vercel — set up, then parked at the owner's request

Project linked (`safebox/plan-ind`), GitHub connected, 8 env vars set,
**preview deployed and verified** (200, legal pages render real values).
Production never deployed. Owner then said to skip Vercel for now, so it
sits as-is. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_SITE_URL`
remain unset.

### Standing rules added (both owner-driven, both in AGENT_COORDINATION.md)

1. **Keep owner-facing messages short.** Asked twice.
2. **Show, do not tell** — screenshot every visible change and send it.
   Pairs with the first: the image *is* the short version.

### Open, needing the owner

Upload the six photos; add `{{ .Token }}` to the Supabase email template;
decide on the dark theme; go/no-go on the Places ingestion
(`PLACES_INGESTION_SCOPE.md`, 5-8 days, ~$0 at 5000 venues, but review is
the real cost — 3 of 9 photos were rejected at visual review). Turnstile is
deprioritised while Vercel is parked, since the app only requires a captcha
in production.

---

## 2026-09-06 — T1 Security/Backend: state at handoff

Tree clean, everything committed and pushed. The cross-cutting story is T0's
in `AGENT_COORDINATION.md`; this is only what is open on my side.

**Live state:** 035/036/037/038/040/041 applied and verified. **039 held.**
0 of 82 photos live, 40 of 82 coordinates.

**Open — needs the owner, not code:**

1. **Six image files must be uploaded before 039 applies.** They are in
   `scripts/spot-photos/`, named by spot id — the filenames ARE the URLs, so
   they cannot be renamed. `MANIFEST.json` beside them lists each one's
   source, licence and attribution. Nothing in this project can upload them:
   there is deliberately no service-role key, and 038's restrictive policies
   close every client path, so the one credential that can write that bucket
   is one only the owner holds. That is the design working, not a gap.
   Applying 039 before the files land points six cards at 404s, which is
   worse than the nulls they have now — a broken image asserts a photo
   exists where null renders the designed no-photo state.
2. **The four zero-coverage categories.** beach_club, escape, padel and
   wellness have neither coordinates nor photos, and are also the four
   Google Places has no clean type for. Twelve hand-pasted coordinates would
   close the coordinate half; the photo half needs either venue URLs or the
   Places decision.
3. **`PLACES_INGESTION_SCOPE.md` is a decision the owner has not made.** It
   is written to stand alone: verified SKU costs (the batched field-mask
   route makes 5,000 venues **$0**, not the ~$80 first estimated), `place_id`
   as a nullable unique column rather than the primary key, free freshness
   checks, 5–8 days, and the two things deliberately not softened — Google's
   taxonomy misses exactly our weakest four categories, and a **33%
   post-automation photo rejection rate does not survive 1000 venues**
   without review tooling.

**Confirmed cleared:** PhotoTile now renders `PhotoCredit`, and all three
pages that feed a photo surface (`app/page.tsx`, `app/home/page.tsx`,
`app/plan/[id]/page.tsx`) select `photo_attribution`. The licence obligation
is satisfied end to end, so 039's other blocker is gone.

**Still open, not blocking:** `app/home/page.tsx`'s `.limit(120)` is
Frontend's and needs server-side search rather than a bigger limit — the
1000-row cap means raising the number cannot fix it. And the
`word_similarity` pre-filter for place-import is the right next step once
instruments show imports are hot; the reasoning is in `resolve.ts`.

**The one line worth carrying forward:** `lib/supabase/paginate.ts`'s
contract — **`T[]` means complete, null means ask again** — because it names
today's defining bug class in a form the type system can help enforce.

---

---

## Frontend lane (T2) — 2026-09-05/06

Palette v7 and the §21 rewrite, Cormorant and the §20 italics, photo
attribution, the hero deck centring, and the start of the visual QA pass.
Commits `c19753c` (deck centring, now §22) and `2935710` (QA: touch
targets, auth centring, auth focus ring).

**The type size floor is 20px, and the reason is not taste.** Cormorant's
drawn weight is calibrated for display sizes. Between roughly 11px and
16px its thin strokes fall below one device pixel at 1x and the face
renders as a grey smear that reads lighter than the body font next to it —
so a "heavier" heading looked weaker than the paragraph under it. From
about 23-25px up it holds cleanly and the axis behaves. The floor block at
the end of `globals.css` exists to keep small text off that face
entirely; do not lower it to fit a layout, change the layout.
`WeightRise` was narrowed to 300-700 for the same reason: the wider range
spent most of its travel in the region where the strokes disappear.

**A blanket token sweep reaches into the parked night blocks.** Five
palette edits landed inside `[data-theme="night"]` scopes during the v6
work and had to be reverted. §19.2 parks that machinery rather than
deleting it, so those blocks still parse and still match a find-and-replace
on a token name. Any future sweep must scope itself out of the night
scopes explicitly, or it will silently couple a parked block to a live
value and misfire whenever dark is unparked.

**The accent's semantics inverted between v5 and v6 purely from a value
swap.** 31 rules that were measured correct under v5 became failures under
v6 without a single one of them being edited — the token moved across the
large-text/small-text boundary, so every rule that had been legitimately
using the display-size champagne was suddenly using it at caption size.
The lesson is that a palette change is not reviewable from the diff: the
diff shows the token, not the 31 sites whose compliance depended on its
value. Re-measure rendered output after any token value change.

**Three specificity traps in §21.6, none visible in the diff.** Getting
full-strength ink onto the selected state took three attempts: first
softening with opacity, which is the exact mistake the spec names; then a
rule that tied on specificity and lost to source order; then a
`:first-child` kicker that outranked a doubled class. All three looked
correct in the file and were wrong on screen. Verify rendered computed
style, not the rule you just wrote.

**Contrast-auditor traps, all three mine.** `color()` 0-1 channels read as
0-255, alpha ignored so 12% tints read as solid fills, and gradient fills
reporting a transparent `backgroundColor` so the walker looked straight
through the primary button. Each only ever *inflates* the failure count,
so earlier clean results still stand — but a fresh auditor will
re-introduce them.

**`resize_window` in the Chrome MCP does not change layout width.**
`innerWidth` stays 1440 while `outerWidth` follows the window, so the page
never re-lays-out and a width matrix built on it measures one width N
times. Playwright's `setViewportSize` is correct and flips the media
queries exactly at the boundaries (verified by T0). Use Playwright for
width coverage.

**The `demo-` class prefix is a naming legacy, not a demo-only surface.**
I nearly skipped the whole account-tab sweep on the reasoning that
`/home-preview` renders `DemoAccountViews` and is dev-only. The shipping
`AccountViews` uses 43 of the same `demo-*` classes, so every finding on
those tabs is real and ships. Check before concluding a `demo-` class does
not matter — this produced a confidently-wrong "not applicable" that a grep
took ten seconds to disprove. The genuinely demo-only pieces are the
*components* (`DemoAccountViews`, `DemoPlanningTools`), not the classes.

**⚠ CORRECTED 2026-09-07 — the lesson originally recorded here was wrong,
and it was mine.** This paragraph used to read "a fail-closed state that
names a plausible wrong cause is worse than an unstyled one", asserting the
app had misreported why guest voting was unavailable. **It had not.** Tested
directly afterwards: with the auth endpoint blocked, and with all of
Supabase blocked, the share link renders *"This plan wouldn't open. The
connection dropped before the plan loaded."* — never "Guest voting is
paused". The detection is precise: `bootstrapPlanAccess` returns
`anonymous-disabled` only when GoTrue answers with the specific
`anonymous_provider_disabled` code, which a blocked request cannot reach.

So when "Guest voting is paused" appeared, **anonymous sign-ins genuinely
were disabled at that moment** — a standing blocker in the house rules. They
were enabled later. The stale CSP was a real but *separate, concurrent*
problem. **The app told the truth both times; two real faults overlapped.**

What survives, and is still worth knowing: `next.config` builds the CSP's
`connect-src` from `NEXT_PUBLIC_SUPABASE_URL` when the server starts, so a
later `.env.local` edit leaves the header naming a host the app no longer
uses and every client-side Supabase call is blocked before leaving the
browser. Restarting the dev server re-evaluates it. If a data-dependent
finding looks impossible, check the CSP header before believing it.

**The meta-lesson is the more useful one: a plausible moral drawn from an
undiagnosed symptom spreads faster than the symptom.** This one reached the
owner and three lanes before anyone read the code path that would have
disproved it in a minute.

### Open, in the order I would take them

1. **The rest of the QA pass.** The three harness failures are closed
   (verified at a real 390px viewport: `/`, `/privacy` and `/terms` report
   nothing under 44px; auth shell 40/40 at 1440 and 0/0 at 390; auth input
   focus reports `2px solid #051822` at `-2px`, no shadow). The §22 sweep
   has covered `/`, `/login`, `/onboarding`, `/privacy`. Still unswept: the
   vote screen, the account tabs, `/place/[id]`. The sweep script shape is
   in the commit history — containers with an imposed height where the
   slack lands >24px to one side, filtering out those that already declare
   an alignment (`justify-content: flex-end` on `.wall-tile__body` and the
   absolutely-positioned card faces are deliberate, not findings).

2. **`min-h-[440px]` versus the 29rem/27rem stage.** The card floor is
   fixed at every width while the stage drops to 464px and 432px on small
   screens, so the deck bleeds past the stage there. The centring splits
   that bleed evenly instead of dumping it at the bottom, which is why it
   is not urgent, but it is the same §22 shape: a floor and a container
   height that disagree with nobody deciding. Fix the two to agree.

3. **`app/home/page.tsx` needs server-side search.** PostgREST silently
   caps reads at 1000 rows, so removing `.limit(120)` does not fix it and
   will read as fixed while still truncating. The catalogue query has to
   filter on the server.

4. **Mobile E2E specs.** Guest-vote coverage at mobile widths, the vote
   screen on WebKit, and touch targets at real mobile viewports. Open
   question I could not resolve: whether guest-vote can be made safe to
   run without writing to the live database. `RUN_E2E` stays off in CI
   until that is answered — it is gated on exactly this.

5. **Visual-regression baselines** (`npm run test:visual:update`) once the
   passes above have landed. Generating them earlier just bakes in the
   layouts still being changed.

---
