-- Migration 077: Google venue photos for signed-out visitors (owner: "pics
-- everywhere"). STAGED -- written, not applied anywhere. Applies after 063
-- (the place-photo quota and its global counter) and 072.
--
-- GET /api/spots/{id}/photo refused anyone without a permanent account.
-- consume_otp_limit (latest body, 072, copied verbatim, edited where marked
-- 077) gains 'place-photo-anon': a per-hashed-IP limit that needs no session,
-- as 072's sample deal does, which also counts against 063's global daily
-- photo counter. Cost stays bounded by the same 300/day ceiling; visitors
-- stop at 200 of it. Nothing about photos is stored: the route returns a
-- short-lived Google URL, never bytes, and only the browser caches it.

begin;

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
  if not valid_control_secret(p_secret) or p_scope not in ('otp-request', 'otp-verify', 'deal-preview', 'place-photo-anon')
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
  -- 077: place-photo-anon, 40/minute, 120/day per hashed client IP: a
  -- signed-out visitor's page asks for up to ~20 venue photos at once, and
  -- the browser keeps each answer an hour.
  minute_limit := case p_scope when 'otp-request' then 3 when 'deal-preview' then 30
    when 'place-photo-anon' then 40 else 8 end;
  day_limit := case p_scope when 'otp-request' then 10 when 'deal-preview' then 300
    when 'place-photo-anon' then 120 else 20 end;
  insert into app_rate_limits values(p_scope||'-minute', subject_key, minute_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > minute_limit then return false; end if;
  insert into app_rate_limits values(p_scope||'-day', subject_key, day_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > day_limit then return false; end if;
  -- 077: every photo draws on the one global daily counter 063 keeps for
  -- signed-in callers (cap 300, the cost ceiling). Visitors may take it to
  -- 200 only, so the last 100 stay for members however busy the front door.
  -- A refused visitor must not count (the update's WHERE), or refusals alone
  -- would push the counter past 300 and shut members out.
  if p_scope = 'place-photo-anon' then
    current_count := null;
    insert into app_rate_limits values('place-photo-global', 'global', day_start, 1)
      on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
        where app_rate_limits.request_count < 200
      returning request_count into current_count;
    return current_count is not null;
  end if;
  return true;
end; $$;
revoke all on function consume_otp_limit(text,text,text) from public, anon, authenticated;
grant execute on function consume_otp_limit(text,text,text) to anon, authenticated;

commit;
