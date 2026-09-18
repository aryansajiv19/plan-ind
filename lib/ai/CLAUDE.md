# lib/ai/ — the model layer

**Read when:** touching anything that calls a model, builds a structured-output
schema, adds a tool, or handles a model response — here or in
`app/api/smart-search/route.ts`.

**Read the `openai-responses` skill first.** This repo uses the **Responses
API**, not Chat Completions. Training data will steer you wrong, confidently.

## Non-negotiable

- **Never trust the model's output shape.** `strict: true` is a convenience,
  not the guarantee. `normalizeIntent` re-validates every field, and it exists
  because arrays are objects: `[]` once passed a `typeof !== "object"` guard and
  produced a **fully defaulted intent reporting `valid: true`** — a fabricated
  search returned as a 200, which nothing downstream could detect.
- **Security filters never reach the model.** Age gating and category
  restriction are applied *after* the response, server-side. A cooperative
  prompt injection must not be able to lift them.
- **Always pass `maxRetries: 0`.** The SDK defaults to 2, and a per-day 429
  carries a `Retry-After` in minutes — it will hold a serverless invocation open
  for half an hour rather than fail. Set an explicit timeout too.
- **Truncation is a failure, not a short answer.** Check it explicitly.

## Cost and limits

The account is on a **free tier: 10 requests/minute, 50/day.** That is not
"credits exhausted" — a mis-worded record cost this project days. Without a key
the route returns a 503 with honest copy and nothing else breaks.

**If billing is ever added, set a budget cap first.** Quotas key on
`auth.uid()`, and anonymous sign-ins are enabled for guest voting, so anything
that can mint a session can mint a quota.

## Evals

`scripts/eval-smart-search.ts`, opt-in via `npm run eval:ai`, **never in CI**.
Hermetic guardrail tests live in `tests/smart-search-guardrails.test.ts` and run
in `npm test`, because a live call cannot reliably produce a hostile model but a
fixture can.

**Never assert on prose.** `title` and `summary` vary per run; a suite people
learn to ignore is worse than no suite. Score only the structured fields, and
report an unrun eval as UNRUN — not as a pass.
