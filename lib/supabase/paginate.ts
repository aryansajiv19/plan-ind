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
// Paging is the only way past it from a table read. Prefer narrowing the
// query over paging through the whole table where the query shape allows;
// this exists for the cases that genuinely need every matching row.
const PAGE = 1000;
const MAX_PAGES = 50; // 50k rows -- a stop, so a runaway loop can't spin

// Typed on the RESULT rather than on PostgrestFilterBuilder's generics: a
// query builder is thenable, so this accepts any of them without coupling to
// postgrest-js's internal type parameters (which differ between a table read
// and an rpc, and change between versions).
type PageResult<T> = { data: T[] | null; error: unknown };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE;
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return rows.length ? rows : null;
    rows.push(...(data as T[]));
    if (data.length < PAGE) return rows; // short page => last page
  }
  return rows;
}
