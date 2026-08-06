-- Persist the natural-language brief and interpreted soft preferences used to
-- build a plan. Apply after migration 010. Additive and safe to re-run.

alter table plans add column if not exists smart_brief text;
alter table plans add column if not exists vibe_preferences text[] not null default '{}';
alter table plans add column if not exists avoid_preferences text[] not null default '{}';
alter table plans add column if not exists intelligence_model text;

alter table plans drop constraint if exists plans_smart_brief_check;
alter table plans add constraint plans_smart_brief_check
  check (smart_brief is null or char_length(smart_brief) between 8 and 600);
alter table plans drop constraint if exists plans_vibe_preferences_check;
alter table plans add constraint plans_vibe_preferences_check
  check (cardinality(vibe_preferences) <= 6);
alter table plans drop constraint if exists plans_avoid_preferences_check;
alter table plans add constraint plans_avoid_preferences_check
  check (cardinality(avoid_preferences) <= 5);
