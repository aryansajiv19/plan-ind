# Deployment readiness

Owned by T0. What's actually needed to put this live, and what's genuinely
blocking it right now.

## What's already true

- CI is green on every push: lint, typecheck, 29 hermetic tests, schema-drift
  check, production build. `test-db` and `test-e2e` jobs exist (the latter off
  by default, see below).
- `npm run build` (production mode) passes clean.
- Migrations 021-029 are live on the Supabase project. Anonymous sign-ins are
  enabled. The core loop (host a plan, guest votes via share link) is verified
  working end to end.
- Security headers, HSTS, CSRF, rate limiting, RLS are all in place — see
  `PRODUCTION_CHECKLISTS.md` for the full triage.

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
  site/secret key pair exists. Anon sign-ins are currently open with no bot
  protection. Owner action: create the widget at the production hostname.
- **`test:e2e` CI job is off by default** (`vars.RUN_E2E`) because
  `guest-vote.spec.ts` votes on the live shared seed plan on every run —
  needs an explicit opt-in once there's a domain to test against.
- Load testing has only measured the unauthenticated front door
  (`scripts/load/README.md`). Authenticated/mutating paths are Security's
  current task, not done yet.
- `PRODUCTION_CHECKLISTS.md`'s open security items (CORS verification, cookie
  flags, a git-secrets scan, `npm audit` as a CI gate, trimming broad
  `select("*")` reads) — none are deploy-blocking, all worth closing before
  calling this done.

## Sequencing question for the owner

Venue-link enrichment (the paste-a-link feature) has **not been started** —
it's queued behind Security's current load-test work, which was already in
flight when that priority landed. Given "deploy soon": ship the core loop now
and add venue-link as a fast-follow, or hold the deploy until it's in? Real
tradeoff, not a call to make silently.
