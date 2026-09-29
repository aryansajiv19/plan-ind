-- Migration 087: a per-account daily cap on creating plans, in the database.
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
--
-- The 50-a-day plan-create quota (consume_app_quota 'plan-create') lives in
-- the API routes, because it needs the server's control secret. But
-- create_secure_plan and create_direct_plan are granted to authenticated, so
-- a session calling them straight through PostgREST skipped it (the 086
-- security review, H1's root cause). This counts every plan an account
-- creates, whichever door it came through, in a trigger on plans: 50 a
-- Dubai day, the same number as the route. A counter, not a count of rows,
-- so deleting a plan doesn't give the slot back.
--
-- Only client sessions are counted (auth.uid() set): the database owner's
-- inserts (seeds, admin, tests) are not. Its own SQLSTATE, PC429, so a real
-- limit error (54000) is never mistaken for it. The day is Dubai's; the
-- route's quota uses a UTC day, so across that boundary this is the one that
-- holds the line at 50 a Dubai day. That is intended; don't align them.

begin;

create table if not exists plan_create_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  n       integer not null default 0,
  primary key (user_id, day)
);
alter table plan_create_counts enable row level security;
revoke all on table plan_create_counts from public, anon, authenticated;

create or replace function enforce_plan_create_cap() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    return new;
  end if;
  insert into plan_create_counts as c (user_id, day, n)
  values (uid, (now() at time zone 'Asia/Dubai')::date, 1)
  on conflict (user_id, day) do update set n = c.n + 1
  returning n into used;
  if used > 50 then
    -- The whole insert rolls back, the counter's increment with it.
    raise exception 'Too many plans started today. Try again tomorrow.' using errcode = 'PC429';
  end if;
  return new;
end $$;
revoke all on function enforce_plan_create_cap() from public, anon, authenticated;

drop trigger if exists plans_create_cap on plans;
create trigger plans_create_cap before insert on plans
  for each row execute function enforce_plan_create_cap();

commit;
