-- Migration 066: the server-control secret check no longer has to run bcrypt.
-- STAGED -- written, not applied anywhere. Owner-approved to build 2026-09-26;
-- the live apply and the row switch below are the owner's call. Security
-- review 2026-09-26: sound, with the fixes folded in here.
--
-- Why: valid_control_secret() runs on every quota-gated request
-- (consume_app_quota, record_security_event's guard, consume_otp_limit). It
-- compared with crypt() against a bcrypt hash: 2.7ms of DB CPU per call in
-- SQL, 15-22ms under a 100-200 request burst (scripts/load/README.md,
-- 2026-09-26). bcrypt's slowness defends a guessable password; this secret is
-- 32+ random bytes, so a sha256 digest is just as unguessable.
--
-- Backward compatible:
--   * a stored hash starting with '$2' is still checked with crypt() (bcrypt),
--     so applying this changes nothing until the row changes;
--   * anything else is compared with the lowercase hex sha256 of the secret;
--     any other format never matches, so the check fails closed;
--   * an empty, null or over-256-character secret never verifies, whatever
--     the row holds. An unset env var hashed by mistake is sha256(''), and
--     that must not turn '' into a valid secret for the anon-callable
--     record_security_event / consume_otp_limit.
--
-- ORDER IS ONE-WAY: this migration goes live BEFORE the row switch (a sha256
-- row against the old function fails closed: every quota-gated request 503s).
-- Rollback is restoring the saved row, never reverting the function.
--
-- Switching the live row (no secret or hash is in this file):
--   (a) save the current row:
--         select secret_hash from app_control_secrets where name = 'server-control';
--   (b) compute the digest off the database; this throws if the var is unset:
--         node --env-file=.env.local -e "process.stdout.write(require('crypto').createHash('sha256').update(process.env.SECURITY_CONTROL_SECRET).digest('hex'))"
--   (c) guarded update, which refuses a malformed digest or the empty-string one:
--         update app_control_secrets set secret_hash = '<hex>'
--         where name = 'server-control' and '<hex>' ~ '^[0-9a-f]{64}$'
--           and '<hex>' <> 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
--       expect UPDATE 1;
--   (d) at once, request an OTP or deal places, and watch the logs for
--       SECURITY CONTROL MISCONFIGURED. If it appears, restore the row saved in (a).
--
-- For the security review: record_security_event and consume_otp_limit are
-- executable by anon and pass a caller-chosen p_secret here, so an online
-- guessing oracle already exists and always has. What stops it is entropy,
-- not bcrypt's speed: 32+ random bytes (docs/SECURITY_SETUP.md), so faster
-- guesses still never land. That only holds if the live secret really was
-- generated that way -- confirm before switching the row. Side effect: an
-- anon caller can no longer spend ~3-6ms of DB CPU per call through those
-- two functions. Comparing digests with `=` is not constant-time; a matching
-- digest prefix does not help find a preimage.
--
-- `create or replace` with the same signature keeps the ACL; the revoke is
-- repeated because a later drop + create would re-grant anon/authenticated
-- (migrations 021/024).

create or replace function valid_control_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(p_secret, '') <> '' and length(p_secret) <= 256
    and exists(select 1 from app_control_secrets
      where name = 'server-control' and case
        when secret_hash like '$2%' then secret_hash = crypt(p_secret, secret_hash)
        else secret_hash = encode(digest(p_secret, 'sha256'), 'hex')
      end)
$$;
revoke all on function valid_control_secret(text) from public, anon, authenticated;

-- Defence in depth: RLS with zero policies already hides the row from client
-- roles; this removes the table privileges too.
revoke all on app_control_secrets from anon, authenticated;
