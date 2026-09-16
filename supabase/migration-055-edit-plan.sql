-- Migration 055 — edit_plan (C5): the host can rename a plan or move its
-- deadline before anyone has voted. Apply after 054. Additive (new function
-- only), re-run safe. STAGED, not applied. (053 is reserved for the legacy
-- null-user_id participant rows.)
--
-- A new RPC, not another execute_plan_command branch: that function raises
-- instead of returning codes (a refusal would look like any other error), its
-- auth is the host token alone, and it is the core voting function.
--
-- Auth is delete_plan's (047): signed in, not anonymous, the plan's creator,
-- AND the host token. `for update` serialises concurrent edits and host
-- commands on the row.
--
-- "Voting has started" = status <> 'open' OR stage <> 'pool' OR any vote
-- exists. Direct plans (decided at creation) are therefore never editable.
--
-- Validation matches plan creation: title = clean_app_text(title, 60),
-- non-empty; deadline in the future and at most a year out. A null argument
-- leaves that field unchanged. Nothing to change returns nothing_to_change,
-- which the route treats as success.
--
-- ACCEPTED RACE (reviewed, do not file): cast_plan_vote does not take the
-- plans row lock, so a first vote can commit just after this function's
-- "no votes" check. The outcome is a renamed title or moved deadline on a plan
-- with one vote — benign, and not worth locking the voting path for.

create or replace function edit_plan(
  p_plan_id uuid,
  p_host_token text,
  p_title text default null,
  p_deadline timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  target plans%rowtype;
  stored_hash text;
  new_title text;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;

  select token_hash into stored_hash from plan_host_tokens where plan_id = p_plan_id;
  if target.created_by_user_id is distinct from auth.uid()
     or p_host_token is null or length(p_host_token) < 32 or stored_hash is null
     or stored_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    return jsonb_build_object('result', 'not_host');
  end if;

  if target.status <> 'open' or target.stage <> 'pool'
     or exists (select 1 from votes where plan_id = p_plan_id) then
    return jsonb_build_object('result', 'voting_started');
  end if;

  if p_title is not null then
    new_title := clean_app_text(p_title, 60);
    if new_title = '' then
      return jsonb_build_object('result', 'invalid_title');
    end if;
  end if;

  if p_deadline is not null and (p_deadline <= now() or p_deadline > now() + interval '1 year') then
    return jsonb_build_object('result', 'invalid_deadline');
  end if;

  if (new_title is null or new_title = target.title)
     and (p_deadline is null or p_deadline = target.deadline) then
    return jsonb_build_object('result', 'nothing_to_change');
  end if;

  update plans set
    title = coalesce(new_title, title),
    deadline = coalesce(p_deadline, deadline)
  where id = p_plan_id
  returning * into target;

  return jsonb_build_object('result', 'edited', 'title', target.title, 'deadline', target.deadline);
end;
$$;

revoke all on function edit_plan(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function edit_plan(uuid, text, text, timestamptz) to authenticated;
