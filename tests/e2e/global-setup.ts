import { createClient } from "@supabase/supabase-js";
import { writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Provisions a DISPOSABLE plan for guest-vote.spec.ts, on the LOCAL Supabase
// stack only.
//
// ── Why this exists, and why the alternatives don't work ─────────────────
//
// guest-vote.spec.ts used to vote on a hardcoded plan in the LIVE project on
// every run, which is why RUN_E2E was left off and the whole cross-browser
// matrix never ran on the product's delivery item #1.
//
// The obvious fix -- create a plan per run and tear it down -- is impossible
// against live: `plans` and `votes` have NO delete policy at all (checked in
// pg_policy; both tables are read-only to clients by design, and writes go
// through security-definer RPCs). With no service-role key in this project
// either, nothing can remove a plan or a vote once created. So every CI run
// would leave a permanent plan and its votes in production forever, which is
// worse than the shared fixture it replaced.
//
// A designated live fixture has the same problem one level down: the votes
// accumulate and cannot be cleaned, which is exactly the objection that
// disabled the spec.
//
// The local stack is the only option where teardown is real, so that is what
// this targets. Writes are disposable by construction rather than by promise.
//
// ── The guard is the point ───────────────────────────────────────────────
//
// A fixture is provisioned ONLY against loopback. Pointed anywhere else this
// provisions nothing, so the specs that vote have no plan id and skip -- a
// misconfigured CI cannot quietly point the browser matrix at production and
// start casting votes, because there is nothing for it to vote on.
//
// Note the shape: the protection is the ABSENCE of a fixture, not a flag
// that someone can set. There is deliberately no escape hatch that makes a
// voting spec run against a hosted project. Read-only specs are unaffected
// and run anywhere, which is what makes preview-deployment runs (the only
// place WebKit coverage is possible) usable.

import { FIXTURE_FILE, FIXTURE_NAMES } from "./fixture";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export default async function globalSetup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "E2E needs NEXT_PUBLIC_SUPABASE_URL pointing at a LOCAL Supabase stack.\n" +
      "Start one with `npx supabase start`, then see tests/README.md.",
    );
  }
  // ── Non-loopback: provision NOTHING, and say so ────────────────────────
  //
  // This used to throw, which was right for the specs that vote and wrong for
  // everything else: runtime-health and layout-consistency only load pages,
  // are safe against any target, and were being blocked by a guard that
  // exists to protect writes. They are also the only way to get WebKit
  // coverage, since WebKit cannot run a production build over plain http
  // (see playwright.config.ts) and therefore needs a deployed preview.
  //
  // So the guard moves from "refuse the run" to "withhold the fixture". The
  // writing specs are gated on the fixture's existence and skip loudly
  // without it, so they CANNOT reach a hosted project: there is no plan id
  // for them to vote on. That is structural rather than a promise -- there is
  // no flag here that makes a voting spec run against production, which is
  // the property that must not be weakened.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    // A fixture left over from an earlier LOCAL run would otherwise let a
    // writing spec pick up a plan id while pointed at a remote target. It
    // would 404 rather than write, but relying on that is luck; delete it.
    await rm(FIXTURE_FILE, { force: true });
    console.log(
      `[e2e] ${url} is not a local stack — no fixture provisioned.\n` +
      "      Read-only specs (runtime-health, layout-consistency) will run.\n" +
      "      Specs that cast a vote will SKIP: neither plans nor votes can be\n" +
      "      deleted by anything in this project (no delete policy, no\n" +
      "      service-role key), so a write here would be permanent.",
    );
    return;
  }

  const admin = createClient(url, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });

  // Nine curated spots, three per pool -- the same shape create_secure_plan
  // builds, written directly because the service role is provisioning a
  // fixture rather than exercising the creation path (the journey script
  // covers that).
  const { data: spots, error: spotsError } = await admin
    .from("spots").select("id").eq("source", "curated").limit(9);
  if (spotsError) throw new Error(`fixture: reading spots failed -- ${spotsError.message}`);
  if (!spots || spots.length < 9) {
    throw new Error(
      `fixture: need 9 curated spots locally, found ${spots?.length ?? 0}.\n` +
      "Run `node --env-file=.env.local scripts/load/seed-local-stack.mjs` first.",
    );
  }

  // One plan per spec: they run in parallel and each asserts exact counts,
  // so a shared plan would have them voting on each other's rows.
  const plans: Record<string, string> = {};
  for (const name of FIXTURE_NAMES) {
    const planId = randomUUID();
    const { error: planError } = await admin.from("plans").insert({
      id: planId,
      title: `E2E ${name} ${new Date().toISOString()}`,
      category: "dinner",
      status: "open",
      stage: "pool",
      pool_count: 3,
    });
    if (planError) throw new Error(`fixture(${name}): creating the plan failed -- ${planError.message}`);

    const { error: spotLinkError } = await admin.from("plan_spots").insert(
      spots.map((spot, i) => ({
        plan_id: planId,
        spot_id: spot.id,
        pool_number: (i % 3) + 1,
        advanced: false,
      })),
    );
    if (spotLinkError) throw new Error(`fixture(${name}): linking spots failed -- ${spotLinkError.message}`);
    plans[name] = planId;
  }

  await writeFile(FIXTURE_FILE, JSON.stringify({ plans, createdAt: new Date().toISOString() }, null, 2));
  console.log(`[e2e] provisioned ${FIXTURE_NAMES.length} disposable plans on the local stack`);
}
