import { log, serializeError } from "@/lib/observability/log";

// PostgREST caps every table read at `db-max-rows` (1000 on Supabase's
// defaults), and it does so SILENTLY: no error, no truncation flag, just
// fewer rows than match. An explicit `.limit(3000)` or `.range(0, 4999)`
// does NOT lift it -- both still return 1000 (measured, 2026-09-06).
//
// That turned two queries into correctness bugs the moment the catalogue
// passed 1000 rows: the deal pool silently drew from only the first 1000
// spots of a category family, and place-import matched a pasted link against
// only the first 1000 curated spots -- reporting "no match" for venues that
// are in the catalogue. Neither had a limit clause, so neither looked
// capped.
//
// ── This helper must never return a partial answer ───────────────────────
//
// The whole point is to remove "an empty-or-short success the caller cannot
// distinguish from a complete one". Returning the rows gathered so far when
// page 3 fails would rebuild exactly that: `dealSpotIds` checks only for
// null, so a transient error on page 1 would deal a plan from the oldest
// 1000 spots and look entirely normal -- the original incident, reached
// through its own fix. So: ANY page error, or exhausting MAX_PAGES without
// a short page, returns null. `T[]` means complete; null means "ask again".
//
// ⚠ The caller's query MUST carry a stable, total `.order()` (e.g. by id).
// Range paging over an unordered query can repeat or skip rows between
// pages, which would corrupt the result while still looking complete.
//
// Prefer narrowing the query over paging the whole table where the shape
// allows; this exists for the cases that genuinely need every matching row.
const PAGE = 1000;
const MAX_PAGES = 50; // 50k rows

// Typed on the RESULT rather than on PostgrestFilterBuilder's generics: a
// query builder is thenable, so this accepts any of them without coupling to
// postgrest-js's internal type parameters (which differ between a table read
// and an rpc, and change between versions).
type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  context: string,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE;
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) {
      // Deliberately discards `rows`: a partial answer returned through the
      // same channel as a complete one is the bug this helper exists to
      // prevent, and it is worse than no answer because it looks fine.
      log("error", "paginate.page_failed", {
        context, page: i, rowsSoFar: rows.length, ...serializeError(error),
      });
      return null;
    }
    rows.push(...data);
    if (data.length < PAGE) return rows; // short page => genuinely the last
  }
  // Ran out of pages with every page full: the result is truncated at 50k
  // and indistinguishable from a catalogue that is exactly 50k. That is the
  // PostgREST cap again with a bigger number, so it is an error, not a
  // success.
  log("error", "paginate.max_pages_exhausted", { context, rows: rows.length, maxPages: MAX_PAGES });
  return null;
}
