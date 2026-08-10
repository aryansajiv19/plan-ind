-- Age-aware recommendations and mainstream venue safety policy.
-- Apply after migration 012.

alter table spots add column if not exists minimum_age smallint not null default 0;
alter table spots drop constraint if exists spots_minimum_age_check;
alter table spots add constraint spots_minimum_age_check check (minimum_age between 0 and 99);

-- Curated categories with common door or service restrictions.
update spots set minimum_age = greatest(minimum_age, 18) where category = 'shisha';
update spots set minimum_age = greatest(minimum_age, 21) where category in ('nightlife', 'vibes', 'beach_club');
update spots set minimum_age = greatest(minimum_age, 21)
  where category = 'beach' and lower(cuisine) like '%beach club%';

alter table spots drop constraint if exists spots_mainstream_content_check;
alter table spots add constraint spots_mainstream_content_check check (
  lower(concat_ws(' ', name, cuisine, vibe, description)) !~
  '(strip[[:space:]-]*club|gentlemen''s[[:space:]]+club|adult[[:space:]-]+entertainment|erotic[[:space:]]+massage|escort[[:space:]]+service|brothel|sex[[:space:]]+club|swinger[[:space:]]+club|topless[[:space:]]+bar|nude[[:space:]]+show)'
);
