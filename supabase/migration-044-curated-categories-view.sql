-- Migration 044: `curated_categories`, so the Discover filter tabs stop
-- being derived from a truncated read.
--
-- ── The bug ──────────────────────────────────────────────────────────────
--
-- The category tabs were built from whatever the 120-row catalogue read
-- happened to return, so a category whose venues all sort late gets NO TAB
-- AT ALL and becomes unreachable. Possible at 82 spots; certain at the
-- owner's 500-1000 target. The honest fix is a DISTINCT over the whole
-- table, which PostgREST cannot express.
--
-- ── Why a view, not a security-definer RPC ───────────────────────────────
--
-- A definer function would have to RE-IMPLEMENT 041's scoping ("curated
-- spots this caller may see"), and a second copy of a security rule is a
-- second thing to keep in step. This project has already paid for that: the
-- day's other bugs came from two places disagreeing about the same fact.
--
-- `security_invoker = true` (PG15+, and both local and live are 17.6 --
-- checked, not assumed) makes the view run with the CALLER's privileges, so
-- row-level security on `spots` applies to it exactly as it does to a direct
-- read. That means:
--   * anon sees categories of `source = 'curated'` rows only, per 041;
--   * an authenticated user additionally sees categories of their own custom
--     spots and community ones, per `read permitted spots`;
--   * if either policy ever changes, this view follows automatically with no
--     edit here.
--
-- WITHOUT `security_invoker`, a view runs as its OWNER and bypasses RLS
-- entirely -- it would happily leak the categories of every private custom
-- spot in the table. That option is load-bearing, not decoration.
--
-- Scoped to curated in the view body as well, because the tabs are a
-- catalogue control: a user's own private spot should not mint a public-
-- looking filter tab for everyone else's grid.

drop view if exists public.curated_categories;
create view public.curated_categories
  with (security_invoker = true) as
  select distinct category
  from public.spots
  where source = 'curated';

-- Read-only by construction: a view over a select-only policy, granted
-- select only. No insert/update/delete grant, and nothing to write to.
grant select on public.curated_categories to anon, authenticated;

-- PostgREST caches the schema, so a newly created view is invisible to the
-- API until it reloads -- the first attempt to read it returns "Could not
-- find the table in the schema cache", which reads like the migration failed
-- when it did not. Ask for the reload here so applying this is one step.
notify pgrst, 'reload schema';
