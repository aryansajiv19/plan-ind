-- Migration 066: the server-control secret check no longer has to run bcrypt.
-- STAGED -- written, not applied anywhere. Owner-approved to build 2026-09-26;
-- the live apply and the row switch below are the owner's call.
--
-- Why: valid_control_secret() runs on every quota-gated request
-- (consume_app_quota, record_security_event's guard, consume_otp_limit). It
-- compared with crypt() against a bcrypt hash: 6.4ms of DB CPU uncontended,
-- ~20ms under a 100-200 request burst, and ~93% of /api/spots/deal's DB time
-- (scripts/load/README.md, 2026-09-26). bcrypt's slowness defends a guessable
-- password; this secret is 256 random bits, so a sha256 digest is just as
-- unguessable and costs microseconds.
--
-- Backward compatible, so the switch is one row and reversible:
--   * a stored hash starting with '$2' is still checked with crypt() (bcrypt),
--     so applying this changes nothing until the row changes;
--   * anything else is compared with the lowercase hex sha256 of the secret.
--     Any other format never matches: the check fails closed.
-- This file holds no secret and no hash. To switch live, compute the digest
-- off the database so the secret never lands in SQL history:
--   printf %s "$SECURITY_CONTROL_SECRET" | shasum -a 256
--   update app_control_secrets set secret_hash = '<that hex>' where name = 'server-control';
-- To revert: set the row back to a bcrypt hash (the previous value, or
-- crypt('<secret>', gen_salt('bf'))).
--
-- For the security review: record_security_event and consume_otp_limit are
-- executable by anon and pass a caller-chosen p_secret here, so an online
-- guessing oracle already exists and always has. What stops it is entropy,
-- not bcrypt's speed: at least 32 random bytes (docs/SECURITY_SETUP.md), so
-- guesses faster by any factor still never land. That only holds if the live
-- secret really was generated that way -- confirm before switching the row.
-- Side effect: an anon caller can no longer spend ~6ms of DB CPU per call
-- through those two functions. Comparing digests with `=` is not
-- constant-time; a matching digest prefix does not help find a preimage.
--
-- `create or replace` with the same signature keeps the ACL; the revoke is
-- repeated because a later drop + create would re-grant anon/authenticated
-- (migrations 021/024).

create or replace function valid_control_secret(p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select exists(select 1 from app_control_secrets
    where name = 'server-control' and case
      when secret_hash like '$2%' then secret_hash = crypt(p_secret, secret_hash)
      else secret_hash = encode(digest(p_secret, 'sha256'), 'hex')
    end)
$$;
revoke all on function valid_control_secret(text) from public, anon, authenticated;
