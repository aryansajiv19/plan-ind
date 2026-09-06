import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { MIN_ACCOUNT_AGE, memberAge, prohibitedVenueReason } from "@/lib/age-policy";
import {
  QUERY_LIMITS,
  intentFromResponse,
  mapModelError,
  queryLengthError,
  smartSearchRequest,
  type SmartSearchIntent,
} from "@/lib/ai/intent";
import {
  plainText,
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";
import { consumeQuota, privateSubject, recordSecurityEvent } from "@/lib/security/controls";

export const runtime = "nodejs";

export type { SmartSearchIntent };

function privateIdentifier(value: string): string {
  return privateSubject(value).slice(0, 32);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    body = await readJsonBody(request, 4_096);
  } catch (error) {
    return requestError(error, "The search request could not be read.");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Sign in to use smart search." }, { status: 401 });
  }

  const query = typeof body === "object" && body !== null && "query" in body
    ? plainText((body as { query: unknown }).query, QUERY_LIMITS.max)
    : "";
  const lengthError = queryLengthError(query);
  if (lengthError) {
    return Response.json({ error: lengthError }, { status: 400 });
  }
  if (prohibitedVenueReason(query)) {
    return Response.json({ error: "Deal three does not recommend sexually explicit or adult-entertainment venues." }, { status: 400 });
  }
  // Fail closed, same as /api/spots/deal: a missing age must not default to
  // an adult, or an age-restricted category becomes reachable for a caller
  // who never provided one.
  const age = (user ? await memberAge(supabase, user.id) : null) ?? MIN_ACCOUNT_AGE;

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const safetyIdentifier = privateIdentifier(user?.id ?? forwarded);
  if (user && !(await consumeQuota(supabase, "smart-search"))) {
    await recordSecurityEvent(supabase, { type: "ai_quota", outcome: "blocked", subject: user?.id ?? forwarded, requestId: request.headers.get("x-vercel-id") });
    return Response.json({ error: "Too many searches. Try again in a minute." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Smart search is not configured yet." }, { status: 503 });
  }

  try {
    // maxRetries 0: the SDK default is 2, and a daily-quota 429 carries a
    // Retry-After measured in minutes — the SDK sleeps through it and the
    // request holds a serverless invocation open instead of returning the 503
    // this route already has an honest message for.
    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 30_000 });
    const response = await client.responses.create(
      smartSearchRequest({ query, age, safetyIdentifier }),
    );

    // The age gate is re-checked here, after the model returned, by
    // `intentFromResponse`. The prompt asks the model to respect it; this
    // decides whether it did. Never move that check into the prompt alone.
    const outcome = intentFromResponse(response, age);
    if (!outcome.ok) {
      if (outcome.reason === "truncated" || outcome.reason === "unparseable") {
        console.error("Smart search response unusable", JSON.stringify({
          reason: outcome.reason,
          responseId: response.id,
          incomplete: response.incomplete_details?.reason ?? null,
        }));
      }
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }
    return Response.json({ intent: outcome.intent }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const mapped = mapModelError(error);
    console.error("Smart search request failed", JSON.stringify(mapped.details));
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}
