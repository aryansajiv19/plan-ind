import { createClient } from "@/lib/supabase/server";
import { MIN_ACCOUNT_AGE, memberAge } from "@/lib/age-policy";
import {
  plainText,
  readJsonBody,
  requestError,
  validateMutationRequest,
} from "@/lib/security/request";
import { dealSpotIds, type DealConstraints } from "@/lib/spots/match";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DEAL = 9;
const MAX_BEEN = 200;

function idList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && UUID.test(id)).slice(0, limit)
    : [];
}

function boundedNumber(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, value))
    : null;
}

function keywords(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.map((item) => plainText(item, 30)).filter(Boolean).slice(0, limit)
    : [];
}

function origin(value: unknown): DealConstraints["origin"] {
  if (!value || typeof value !== "object") return null;
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    validateMutationRequest(request);
    // 16KB, not 4KB: a 200-entry "been" list alone is ~7.5KB of uuids.
    body = await readJsonBody(request, 16_384);
  } catch (error) {
    return requestError(error, "The deal request could not be read.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return Response.json({ error: "Sign in to deal places." }, { status: 401 });
  }
  // No consumeQuota: `consume_app_quota` only accepts smart-search,
  // plan-create and place-import, and borrowing plan-create would spend the
  // plan bucket on re-deals. This is an authenticated RLS-scoped read with no
  // writes and no external I/O; its own scope arrives with migration 022.

  const raw = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const category = plainText(raw.category, 40);
  if (!category) {
    return Response.json({ error: "Pick a type of place." }, { status: 400 });
  }
  const requested = boundedNumber(raw.count, MAX_DEAL);
  const count = requested ? Math.max(1, Math.round(requested)) : 3;
  const supplied = raw.constraints && typeof raw.constraints === "object"
    ? raw.constraints as Record<string, unknown>
    : {};

  // Age is the account's, never the caller's: a client-supplied age is an
  // attacker-supplied one. Missing means fail closed, not fail open.
  const age = (await memberAge(supabase, user.id)) ?? MIN_ACCOUNT_AGE;
  const radiusOrigin = origin(supplied.origin);
  const ids = await dealSpotIds(supabase, {
    category,
    count,
    excludeIds: idList(raw.excludeIds, MAX_DEAL),
    been: idList(raw.been, MAX_BEEN),
    constraints: {
      age,
      maxBudget: boundedNumber(supplied.maxBudget, 10_000),
      origin: radiusOrigin,
      radiusKm: radiusOrigin ? boundedNumber(supplied.radiusKm, 100) : null,
      vibeKeywords: keywords(supplied.vibeKeywords, 6),
      avoidKeywords: keywords(supplied.avoidKeywords, 5),
    },
  });

  return Response.json({ ids }, { headers: { "Cache-Control": "no-store" } });
}
