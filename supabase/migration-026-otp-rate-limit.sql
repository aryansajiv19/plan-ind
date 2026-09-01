-- Migration 026 — durable rate limit on the OTP email-code request.
-- Apply after 025. Additive, re-run safe.
--
-- consume_app_quota (020/022) is Postgres-backed and durable, but it requires
-- auth.uid() — every one of its callers already has a session. OTP request
-- happens BEFORE a session exists (app/auth/actions.ts requestEmailCode), so
-- it has never had a durable limiter, only a Turnstile captcha in production
-- (none in dev, and a captcha proves "not a trivial bot", not "not spamming
-- one address"). Unlimited requests to an arbitrary email is a real abuse
-- vector independent of enumeration (the response is already
-- enumeration-resistant) — inbox-bombing, deliverability-reputation cost.
--
-- Not covered here, deliberately: OTP-verify guess-throttling. Supabase's own
-- GoTrue enforces attempt/expiry limits on token verification server-side;
-- duplicating that as an app-level counter would be a shadow limiter we can't
-- observe or test from outside, built without evidence GoTrue's is
-- insufficient. Confirm the GoTrue project setting instead (owner action).
--
-- Single-purpose, not a new scope in consume_app_quota's enum: this has
-- exactly one caller and a different identity model (a HMAC'd email, not a
-- uid), so bolting it onto that function would mean threading an "is this an
-- anon-keyed scope" branch through a function whose whole contract today is
-- "requires a session". A second small function matching
-- record_security_event's existing anon-callable, control-secret-gated shape
-- is the smaller, clearer diff.

create or replace function consume_otp_request_limit(p_secret text, p_subject text)
returns boolean language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  current_count integer;
  subject_key text := left(p_subject, 128);
begin
  if not valid_control_secret(p_secret) or subject_key is null or subject_key = '' then
    raise exception 'Server authorization required' using errcode = '42501';
  end if;
  -- 3/minute, 10/day per subject. Tight on purpose: a genuine user requests a
  -- code once or twice per sign-in (typo, resend); this only needs to be
  -- generous enough that a real "I didn't get it, resend" doesn't 429.
  insert into app_rate_limits values('otp-request-minute', subject_key, minute_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > 3 then return false; end if;
  insert into app_rate_limits values('otp-request-day', subject_key, day_start, 1)
    on conflict(scope,subject,window_start) do update set request_count = app_rate_limits.request_count+1
    returning request_count into current_count;
  if current_count > 10 then return false; end if;
  return true;
end; $$;

-- Same posture as record_security_event: anon IS the correct role (there is
-- no session yet), safe only because valid_control_secret gates every call
-- and the function returns a plain boolean with no information beyond
-- "allowed" — it discloses nothing about whether the email exists.
revoke all on function consume_otp_request_limit(text,text) from public, authenticated;
grant execute on function consume_otp_request_limit(text,text) to anon, authenticated;

-- ── Verification (run after applying) ────────────────────────────────────
-- select has_function_privilege('anon','consume_otp_request_limit(text,text)','execute'),
--        has_function_privilege('authenticated','consume_otp_request_limit(text,text)','execute');
-- -- expect true, true
-- select consume_otp_request_limit('wrong-secret','anything');
-- -- expect 42501, not a boolean (oracle check, same as consume_app_quota)
