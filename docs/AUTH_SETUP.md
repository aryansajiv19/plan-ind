# Supabase Auth Setup

The repository-side authentication implementation is complete. Finish these steps in the same Supabase project used by `.env.local`.

## 1. Apply the database migration

Run `supabase/migration-007-auth.sql` in the Supabase SQL Editor after migrations 005 and 006.

This migration:

- links `people.auth_user_id` to `auth.users.id`;
- creates authenticated profiles safely;
- limits profile, friendship, visit, and companion mutations to their owner;
- preserves public profile reads and the existing public shared-plan flow.

Do not use a public legacy profile UUID as proof of ownership. The app copies the cached display name/avatar into a new authenticated profile but deliberately does not claim the old public identity or its history.

## 2. Configure email one-time codes

In **Authentication → Providers → Email**, keep email sign-in enabled.

In **Authentication → Email Templates**, make the sign-up confirmation and magic-link templates show the six-digit token using `{{ .Token }}`. The login UI accepts that six-digit code. A template that still uses `{{ .ConfirmationURL }}` will send a clickable link instead; the `/auth/callback` route supports that flow too.

## 3. Configure Google

In **Authentication → Providers → Google**:

1. Enable Google.
2. Add the Google OAuth client ID and secret.
3. In Google Cloud, use the Supabase callback URL shown by the Google provider settings as an authorized redirect URI.

No Google secret belongs in this repository or in a `NEXT_PUBLIC_` variable.

## 4. Allow application redirects

In **Authentication → URL Configuration**, add the application callback URLs that will be used:

- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback` (the current live-preview port)
- `https://YOUR-PRODUCTION-DOMAIN/auth/callback`

Set the production Site URL to the real deployed origin.

## 5. Environment variables

Use the shape documented in `.env.local.example`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=https://YOUR-PRODUCTION-DOMAIN
```

The app temporarily accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` for compatibility with the existing local environment. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for normal local development, or change it to port 3001 if that is the port being used.

## Route behavior

- `/` redirects to `/login` or `/home` based on the verified session.
- `/login` supports Google and email OTP.
- `/auth/callback` exchanges OAuth/magic-link codes for a cookie session.
- `/home` performs a secure server-side user check.
- `/plan/[id]` remains public so shared voting links continue to work.
