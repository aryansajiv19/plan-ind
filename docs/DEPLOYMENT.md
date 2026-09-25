# Deployment

**Read when:** deploying, changing environment variables, or debugging
something that works locally and not on the live URL.

**Live in production since 2026-09-18: https://plan-ind.vercel.app**

Vercel project `safebox/plan-ind` (`prj_ueymNv8KYRFkb6HZIl8NqkBlOjrP`), GitHub
repo connected, so a push produces a preview deployment. Production was
promoted from the CLI: `vercel --prod --yes --scope safebox`.

The **deployment URL** (`plan-*-safebox.vercel.app`) 302s — deployment
protection is on for those. The **production alias** is public and deliberately
so; the owner puts it on a CV.

## The two owner-only steps that are still open

Nothing in the repo can do either of these, and the first one gates sign-in.

1. **Turnstile hostname list** — add `plan-ind.vercel.app` at
   dash.cloudflare.com → Turnstile → the widget → Hostnames. Keep `localhost`.
   Cloudflare applies it instantly; no rebuild. A preview URL needs its own
   entry, and previews have **two** hostnames (the deployment URL and the
   branch alias) — list both or auth silently fails on one of them.
2. **Turnstile secret key into Supabase** → Authentication → Attack Protection →
   CAPTCHA, provider Turnstile. The app never verifies the token itself; it
   hands it to Supabase, so the secret belongs there and **nowhere else** —
   never in Vercel, never in this repo.

Until both are done, **production email sign-in cannot start at all** — the
email-code form demands the token before it requests a code
(`components/AuthForm.tsx`, `app/auth/actions.ts`), and since 2026-09-25 every
plan voter signs in. Google OAuth is unaffected. This is a hard wall, not a hardening nicety.

## Environment variables

Ten, all set in production. The interesting ones:

| Variable | Note |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public by design, and **inlined at build time**. Setting it in the dashboard does nothing until the next build. Verify it the only way that means anything: grep the built login chunk under `/_next/static/chunks/app/login/`. Present there as of the 2026-09-18 build. |
| `NEXT_PUBLIC_SITE_URL` | Drives OAuth/email redirect construction and CSP `allowedOrigins`. |
| `SECURITY_CONTROL_SECRET` | Must stay the **exact value** already hashed into `app_control_secrets` live. Copy from `.env.local`; regenerating it breaks the control endpoints. |
| `LEGAL_OPERATOR_NAME` / `LEGAL_CONTACT_EMAIL` / `LEGAL_JURISDICTION` | `Aryan Sajiv` / `aryansajiv2@gmail.com` / `Dubai, United Arab Emirates`. The production build **deliberately fails** without them rather than publish placeholder legal pages. |

There is **no service-role key**, and none may be added. If one ever is, it is
server-only.

## Verifying a deploy

On the deployed URL, never locally — that is the whole point.

```
for p in / /demo /login /privacy /terms /api/health; do
  curl -s -o /dev/null -w "%{http_code} $p\n" https://plan-ind.vercel.app$p
done
curl -s https://plan-ind.vercel.app/api/health   # {"status":"ok"} is a real DB read
```

All six return 200 as of 2026-09-18. What that does **not** cover, and what is
still unproven in production: sign-in, a guest vote through a share link, and
one plan decided. Those need the Turnstile steps above first.

## Also still open

- **Supabase redirect allow-list** must contain every hostname you expect to
  sign in from, or auth substitutes its own site URL — the same mechanism as the
  old `:3000` bug.
- **The email template must send a six-digit code**, not a magic link. The UI
  promises a code; a mismatch breaks sign-up for every new user.
- **`test:e2e` is off in CI** (`vars.RUN_E2E`) because `guest-vote.spec.ts`
  votes on the live shared seed plan every run. Now that a real URL exists this
  is worth wiring to a throwaway plan and turning on.
- **Every load number this project has is loopback-local**, against a local
  Docker stack — a ceiling for that environment, not a field number. The front
  door managed 857.5 req/s and `/api/spots/deal` hit a real wall near n=100,
  which a paired benchmark showed is one `next start` process saturating, not
  the round trips behind it. Vercel already provides the horizontal scaling that
  answers it. One real pass against the deployment is worth doing; it was never
  deploy-blocking.
