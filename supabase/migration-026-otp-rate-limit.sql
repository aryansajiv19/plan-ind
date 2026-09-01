-- Migration 026 — durable rate limits on the OTP email flow: the request
-- side (send a code) and, per Review's follow-up, the verify side (guess a
-- code). Apply after 025. Additive, re-run safe. Unapplied — safe to amend in
-- place (see the migrations skill: fix in place until applied, new number
-- after).
--
-- consume_app_quota (020/022) is Postgres-backed and durable, but it requires
-- auth.uid() — every one of its callers already has a session. Both OTP steps
-- happen before a session exists (app/auth/actions.ts), so neither has ever
-- had a durable limiter — only a Turnstile captcha in production (none in
-- dev), which proves "not a trivial bot", not "not spamming/guessing against
-- one address".
--
-- ── Request side ───────────────────────────────────────────────────────
-- Unlimited requests to an arbitrary email is a real abuse vector independent
-- of enumeration (the response is already enumeration-resistant) —
-- inbox-bombing, deliverability-reputation cost.
--
-- ── Verify side (added after Review's cross-lane flag) ────────────────
-- Checked what Supabase Auth (GoTrue) actually enforces before assuming it
-- covers this: its documented rate limits
-- (supabase.com/docs/guides/platform/going-into-prod) are per-IP REQUEST
-- rates for the verify endpoint (360/hour, bursts to 30) — not a per-code
-- attempt cap. A 6-digit code has 1,000,000 values; the per-IP limit slows a
-- single-origin guesser but does nothing against an attacker spread across a
-- modest number of IPs (a proxy pool, not even a real botnet), since the
-- limit is keyed on the REQUESTER's IP, not the TARGET email. An app-level
-- cap keyed on the target email closes that specific bypass: it holds no
-- matter how many IPs the guesser uses, because the bucket is the victim's
-- address, not the attacker's origin.
--
-- One function, not two near-duplicates: consume_app_quota already threads
-- multiple named scopes through one CASE-based limit table, and now that
-- there are two OTP callers with the same "control-secret gated, subject-
-- keyed, minute+day buckets" shape, matching that pattern beats a second
-- copy-pasted function.

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
  if not valid_control_secret(p_secret) or p_scope not in ('otp-request', 'otp-verify')
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
  minute_limit := case p_scope when 'otp-request' then 3 else 8 end;
  day_limit := case p_scope when 'otp-request' then 10 else 20 end;
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

-- Same posture as record_security_event: anon IS the correct role (there is
-- no session yet), safe only because valid_control_secret gates every call
-- and the function returns a plain boolean with no information beyond
-- "allowed" — it discloses nothing about whether the email exists or how
-- many guesses remain.
revoke all on function consume_otp_limit(text,text,text) from public, authenticated;
grant execute on function consume_otp_limit(text,text,text) to anon, authenticated;

-- ── Verification (run after applying) ────────────────────────────────────
-- select has_function_privilege('anon','consume_otp_limit(text,text,text)','execute'),
--        has_function_privilege('authenticated','consume_otp_limit(text,text,text)','execute');
-- -- expect true, true
-- select consume_otp_limit('wrong-secret','otp-request','anything');
-- -- expect 42501, not a boolean (oracle check, same as consume_app_quota)
-- select consume_otp_limit('<real-secret>','bogus-scope','anything');
-- -- expect 42501 too (scope whitelist)
