# scripts/ — operational tools, not product code

**Read when:** adding or running anything here. Nothing in this directory ships
to users; it exists to measure, verify or back-fill.

## Rules

- **Read-only by default.** A script that writes to the live project needs the
  owner's explicit go, every time, like a migration.
- **No service-role key. Ever.** There isn't one in this project. A script that
  needs write access it cannot get is telling you the RLS posture is correct —
  use the dashboard, or don't do it.
- **Print `ok` / `BLOCK: <reason>` per check.** A gate that prints nothing on
  failure reads as a pass. The apply gate here once false-passed because
  `"$SHA:path"` is a zsh modifier, so `git show` failed silently and `grep -c`
  printed `0`.
- **Prove a gate both ways** — that it blocks on a known-bad input and passes on
  a known-good one. A gate only ever seen passing is untested.
- Check **content type, not just status**: a missing object in a public bucket
  returns a 400 with a JSON body, which a status-only check reads as fine.

## What's here

| Path | Does | Note |
|---|---|---|
| `check-schema-types.mjs` | `lib/types.ts` vs `schema.sql` | in CI |
| `check-spot-photo-urls.sh` | every `photo_url` resolves to a real image | run before applying any photo migration |
| `smoke-test.mjs`, `verify-journey.mjs` | deployment verification | needs live infrastructure |
| `backfill-*.mjs` | one-off data fills | keep, they document how the data got there |
| `eval-smart-search.ts` | AI eval, opt-in | never in CI; one full run per day is the whole budget |
| `load/` | concurrency + fan-out harness | mirrors the app's real queries — if the app changes its query, change this too, or you are measuring a query nobody runs |

## When a harness and the app disagree, suspect the harness

A probe once reported "Realtime has never worked in production" and nearly
justified a migration. It called `realtime.setAuth()` before joining, which the
real client does not. **The wrong version is usually the more dramatic one**,
which is exactly why it gets believed.
