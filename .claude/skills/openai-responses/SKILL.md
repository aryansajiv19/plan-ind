---
name: openai-responses
description: "The OpenAI Responses API contract for plan-ind. Use before writing, editing, or reviewing any code in app/api/smart-search/route.ts or lib/ai/** — anything that calls a model, builds a structured-output schema, adds a tool, or handles a model response. Encodes this repo's model id, its strict-schema-plus-revalidation rule, the truncation check, the mandatory security preamble, and the rules that keep security filters out of model reach."
---

# OpenAI Responses API — the plan-ind contract

This repo uses the **Responses API**, not Chat Completions. Training data will
push you toward `client.chat.completions.create` with a `messages` array. That
is the wrong API here. Read this before writing model code.

## The call, as it actually is

```ts
const response = await client.responses.create({
  model: MODEL,                       // "gpt-5.6-luna"
  store: false,                       // no server-side retention — deliberate
  reasoning: { effort: "low" },
  max_output_tokens: 600,
  safety_identifier,                  // HMAC'd user id or IP, never raw
  instructions,                       // the system prompt goes HERE
  input: query,                       // the untrusted user string
  text: { format: { type: "json_schema", strict: true, name: "...", schema } },
});
const intent = normalizeIntent(JSON.parse(response.output_text));
```

Differences from Chat Completions that actually bite:

| Chat Completions | Responses API |
|---|---|
| `messages: [{role:"system"}, {role:"user"}]` | `instructions` + `input` |
| `response_format` | `text.format` |
| `choices[0].message.content` | `response.output_text` |
| `max_tokens` | `max_output_tokens` |
| `tools: [{type:"function", function:{name,...}}]` | `tools: [{type:"function", name, ...}]` — **flattened, no nested `function` object** |

## Non-negotiables

**1. Check for truncation before parsing.**
`output_text` on a truncated response is invalid JSON, and `JSON.parse` throws
into a generic 502 with nothing to diagnose from.

```ts
if (response.status === "incomplete") {
  // response.incomplete_details?.reason === "max_output_tokens"
  return Response.json({ error: "..." }, { status: 502 });
}
```

**2. `strict: true` is not a trust boundary — re-validate anyway.**
`normalizeIntent` exists for this reason and must stay: clamp every number to a
range, slice every string to a max length, cap every array, and fall back to a
known-good default for anything not in the enum. Apply the same to every tool
argument. Model output is untrusted input, exactly like a request body.

**3. Security filters are never model-callable.**
Age, budget and prohibited-content filtering live in the SQL `WHERE` clause and
in the route. They are not tools, and they are not arguments the model supplies.
A tool takes only what it is safe for the model to choose — a query string, a
category — while the route injects the gates from `memberAge()` and the
validated intent. If the model has no argument through which to widen a gate, it
cannot widen it.

**4. Similarity ranks; it never admits.**
A vector score may reorder rows that already passed the filters. Gate in
`WHERE`, score in `ORDER BY`. Never the reverse.

**5. The model must never name a venue.**
It returns constraints; real places come from the `spots` table. This is a
product rule with a safety edge — an invented venue is a lie shown to a group
making real plans.

**6. Keep the house preamble, in order.**
Every mutating route: `validateMutationRequest(request)` →
`readJsonBody(request, cap)` → auth → `plainText(value, max)` →
`consumeQuota(supabase, scope)`. Do not use a Server Action to call a model —
Actions skip the origin and `sec-fetch-site` checks and would create a second,
weaker trust boundary.

**7. Never leak the key or the prompt.**
`OPENAI_API_KEY` is server-only. `store: false` and the hashed
`safety_identifier` are deliberate. Do not log raw prompts, emails, tokens or
cookies.

## Tool calling

`store: false` means **no `previous_response_id`** — the conversation is not
retained server-side, so each turn resends the full `input` array. The route
stays stateless, which is what we want.

The loop:

1. `input` starts as `[{ role: "user", content: query }]`
2. Scan `response.output` for `{ type: "function_call", call_id, name, arguments }`
3. None found → parse `output_text`, normalize, done
4. Otherwise append the `function_call` item **and** a matching
   `{ type: "function_call_output", call_id, output: JSON.stringify(result) }`
   for each, then call again

Cap the rounds (3) and fail closed on exhaustion — an uncapped loop is a bill.
Raise `max_output_tokens` when tools are enabled; tool arguments consume the
same budget as the final answer, and 600 is already tight for an 11-field schema.

## Errors

`OpenAI.APIError` carries `requestID`, `status`, `code`, `type`. Map
`429` / `insufficient_quota` to a 503 with an honest message; everything else to
502. Log the request id — it is the only handle support has.

**This account currently has zero credits.** Every live call returns
`429 insufficient_quota`. Test against fixtures and report untested-live work as
untested-live; a 429 is not a pass.

## Testing without credits

Inject the model call rather than importing it: pass
`client.responses.create.bind(client)` in production and a stub returning a
fixture in tests. Everything else — request building, normalization, the loop,
each tool's `execute` — is then a pure function testable under Node's built-in
runner. No mocking library.

Type-annotate each fixture against the installed SDK so `tsc` proves it matches
the real response shape:

```ts
const truncated: OpenAI.Responses.Response = JSON.parse(readFileSync(path, "utf8"));
```

That buys shape-correctness for zero tokens, and tells you if the shape drifts.
