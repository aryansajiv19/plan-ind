---
name: secrets-audit
description: "Which plan-ind values are public by design, which are server-only, and how to check that the boundary has not moved. Use when reviewing env handling, a new environment variable, or anything that reaches a client bundle."
---

# Secrets audit

The most common false finding in this repo is reporting the anon key as a leak.
It is **public by design**. Know the boundary before you file anything.

| Variable | Exposure | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | by design — **not a leak** |
| `OPENAI_API_KEY` | **server only** | never `NEXT_PUBLIC_` |
| `SECURITY_CONTROL_SECRET` | **server only** | 256 random bits, bcrypt-hashed in `app_control_secrets` |
| service-role key | **does not exist** | none may be added, ever |

## The check

1. **No service-role key anywhere** — source, history, or env. If one appears, it
   is a finding regardless of where it sits.
2. **No secret behind a `NEXT_PUBLIC_` prefix.** That prefix inlines the value
   into the client bundle at build time; renaming a secret into it is a silent
   full disclosure.
3. **`.env*` is gitignored**, with `!.env.local.example` as the only exception.
   The example holds placeholders only.
4. **Nothing real in git history.** A key that was committed and later removed is
   still in the history and still compromised.
5. **No raw prompt, PII, or key in a log line.** Structured detail server-side is
   fine; the client gets a generic message.
6. **Errors do not leak internals.** Map RPC error codes to statuses; never pass
   a raw Postgres error to the client.

## Reporting

Say which of the two classes a finding belongs to — a public-by-design value in a
public place is not a finding, and reporting it trains the owner to ignore you. A
server-only value reachable from the browser is critical regardless of how hard
it looks to reach.

If a security issue looks exploitable, describe the class of problem and the fix.
Do not write a working exploit or a step-by-step extraction path.
