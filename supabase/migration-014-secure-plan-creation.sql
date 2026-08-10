-- Secure plan creation and spot attachment.
-- Apply after migration 013. Public plan links remain readable/votable; only
-- authenticated creators can create plans and attach their candidate spots.

alter table plans add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists plans_creator_idx on plans (created_by_user_id);

drop policy if exists "create plans" on plans;
create policy "create own plans" on plans for insert to authenticated
  with check (created_by_user_id = (select auth.uid()));

drop policy if exists "attach plan_spots" on plan_spots;
create policy "attach own plan_spots" on plan_spots for insert to authenticated
  with check (exists (
    select 1 from plans p
    where p.id = plan_id and p.created_by_user_id = (select auth.uid())
  ));
