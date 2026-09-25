import { randomUUID } from "node:crypto";
import { isLocalStack, localAdmin } from "./local-stack";

// A plan built for ONE test, on the local stack, and deleted when it ends.
//
// global-setup's fixtures are all the same shape (open, pool stage, no
// budget, no winner). The specs here need other shapes -- a budget and a
// radius for the "Why this?" chips, a decided plan with a winner that has
// coordinates for the share row and the weather line -- so each test makes
// its own. Per test rather than per spec: fullyParallel runs the same test
// in chromium and Mobile Chrome at once, and every assertion below is about
// rows only that test should own.
//
// Loopback only, like everything that uses the admin key. Callers skip on
// `canProvision()` being false.

export const canProvision = () => isLocalStack(process.env.NEXT_PUBLIC_SUPABASE_URL);

export interface PlanShape {
  title: string;
  /** Curated spot ids, three per pool in order; pool 1 is what renders first. */
  spotIds: string[];
  status?: "open" | "decided";
  budgetPerPerson?: number | null;
  radiusKm?: number | null;
  origin?: { label: string; latitude: number; longitude: number } | null;
  winnerSpotId?: string | null;
  eventTime?: string | null;
}

export async function withPlan(shape: PlanShape, run: (planId: string) => Promise<void>): Promise<void> {
  const admin = localAdmin();
  const planId = randomUUID();
  const decided = shape.status === "decided";
  const { error } = await admin.from("plans").insert({
    id: planId,
    title: shape.title,
    category: "dinner",
    status: decided ? "decided" : "open",
    stage: decided ? "decided" : "pool",
    pool_count: 3,
    budget_per_person: shape.budgetPerPerson ?? null,
    radius_km: shape.radiusKm ?? null,
    origin_label: shape.origin?.label ?? null,
    origin_latitude: shape.origin?.latitude ?? null,
    origin_longitude: shape.origin?.longitude ?? null,
    winner_spot_id: shape.winnerSpotId ?? null,
    event_time: shape.eventTime ?? null,
  });
  if (error) throw new Error(`plan-factory: creating the plan failed -- ${error.message}`);
  try {
    const { error: linkError } = await admin.from("plan_spots").insert(
      shape.spotIds.map((spotId, i) => ({
        plan_id: planId,
        spot_id: spotId,
        pool_number: Math.floor(i / 3) + 1,
        advanced: decided && spotId === shape.winnerSpotId,
      })),
    );
    if (linkError) throw new Error(`plan-factory: linking spots failed -- ${linkError.message}`);
    await run(planId);
  } finally {
    // votes, plan_spots and plan_access cascade from plans.
    await admin.from("plans").delete().eq("id", planId);
  }
}

/** A curated spot WITH coordinates (the seed has none), removed afterwards. */
export async function withSpot(
  fields: { name: string; area: string; latitude: number; longitude: number; open_till: string; min_spend: number },
  run: (spotId: string) => Promise<void>,
): Promise<void> {
  const admin = localAdmin();
  const spotId = randomUUID();
  const { error } = await admin.from("spots").insert({
    id: spotId, category: "dinner", cuisine: "Seafood", price_band: "$$", vibe: "E2E fixture spot",
    source: "curated", ...fields,
  });
  if (error) throw new Error(`plan-factory: creating the spot failed -- ${error.message}`);
  try {
    await run(spotId);
  } finally {
    await admin.from("spots").delete().eq("id", spotId);
  }
}

/** Seeded curated spots (supabase/seed.sql) the specs read by id. */
export const SEEDED = {
  threeFils: "a0000000-0000-0000-0000-000000000003", // Jumeirah, AED 180, 11pm
  ravi: "a0000000-0000-0000-0000-000000000002", // Al Satwa, AED 45, 3am
  buQtair: "a0000000-0000-0000-0000-000000000004", // Umm Suqeim, AED 60, 11:30pm
  tresind: "a0000000-0000-0000-0000-000000000005", // DIFC, AED 550, 11pm
  reif: "a0000000-0000-0000-0000-000000000001", // Dubai Hills, AED 250, 12am
} as const;

/** More seeded spots to fill pools 2 and 3 alongside SEEDED; never in pool 1. */
export const FILLER = [
  "20000000-0000-0000-0000-000000000001",
  "20000000-0000-0000-0000-000000000002",
  "20000000-0000-0000-0000-000000000003",
  "c0000000-0000-0000-0000-000000000001",
  "c0000000-0000-0000-0000-000000000002",
] as const;
