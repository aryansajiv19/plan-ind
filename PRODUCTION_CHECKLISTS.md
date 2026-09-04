# Two checklists the owner sent, 2026-09-04

Recorded verbatim, then triaged against what's actually in this repo — most of
the security list is **already done**, don't redo it. Self-audit your section;
don't take the whole list as a from-scratch task list.

## Security — triaged (Security/Backend lane owns this)

**✅ Already done — verify, don't rebuild:**
HSTS · CSRF tokens (double-submit) · prevent user enumeration
(`requestEmailCode` matches success/failure shape) · whitelist upload types ·
cap AI usage (`consume_app_quota`, 30/day/user + 300/day global) · limit
request size (`readJsonBody` caps) · sanitize before storing (`plainText()`) ·
log security events (`security_events` + `recordSecurityEvent`) · restrict DB
permissions / enable RLS (extensive, this is most of the repo's security work)
· hide API keys (server-only `OPENAI_API_KEY`/`SECURITY_CONTROL_SECRET`) ·
use public DB key (anon key by design, no service-role key exists) · enforce
server-side auth · lock record access (`plan_access` scoping) · block field
tampering (age/quota always server-derived) · parameterize queries (Supabase
client, no raw SQL concatenation) · validate all input · escape user content
(React/JSX auto-escapes) · restrict file uploads (MIME/size caps) · security
headers + force HTTPS (`next.config.ts`) · rate limit OTP request+verify
(migration 026) · bot protection (Turnstile — **but see gap below, still not
turned on**).

**N/A for this app, don't build blind — record the rule for when it applies:**
Reset sessions on password change / expire reset links / hash passwords /
rate limit password resets — **passwordless** (OTP + Google OAuth only, no
password exists). Verify payment webhooks / set prices server-side — **no
payment feature exists yet**; the rule (server-derived prices, verified
provider signature against the raw webhook body) is already recorded in
`SECURITY_SETUP.md` for whenever one is added. Remove default admin
routes / disable directory listing — no admin panel, Next.js doesn't serve
directory listings.

**Genuinely open — pick these up:**
- **Turnstile CAPTCHA is still not enabled in production** — this is an owner
  dashboard action (Attack Protection), flagged before, still open. Remind the
  owner; not something you can fix in code.
- **CORS** — not explicitly verified/locked down anywhere in this codebase's
  history. Check it.
- **Secure cookie flags** (`Secure`/`HttpOnly`/`SameSite`) — Supabase's SSR
  client sets some of this by default; verify it's actually correct here, not
  assumed.
- ~~**Purge Git secrets**~~ — **Done, 2026-09-04 (T0).** `gitleaks detect --source . --log-opts="--all"` across all 186 commits, 22 hits, all triaged individually, zero real secrets: 4 are the well-known public local-Supabase-CLI demo JWT (`iss: supabase-demo`, ships with every `supabase start`, local-only, not a live credential), 1 is `ci.yml`'s self-evidently-named `ci-placeholder-secret-at-least-32-chars`, 17 are SHA-256 content-hashes in `graphify-out/cache/stat-index.json` that gitleaks' generic-api-key regex misread as keys. That cache file was also committed 6× with identical content (churns every graphify rebuild) — untracked going forward (`.gitignore` + `git rm --cached`), not purged from history since a rewrite would break every worktree's shared history without a real secret to justify it. Re-run before any real secret is ever suspected; this pass doesn't need repeating on a schedule.
- **Trim API responses** — migration 022's own comment flags this as unfinished:
  `spots` reads still use broad `select("*")` in places; narrow the select
  lists, especially before any embedding column lands.
- **`npm audit` as a CI gate**, not just ad-hoc — add it to `ci.yml`.
- **Block prompt injection** — the `openai-responses` skill's contract exists,
  but is unverified live since B3 (OpenAI credits) has blocked all AI testing.
  Re-verify once that's unblocked, don't assume it holds.
- **Account lockout after failed logins** — OTP-verify's rate limit is the
  closest equivalent (8/min, 20/day); there's no traditional password login to
  "lock." Confirm this is actually sufficient, don't just wave it through.
- **Encrypt sensitive data at rest** — secrets/tokens are hashed (SHA-256/
  bcrypt) correctly; Supabase encrypts the underlying storage. If "encrypt"
  means something more specific the owner wants (column-level encryption on a
  particular field), ask rather than assume it's covered.

**Added, specific to this app** (not on the owner's generic list, but real risk
here):
- **Age-gate integrity.** The 13/18/21 venue thresholds are the one place
  "block field tampering" has real stakes — already server-derived from
  `member_ages`, never client input. Keep it that way through every future
  change that touches age.
- **Anonymous → permanent account upgrade.** Migration 024 closed a real gap
  here (`set_birth_date` wasn't checking `is_permanent_user()`, so an
  anon-then-upgraded session could have written a fabricated write-once DOB).
  Any *new* write-once/immutable field needs the same check from day one, not
  retrofitted after the fact.
- **Realtime publication exposure.** Only `plan_spots` and `votes` are in
  `supabase_realtime`, each RLS'd per-subscriber. Any future table added to
  that publication needs the same "who can already SELECT this row" reasoning
  documented in migration 022 — it's an easy thing to get casually wrong.
- **Share-link unguessability.** Plan IDs are UUIDs today (fine). If a
  vanity/short-link feature is ever added, it needs its own brute-force
  analysis — a 6-character slug is a very different security property.
- **The venue-link enrichment feature (in progress) is the single highest
  SSRF-risk surface about to be built** — `PLACE_IMPORT_ARCHITECTURE.md`'s
  rules (allowlisted provider adapters only, never a generic arbitrary-URL
  fetch, block private IPs/redirects/oversized responses) aren't optional
  hardening, they're load-bearing for that feature specifically.
- **No automated check that the live DB matches `schema.sql`.** CI's
  `check:schema` only verifies `lib/types.ts` against the `schema.sql` *file*
  — nothing verifies the *live* project actually has every migration applied.
  Given migrations are applied manually/via MCP with no ledger, this is a real
  gap. Worth a periodic live-catalog diff, not just trusting the runbook table.

## "Vibecoded" anti-patterns — triaged (Design + Frontend own this)

Full list, owner's words, is in the message history — this file doesn't repeat
all ~150 items, they're the checklist to run the actual UI against page by
page. **Emphasis: stay modern, this isn't "make it plain" — it's "make it
actually designed," not template-shaped.**

**⚠️ One direct conflict already in the codebase, resolve deliberately:**
`lucide-react` was added as a dependency in the 2026-09-02 motion/kokonutui
commit. The owner's list explicitly says avoid "Lucide icons," "Sparkles/
Brain/Bot/Rocket icons," and "icon inside a colored rounded square." **Design:
either justify specific, restrained uses (not decoration-by-default) or drop
it** — don't let it sit as an unexamined default.

**Check against what's already planned/shipped — spot-checked, not exhaustive:**
- Palette direction (coral/gold/teal on near-black) is not "generic navy" or
  "purple and black" — consistent with the list so far.
- `VoteState.tsx` already covers loading/error/captcha/retry/empty-shaped
  states for the vote flow — the list calls out missing loading/empty/error/
  disabled/success states as a vibecoded tell. Extend that pattern site-wide,
  don't let it stay vote-page-only.
- Serif display face (owner call, 2026-09-02) — not on the avoid list, fine as
  is.

**Everything else on the list** (gradient text, glowing buttons/borders, bento
grids, fake social proof, generic SaaS section order, buzzword copy, missing
404/500 pages, console errors, dead links, inconsistent spacing past the
homepage, etc.) — audit the actual built UI against it page by page. This is
exactly what the frontend-design skill and a real device/breakpoint pass are
for. Report genuine hits, don't rewrite working UI to chase items that don't
apply here.

**Added, specific to this app:**
- **No empty photo frames when there's no photo** (owner, 2026-09-04) — don't
  render a visible placeholder box for a missing image. Either omit that slot
  entirely, or fall back to something that reads as designed (a text-only
  card, a subtle pattern), never a blank/bordered rectangle. Directly relevant
  to the photo-wall spec's current "NO PHOTO YET" placeholder tiles — those
  need a real empty-state treatment, not a labeled gap.
- **No dashes in any app-facing copy** (owner, 2026-09-04, explicit and
  emphasized beyond the list's "em dashes" line) — headings, body text,
  button labels, empty/error/loading states, everything a user reads. Rewrite
  with a period, a comma, or two sentences instead. Sweep existing copy for
  this too, not just new copy going forward. Scope is the product's UI text —
  not code comments or these coordination docs.
- **No fake social proof, ever, on this one.** The list already says avoid
  fake "Trusted by 10,000+ users"/fake logos/fake testimonials — worth stating
  explicitly here because this app has real usage data (actual plans, actual
  votes) and zero incentive to fake numbers it doesn't have. If a stat shows,
  it's real or it's not shown.
- **Mobile is not a secondary check here — it's the primary surface.** A
  share-link vote is opened from a group chat on a phone; "desktop-first with
  mobile as an afterthought" (on the avoid list) would hit this app's actual
  use case harder than most. 390px is not a checkbox pass, it's where most
  real usage happens.
- **The Dubai-clock day/night theming is a real product decision, not the
  "unnecessary dark mode" anti-pattern the list warns about.** It changes with
  when people are actually planning "tonight" — don't let a reflexive
  anti-vibecoded pass strip out something that's earning its place. Judge it
  on whether it's *arbitrary* decoration, not on "is it dark mode."
- **Category color-coding was deliberately retired already** (the five
  category-group hues, superseded by the turn-14 palette work). Don't let
  "icon inside a colored rounded square" or "colored left stripe" creep back
  in per-category — that's the exact pattern that was already removed once.
- **Avoid too much blank space** (owner, 2026-09-04) — ties directly to the
  list's own "huge whitespace just to look premium" item. Dense-but-organized
  reads more luxurious here than empty margins do; don't let restraint tip
  into emptiness.
- **The front door's "Tonight in Dubai" live preview card is real product,
  not a mockup** — keep leaning on showing the actual thing, not a generic
  dashboard screenshot or fake browser window, which the list correctly flags
  as a tell.
