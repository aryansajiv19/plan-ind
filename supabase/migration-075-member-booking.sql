-- Migration 075: any member can say "I'll book it"; catalogue decisions made
-- after 070 went live. STAGED -- written, not applied anywhere. Applies after
-- 069 (plan_booking_owners) and 070.
--
-- Booking (owner decision 2026-09-27): claim_booking / release_booking let any
-- member of a plan take or give back the booking, as the host already could
-- through execute_plan_command 'patch' (unchanged: the host can still take it
-- themselves or clear anyone's). plans.booking_owner stays the label everyone reads;
-- plan_booking_owners records the account (069). A member never silently
-- takes over another member's live claim -- two taps at once get one
-- "claimed" and one "taken" -- and nothing moves once the plan is booked.

begin;

create or replace function claim_booking(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
  holder uuid;
  label text;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  -- Plans first, then child rows: the order every other plan write takes.
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_member');
  end if;
  -- Nothing to book before a winner (owner decision 2026-09-27). Releasing
  -- stays open to the holder at any time, e.g. after a reopen.
  if target.status <> 'decided' then
    return jsonb_build_object('result', 'not_decided');
  end if;
  if target.booked is true then
    return jsonb_build_object('result', 'booked', 'booking_owner', target.booking_owner);
  end if;
  -- Free to take: no claim, a deleted account's (user_id null), or one whose
  -- holder has left the plan -- else a leaver would hold it for good once a
  -- booking fell through, with nobody able to release it but the host.
  select user_id into holder from plan_booking_owners where plan_id = p_plan_id;
  if holder is not null and holder <> auth.uid()
     and exists (select 1 from plan_access where plan_id = p_plan_id and user_id = holder) then
    return jsonb_build_object('result', 'taken', 'booking_owner', target.booking_owner);
  end if;
  -- The label is the caller's own profile name, never text they send.
  select nullif(clean_display_name(display_name), '') into label from people where auth_user_id = auth.uid();
  if label is null then
    return jsonb_build_object('result', 'no_profile');
  end if;
  update plans set booking_owner = label where id = p_plan_id;
  insert into plan_booking_owners (plan_id, user_id) values (p_plan_id, auth.uid())
  on conflict (plan_id) do update set user_id = excluded.user_id;
  return jsonb_build_object('result', 'claimed', 'booking_owner', label);
end; $$;
revoke all on function claim_booking(uuid) from public, anon, authenticated;
grant execute on function claim_booking(uuid) to authenticated;

create or replace function release_booking(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target plans%rowtype;
begin
  if not is_permanent_user() then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select * into target from plans where id = p_plan_id for update;
  if target.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_member');
  end if;
  -- Booked means the reservation exists: the name stays, as leave_plan keeps it.
  if target.booked is true then
    return jsonb_build_object('result', 'booked', 'booking_owner', target.booking_owner);
  end if;
  if not exists (select 1 from plan_booking_owners where plan_id = p_plan_id and user_id = auth.uid()) then
    return jsonb_build_object('result', 'not_yours', 'booking_owner', target.booking_owner);
  end if;
  update plans set booking_owner = null where id = p_plan_id;
  delete from plan_booking_owners where plan_id = p_plan_id;
  return jsonb_build_object('result', 'released');
end; $$;
revoke all on function release_booking(uuid) from public, anon, authenticated;
grant execute on function release_booking(uuid) to authenticated;

-- my_plan_rows (069 body, copied verbatim, edited where marked 075).
create or replace function my_plan_rows(p_plan_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from plan_access where plan_id = p_plan_id and user_id = uid) then
    raise exception 'Plan access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'votes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'phase', v.phase,
                         'pool_number', v.pool_number, 'spot_id', v.spot_id) order by v.phase, v.pool_number)
                       from votes v where v.plan_id = p_plan_id and v.user_id = uid), '[]'::jsonb),
    'rsvp_id', (select r.id from rsvps r where r.plan_id = p_plan_id and r.user_id = uid),
    'rating_id', (select r.id from ratings r where r.plan_id = p_plan_id and r.user_id = uid),
    -- 069: the caller's own seat, as it appears on every row they write.
    'seat_key', md5(p_plan_id::text || ':' || uid::text),
    -- 075: whether the booking claim is this account's. Names repeat on a
    -- plan (067 F2), so the booking_owner label can't tell.
    'my_booking', exists (select 1 from plan_booking_owners b where b.plan_id = p_plan_id and b.user_id = uid));
end; $$;
revoke all on function my_plan_rows(uuid) from public, anon, authenticated;
grant execute on function my_plan_rows(uuid) to authenticated;

-- BEGIN GENERATED by scripts/gen-catalogue-truth.mjs -- edit its lists, not this block
-- Catalogue decisions made after 070 was applied (070 is frozen). A retired
-- curated row leaves the deal pool, the wall and Discover; plans that already
-- hold it still read it.
update spots set visibility = 'private' where id = '20000000-0000-0000-0000-000000000002' and source = 'curated'; -- Scoopi Cafe: retired (owner decision 2026-09-27)
update spots set visibility = 'private' where id = '60000000-0000-0000-0000-000000000002' and source = 'curated'; -- Garage Dubai: retired (owner decision 2026-09-27)
-- Iris Harbour is a lounge: vibes, not shisha (owner decision 2026-09-27).
update spots set category = 'vibes', cuisine = 'Lounge'
  where id = 'd0000000-0000-0000-0000-000000000004' and source = 'curated';
-- END GENERATED

commit;
