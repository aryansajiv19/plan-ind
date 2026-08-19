# Production security setup

The application changes are committed in code, but the database and identity-provider controls below must also be enabled in the hosted services before deployment.

## 1. Apply the database boundary

Run `supabase/migration-020-production-security.sql` in the Supabase SQL editor after migration 019. Do not run `schema.sql` against a live project; it is destructive and exists only for empty scratch databases.

Generate a random value of at least 32 bytes, set it as the Vercel `SECURITY_CONTROL_SECRET`, then store only its bcrypt hash in Supabase:

```sql
insert into public.app_control_secrets(name, secret_hash)
values ('server-control', extensions.crypt('PASTE_THE_SECRET_HERE', extensions.gen_salt('bf')))
on conflict (name) do update set secret_hash = excluded.secret_hash;
```

Schedule the following once per day with Supabase Cron:

```sql
select cron.schedule(
  'purge-security-operational-data',
  '17 2 * * *',
  'select public.purge_security_operational_data()'
);
```

The migration removes anonymous table reads, requires plan membership, makes plan creation transactional, scopes social records, restricts upload MIME types and size, and adds durable per-user and global quotas plus minimized security events.

## 2. Configure Supabase Auth

- Enable anonymous sign-ins. Shared links redeem an anonymous session into membership for that one plan.
- Enable Cloudflare Turnstile CAPTCHA and paste its secret key into Supabase Auth CAPTCHA settings.
- Set OTP expiry to 10 minutes or less and keep one-time-token reuse protection enabled.
- Allow only the production origin and the exact OAuth callback URL. Remove stale preview and localhost URLs from the production project.
- Use the publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never expose a service-role or secret key to the browser.

This app is passwordless, so password reset endpoints, password hashing, password lockout, and session revocation after password changes do not exist in its authentication surface. Supabase owns OTP token hashing and session rotation.

## 3. Configure Vercel

Set every variable documented in `.env.local.example`, including the three legal identity fields. Production builds deliberately fail when legal identity is missing. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin.

Add the Cloudflare Turnstile site key as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Keep `OPENAI_API_KEY`, `SECURITY_CONTROL_SECRET`, and any future payment secrets server-only. Do not prefix them with `NEXT_PUBLIC_`.

## 4. Operational checks

- Run `npm audit`, `npm run lint`, `npx tsc --noEmit`, `npm run test:security`, and `npm run build` before release.
- Run `npm run test:smoke` against the deployed preview after applying the migration.
- Review `security_events` for blocked authorization, CAPTCHA, OTP, rate-limit, and AI-quota activity. Do not log raw emails, tokens, prompts, cookies, or API keys.
- If payments are added later, calculate products and prices from server-owned records and verify the provider signature against the raw webhook body before changing order state. There is currently no payment or webhook surface to secure.
