-- Close the unauthenticated control-secret oracle. Apply after migration 020.
--
-- Migration 020 wrote `revoke all on function ... from public` for several
-- SECURITY DEFINER functions. That is a no-op for `anon` and `authenticated`:
-- Supabase's default privileges grant EXECUTE to those roles BY NAME, and
-- revoking from PUBLIC does not cancel a named grant. Line 418 of 020 got it
-- right (`from public, anon, authenticated`) and is demonstrably enforced.
--
-- The live defect: valid_control_secret(text) was callable with only the
-- publishable key and no session, and it RETURNS a boolean instead of raising.
-- That is an unauthenticated, unmetered oracle for confirming a guessed
-- server-control secret -- the secret that gates consume_app_quota and
-- record_security_event.
--
-- The other functions below already fail safe (their bodies check auth.uid()
-- or the control secret first and raise), so this is defence in depth for
-- them: make the grant match the intent instead of relying on the body.
--
-- Additive, non-destructive, re-runnable. Touches privileges only -- no table,
-- column, policy, or row is created, altered, or dropped. REVOKE of a
-- privilege that is already absent is a no-op, so running this twice is safe.
--
-- Note for future migrations: `create or replace function` PRESERVES the ACL,
-- so these revokes survive a body change. A `drop function` + `create` does
-- NOT -- default privileges re-grant anon/authenticated -- so any migration
-- that drops and recreates one of these must re-run the matching revoke.

-- ── The actual fix ────────────────────────────────────────────────
-- valid_control_secret: nothing client-side has any reason to call this. It is
-- only ever invoked from INSIDE consume_app_quota / record_security_event,
-- which are SECURITY DEFINER and owned by postgres; the owner keeps EXECUTE
-- regardless of what is revoked from public/anon/authenticated, so those
-- nested calls are unaffected.
-- After this: no client role can call it. Only the function owner (and
-- SECURITY DEFINER functions running as the owner) can.
revoke all on function valid_control_secret(text) from public, anon, authenticated;

-- ── Hardening: grants that should have been anon-free already ─────
-- The app talks to Postgres with the publishable (anon) key PLUS a user
-- session, so its effective role for every call below is `authenticated`,
-- not `anon` and not a service role (this project has no service-role key).
-- Anonymous Supabase sign-ins also carry role `authenticated`. So revoking
-- `anon` cannot break a signed-in caller.

-- create_secure_plan: only caller is POST /api/plans, which returns 401 unless
-- there is a non-anonymous user, and the body re-checks
-- `auth.uid() is null or is_anonymous` first. Role: authenticated.
-- After this: only signed-in sessions may call it; anon gets 42501 from the
-- grant instead of from inside the body.
revoke all on function create_secure_plan(jsonb, uuid[]) from public, anon;
grant execute on function create_secure_plan(jsonb, uuid[]) to authenticated;

-- claim_plan_access: called from the /plan/[id] server component to redeem a
-- share link into a membership. Requires auth.uid(); anonymous guests are
-- allowed here on purpose and they too are role `authenticated`.
-- After this: only sessions (permanent or anonymous) may redeem a share link.
revoke all on function claim_plan_access(uuid) from public, anon;
grant execute on function claim_plan_access(uuid) to authenticated;

-- consume_app_quota: called from /api/plans, /api/place-import and
-- /api/smart-search, all three only after a user check, and the body raises
-- when auth.uid() is null. Quota is keyed on uid::text, so an anon call could
-- never have been meaningful. Role: authenticated.
-- After this: only signed-in sessions may spend quota.
revoke all on function consume_app_quota(text, text) from public, anon;
grant execute on function consume_app_quota(text, text) to authenticated;

-- execute_plan_command: 019 granted this to anon. Its only caller is
-- POST /api/plans/[id]/command, which returns 401 without a user. It raises
-- (never returns a boolean) on a bad host token, so it is not an oracle, but
-- the anon grant lets someone holding a leaked host token bypass that route's
-- session check entirely.
-- After this: a host command requires a session AND the 256-bit host token.
revoke all on function execute_plan_command(uuid, text, text, jsonb) from public, anon;
grant execute on function execute_plan_command(uuid, text, text, jsonb) to authenticated;

-- ── Deliberately NOT revoked from anon ────────────────────────────
-- record_security_event MUST stay callable by `anon`. The OTP request and
-- verify server actions (app/auth/actions.ts) log otp_request / otp_verify
-- BEFORE a session exists, so their role is genuinely `anon`. Revoking it
-- would silently drop exactly the auth telemetry that matters most. It is
-- safe to leave open: it returns void, and it raises 42501 without the
-- control secret, so it discloses nothing to a caller who does not already
-- hold the secret. Restated here so the grant is intentional, not inherited.
revoke all on function record_security_event(text, text, text, text, text, jsonb) from public;
grant execute on function record_security_event(text, text, text, text, text, jsonb) to anon, authenticated;

-- ── Verification (returns one row per function; run after applying) ─
-- Expect anon=false everywhere except record_security_event, and
-- authenticated=false only for valid_control_secret.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as function,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('valid_control_secret','create_secure_plan','claim_plan_access',
                    'consume_app_quota','record_security_event','execute_plan_command',
                    'purge_security_operational_data')
order by 1;
