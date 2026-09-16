-- Migration 048 — friendships need consent from both people.
-- Apply after migration 047. Re-run safe.
--
-- The hole (reproduced on a database built from schema.sql, 2026-09-16):
-- "add own friendships" checked person_id = auth.uid() and left friend_id
-- unconstrained. Any signed-in account could insert (me -> victim), and
-- "read permitted visits" / "read permitted people" then matched that row:
-- 0 of the victim's visits readable before, all of them (notes included)
-- after. mirror_friendship also wrote (victim -> me), which unlocked the
-- victim's visibility='friends' photos.
--
-- The fix is structural, not a status filter. An edge is only ever created by
-- redeem_friend_invite, which needs a token the INVITER created and the
-- REDEEMER presents: an act by both uids. The direct insert policy is dropped,
-- so every existing read policy stays correct unchanged -- the row existing is
-- the proof of consent. A pending/accepted column would instead need every
-- read policy to remember `and status = 'accepted'`, and a missed one would
-- reopen this silently.
--
-- Unfriending stays one-sided ("remove own friendships" + the mirror delete):
-- either person can revoke.
--
-- Existing friendship rows are left as they are. addFriend never had a caller,
-- so any present were hand-written; verify them when the project unpauses.

drop policy if exists "add own friendships" on friendships;
-- Belt and braces: with no insert policy RLS already refuses, but the table
-- grant should not claim a write path that does not exist.
revoke insert on friendships from anon, authenticated;

-- Secret table: RLS on, no policies, only the definer functions below touch it.
create table if not exists friend_invites (
  token_hash text primary key,
  inviter_id uuid not null references people(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists friend_invites_inviter_idx on friend_invites (inviter_id, expires_at);
alter table friend_invites enable row level security;

-- Returns the raw token exactly once; only its sha256 is stored.
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
  -- ponytail: count-based cap per inviter; a time-windowed quota if invites get abused.
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

-- Result codes, never a silent no-op:
--   friends          edge created
--   already_friends  edge existed; token consumed, nothing duplicated
--   self             your own invite; token left unused
--   invalid          unknown, used or expired (not distinguished, on purpose)
create or replace function redeem_friend_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  uid uuid := auth.uid();
  invite friend_invites%rowtype;
  created int;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if not exists (select 1 from people where id = uid and auth_user_id = uid) then
    raise exception 'Create a profile first' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into invite from friend_invites
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  if invite.token_hash is null or invite.used_at is not null or invite.expires_at <= now() then
    return jsonb_build_object('result', 'invalid');
  end if;
  if invite.inviter_id = uid then
    return jsonb_build_object('result', 'self');
  end if;

  update friend_invites set used_at = now() where token_hash = invite.token_hash;
  -- mirror_friendship writes the reverse edge.
  insert into friendships (person_id, friend_id) values (invite.inviter_id, uid)
  on conflict do nothing;
  get diagnostics created = row_count;

  return jsonb_build_object(
    'result', case when created = 1 then 'friends' else 'already_friends' end,
    'friend_id', invite.inviter_id);
end;
$$;

-- Shows the redeemer WHO they would befriend before they accept (security
-- review of 048): without it a confirm screen can only say "Add friend?" or
-- trust a name carried in the link. Reveals the inviter's display name and
-- emoji to whoever holds their token, which the inviter chose to share.
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
  return jsonb_build_object('result', case when inviter.id = auth.uid() then 'self' else 'valid' end,
    'display_name', inviter.display_name, 'emoji', inviter.emoji);
end;
$$;

revoke all on function create_friend_invite() from public, anon, authenticated;
grant execute on function create_friend_invite() to authenticated;
revoke all on function redeem_friend_invite(text) from public, anon, authenticated;
grant execute on function redeem_friend_invite(text) to authenticated;
revoke all on function preview_friend_invite(text) from public, anon, authenticated;
grant execute on function preview_friend_invite(text) to authenticated;
