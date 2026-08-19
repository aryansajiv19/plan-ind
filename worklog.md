# Deal three worklog

Last updated: 2026-08-19 (Asia/Dubai)

## Migration runbook

The single source of truth for what is applied where. Update the status column
the same day you run something — prose scattered through checkpoints stopped
being trustworthy at 014.

Apply in order. Every migration is additive and re-run safe unless noted.

| # | File | Applied to live project |
|---|------|-------------------------|
| 002 | `migration-002-lastmile-categories.sql` | yes |
| 003 | `migration-003-ratings.sql` | yes |
| 004 | `migration-004-swap.sql` | yes |
| 005 | `migration-005-social.sql` | yes |
| 006 | `migration-006-social-hardening.sql` | yes |
| 007 | `migration-007-auth.sql` | yes |
| 008 | `migration-008-expanded-dubai-categories.sql` | yes |
| 009 | `migration-009-pools-custom-spots.sql` | yes — verified live 2026-08-10 |
| 010 | `migration-010-recommendations-collections.sql` | yes |
| 011 | `migration-011-smart-search.sql` | yes |
| 012 | `migration-012-place-link-imports.sql` | yes |
| 013 | `migration-013-age-safe-venues.sql` | yes — 2026-08-09 |
| 014 | `migration-014-secure-plan-creation.sql` | yes — 2026-08-09 |
| 015 | `migration-015-host-plan-commands.sql` | yes — verified live 2026-08-10 |
| 016 | `migration-016-rsvp-choices.sql` | yes — verified live 2026-08-10 |
| 017 | `migration-017-participant-token-seam.sql` | yes — verified live 2026-08-10 |
| 018 | `migration-018-participant-write-rpcs.sql` | yes — verified live 2026-08-10 |
| 019 | `migration-019-secret-isolation-and-rpc-integrity.sql` | yes — verified live 2026-08-10 |
| 020 | `migration-020-production-security.sql` | **no — implemented locally, pending live apply** |

`npm run test:smoke` asserts the 019 guards against the live project. All ten
database guards pass as of 2026-08-10: the plans projection carries no host
token, forged host-token and member_ages writes are refused, and every
participant RPC rejects foreign spots, dead rounds, empty names and premature
ratings.

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
