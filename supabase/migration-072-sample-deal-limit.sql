-- Migration 072: a rate limit for the signed-out sample deal (roadmap P8).
-- STAGED -- written, not applied anywhere. consume_otp_limit (latest body,
-- 026, copied verbatim, edited where marked 072) gains a 'deal-preview'
-- scope: a subject-keyed limit that needs no session, which is what a
-- visitor previewing a deal before signing up has. Same secret gate; grants
-- restated in full.

create or replace function consume_otp_limit(p_secret text, p_scope text, p_subject text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  current_count integer;
  minute_limit integer;
  day_limit integer;
  subject_key text := left(p_subject, 128);
begin
  if not valid_control_secret(p_secret) or p_scope not in ('otp-request', 'otp-verify', 'deal-preview')
     or subject_key is null or subject_key = '' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  -- otp-request: 3/minute, 10/day. A genuine user requests a code once or
  -- twice per sign-in (typo, resend); generous enough that a real resend
  -- never 429s.
  -- otp-verify: 8/minute, 20/day. Generous enough to absorb a few mistyped
  -- digits in one sitting, tight enough that 20 total guesses/day against
  -- one email is a ~0.002% chance of hitting a specific 6-digit code — the
  -- limit does the real work here, not the burst allowance.
  -- 072: deal-preview, 30/minute, 300/day per hashed client IP: the
  -- signed-out sample deal (the visitor has no account yet). It reads the
  -- cached catalogue and writes nothing, so the cap only stops a scripted flood.
  minute_limit := case p_scope when 'otp-request' then 3 when 'deal-preview' then 30 else 8 end;
  day_limit := case p_scope when 'otp-request' then 10 when 'deal-preview' then 300 else 20 end;
  insert into app_rate_limits values(p_scope||'-minute', subject_key, minute_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > minute_limit then return false; end if;
  insert into app_rate_limits values(p_scope||'-day', subject_key, day_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > day_limit then return false; end if;
  return true;
end; $$;
revoke all on function consume_otp_limit(text,text,text) from public, anon, authenticated;
grant execute on function consume_otp_limit(text,text,text) to anon, authenticated;
