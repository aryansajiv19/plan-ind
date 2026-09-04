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

