-- Migration 054 — friend invites: a trust signal in the preview (M1) and a
-- race-free open-invite cap (I1). Apply after 052. Re-run safe. STAGED.
-- Redefines two functions from 048 with the same signatures (ACLs kept).
--
-- M1: a display name and emoji can be copied from a real friend, so the
-- preview showed nothing an impersonator couldn't forge. It now also returns
-- shared_plans: how many plans the inviter and the redeemer have both joined
-- (plan_access rows; creators get one at creation). Only a count about a
-- relationship the redeemer is part of: no plan names, nothing about third
-- parties, and nothing at all on an invalid or self result.
-- Deliberately simple (no plan age, no participation filter): an
-- impersonator can wait or vote, so extra rules raise cost without closing
-- anything. KNOWN LIMIT: claim_plan_access admits anyone who knows a plan id,
-- so someone holding a share link to a plan the redeemer is in can add to
-- this count. Fixing that is tracked as must-fix-before-launch.
--
-- I1: create_friend_invite counted open invites and then inserted, so
-- parallel calls could exceed the cap of 20. A per-inviter transaction
-- advisory lock serialises that section; other users are unaffected. The same
-- call removes the caller's own used or expired invites older than 7 days,
-- bounding growth without touching the cron job.
-- ⚠ create_friend_invite must stay VOLATILE (the default): each statement then
-- takes a fresh snapshot, so the count sees invites committed while this call
-- waited on the lock. Marking it STABLE would silently bring the race back.

create or replace function create_friend_invite()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  token text;
  expires timestamptz;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from people where id = uid and auth_user_id = uid) then
    raise exception 'Create a profile first' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('friend_invite:' || uid::text, 0));

  delete from friend_invites
  where inviter_id = uid
    and (expires_at < now() or used_at is not null)
    and created_at < now() - interval '7 days';

  if (select count(*) from friend_invites
      where inviter_id = uid and used_at is null and expires_at > now()) >= 20 then
    raise exception 'Too many open invites' using errcode = '54000';
  end if;

  token := encode(gen_random_bytes(32), 'hex');
  insert into friend_invites (token_hash, inviter_id)
  values (encode(digest(token, 'sha256'), 'hex'), uid)
  returning expires_at into expires;
  return jsonb_build_object('token', token, 'expires_at', expires);
end;
$$;

create or replace function preview_friend_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  inviter people%rowtype;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;
  select p.* into inviter from friend_invites i join people p on p.id = i.inviter_id
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and i.used_at is null and i.expires_at > now();
  if inviter.id is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  if inviter.id = auth.uid() then
    return jsonb_build_object('result', 'self', 'display_name', inviter.display_name, 'emoji', inviter.emoji);
  end if;
  return jsonb_build_object(
    'result', 'valid',
    'display_name', inviter.display_name,
    'emoji', inviter.emoji,
    'shared_plans', (
      select count(*) from plan_access a
      join plan_access b on b.plan_id = a.plan_id
      where a.user_id = inviter.id and b.user_id = auth.uid()
    ));
end;
$$;
