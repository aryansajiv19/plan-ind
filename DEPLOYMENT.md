# Deployment readiness

**Refreshed 2026-09-06.** Vercel is now set up and then deliberately parked
— read this section before assuming anything below it is still current.

## Current state (2026-09-06)

- **Vercel project exists and is linked**: `safebox/plan-ind`
  (`projectId prj_ueymNv8KYRFkb6HZIl8NqkBlOjrP`). The GitHub repo is
  connected, so pushes produce preview deployments automatically.
- **A preview deployment was made and verified**:
  `https://plan-mxeh0gisw-safebox.vercel.app` — front door 200, and the
  legal pages render the owner's real entity/contact/jurisdiction rather
  than placeholders. **Production has never been deployed.**
- **Owner then said to skip Vercel for now**, so this is parked as-is. Do
  not deploy, promote, or change project settings without them asking again.
- **8 of 10 environment variables are set** across production/preview/
  development: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SECURITY_CONTROL_SECRET` (copied from `.env.local`, **not** regenerated),
  `OPENAI_API_KEY`, `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`,
  `LEGAL_JURISDICTION`.
- **Still unset**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (no widget created) and
  `NEXT_PUBLIC_SITE_URL` (needs a settled domain).
- **Turnstile is deprioritised while Vercel is parked.** The app requires a
  captcha only when `NODE_ENV === "production"`, so it blocks nothing
  locally. It remains a hard wall for a real production launch: without a
  key, email login and guest voting both fail before they start.

## Migrations — all applied except one

021-038, 040 and 041 are live and verified by catalog query. **039 is held**
because the `spot-photos` bucket is empty; see `worklog.md` 2026-09-06.

---

## What's already true

- CI is green on every push: lint, typecheck, **38 hermetic tests**, schema-
  drift check, production build. `test-db` and `test-e2e` jobs exist (the
  latter off by default, see below).
- `npm run build` (production mode) passes clean.
- **Migrations 021 through 034 are live** on the Supabase project (035, the
  carpool-coordination fields, is written/gated/security-reviewed and staged
  — needs the owner's approval like every migration, not applied yet).
  Anonymous sign-ins are enabled. The core loop (host a plan, guest votes via
  share link, direct-plan skip-the-vote) is verified working end to end
  against real sessions, not just fixtures.
- Security headers, HSTS, CSRF, rate limiting, RLS are all in place. A
  git-secrets scan (`gitleaks`, full history) came back clean. See
  `PRODUCTION_CHECKLISTS.md` for the full triage — most of its "genuinely
  open" list is in progress or closed as of today, check there for current
  state rather than this file.
- **Load testing is done, not partial.** Unauthenticated front door: 857.5
  req/s, zero errors (`scripts/load/README.md`). Authenticated/mutating
  paths, against a local Supabase stack with 2,500 real permanent accounts
  minted (the live project's signup rate limit caps real testing around
  n≈15-30, so this used a local stack instead, explicitly caveated as
  loopback-local, not a field number): votes/RSVPs/ratings clean through
  n≈200; `/api/spots/deal` hits a real ceiling around n=100. **Corrected
  2026-09-05:** this file previously blamed that ceiling on "five to six
  sequential Supabase round trips per request." A proper paired benchmark
  (both builds running at once on separate ports, alternating reps, warm-up
  discarded — `scripts/load/README.md`) disproved it. Removing one of those
  round trips is worth ~5ms uncontended and nothing at all at n=50/n=100.
  The wall is one `next start` process saturating, not the round trips
  behind it: firing two queries together shortens a request without
  widening the pipe. It's a horizontal-scaling lever, which a real
  deployment already provides — not deploy-blocking. One genuine
  correctness bug (not a perf finding) surfaced by this testing and already
  fixed — migration 033.
- Venue-link enrichment (paste a link → get the venue) is **built**, not
  queued — the result/candidate-picker UI and the "getting there" distance +
  transit-deep-link feature both shipped today. The sequencing question this
  file used to ask (ship core loop now vs. wait for venue-link) is moot; both
  are here.

## What's genuinely blocking a real deploy

**A Vercel project connected to this repo, owned by the owner's account.**
This is not something I can do from here — it needs either the owner logging
into vercel.com and importing the GitHub repo (the standard path, a few
clicks), or the owner running `vercel login` interactively in a terminal and
handing me a connected project to work with. I can prepare everything up to
that point; I can't create or own the account-level resource.

## Environment variables the Vercel project needs

From `.env.local.example`, all required in production:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → Data API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project settings → API keys |
| `NEXT_PUBLIC_SITE_URL` | The real production URL once Vercel assigns/you set a domain — used for OAuth/email redirect construction and CSP `allowedOrigins` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile widget for the production hostname — **not created yet**, see below |
| `SECURITY_CONTROL_SECRET` | Must be the **exact same value** already hashed into `app_control_secrets` in the live Supabase project — copy from local `.env.local`, do not regenerate |
| `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_JURISDICTION` | Real values — the production build **deliberately fails** without them rather than publish fake legal pages. Need the owner's actual entity/contact info. |

## Other real gaps before this is production-solid, not just building

- **Turnstile CAPTCHA is not enabled anywhere yet** — no widget created, no
  site/secret key pair exists. Confirmed by security review 2026-09-04: this
  isn't "soft" — without a key, **production email login and guest voting
  both fail to start at all** (`bootstrapPlanAccess` requires the token
  before it will even attempt a session). Google OAuth is unaffected. Owner
  action: create the widget at the production hostname.
- **`test:e2e` CI job is off by default** (`vars.RUN_E2E`) because
  `guest-vote.spec.ts` votes on the live shared seed plan on every run —
  needs an explicit opt-in once there's a domain to test against.
- Real network/production-deployment load numbers don't exist yet — every
  load-test number above is loopback/local-Docker, a ceiling for that
  environment, not a field number. Worth one real pass against the actual
  Vercel deployment once it exists, not before.
- `PRODUCTION_CHECKLISTS.md`'s remaining open security items (CORS
  verification, cookie flags, `npm audit` as a CI gate, trimming broad
  `select("*")` reads, account-lockout confirmation) — in progress as of
  2026-09-04, none deploy-blocking, worth closing before calling this done.
- Migration 035 (carpool coordination) is staged, gated, security-reviewed,
  and needs the owner's apply-approval — same as every migration, no
  exceptions, regardless of how ready it looks.
