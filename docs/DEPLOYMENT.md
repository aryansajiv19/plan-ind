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

## Go-live checklist (when the owner says "go live")

Order matters: the old client in production mints guest sessions, so anything
that refuses guests must land in the same step as the new client.

1. **Pre-flight.** `main` green in CI; the migration batch reviewed by
   `security`; Google provider enabled in Supabase Auth (owner); redirect
   allow-list contains `https://plan-ind.vercel.app/**`; the email template
   sends a six-digit code. Turnstile hostname: done 2026-09-20.
2. **Database.** Apply 064, then 067, then 068, then 069, then 070 through the Supabase MCP, one at
   a time, each verified by the catalog probe in its ledger row (`worklog.md`).
   Before 068, run its header precheck and confirm
   `has_table_privilege('postgres','storage.objects','TRIGGER')` is true.
3. **Deploy `main`.** Remove the `"main": false` line from `vercel.json`,
   commit and push, then from a clean checkout of `main` run
   `vercel --prod --yes --scope safebox` (the CLI deploys the working
   directory, not a branch).
4. **Auth settings (owner, dashboard).** Turn **off** anonymous sign-ins, then
   put the Turnstile secret in Authentication → Attack Protection → CAPTCHA.
   Never before step 3: the old client sends no captcha token for guests.
5. **Verify on the live URL**, never locally: the curl loop below, then sign up
   with an email code, create a plan, open the share link as a second account,
   vote, decide. Check that an under-age account is refused with its message.
6. **Optional:** migration 066 and its row switch, following the runbook in the
   file.

Rollback: fix forward. Promoting the previous deployment after 064 would leave
its guest share links refused, so a revert means reverting 064 as well.

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

All six return 200 as of 2026-09-18. What that does **not** cover: sign-in,
joining through a share link, a vote and a decision. Step 5 of the go-live
checklist covers them.

## Notes

- **`test:e2e` runs in CI** against a throwaway local stack the job starts;
  it never touches the deployment.
- **Every load number this project has is loopback-local**, against a local
  Docker stack — a ceiling for that environment, not a field number. The front
  door managed 857.5 req/s and `/api/spots/deal` hit a real wall near n=100,
  which a paired benchmark showed is one `next start` process saturating, not
  the round trips behind it. Vercel already provides the horizontal scaling that
  answers it. One real pass against the deployment is worth doing; it was never
  deploy-blocking.
