import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
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
// This refuses to run against anything but loopback. A misconfigured
// PLAYWRIGHT/CI env cannot quietly point the browser matrix at production
// and start casting votes -- it fails loudly instead. Safety is structural
// here, not a convention someone has to remember.

import { join } from "node:path";

// cwd-relative, not import.meta: Playwright transpiles these hooks to CJS,
// where import.meta is unavailable. Playwright always runs from the repo root.
const FIXTURE_FILE = join(process.cwd(), "tests/e2e/.fixture.local.json");
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
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    throw new Error(
      `Refusing to run E2E against ${url}.\n` +
      "guest-vote.spec.ts CASTS A REAL VOTE, and neither plans nor votes can be\n" +
      "deleted by anything in this project (no delete policy, no service-role\n" +
      "key), so a run against a hosted project leaves rows behind permanently.\n" +
      "Point NEXT_PUBLIC_SUPABASE_URL at 127.0.0.1 and re-run.",
    );
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

  const planId = randomUUID();
  const { error: planError } = await admin.from("plans").insert({
    id: planId,
    title: `E2E guest vote ${new Date().toISOString()}`,
    category: "dinner",
    status: "open",
    stage: "pool",
    pool_count: 3,
  });
  if (planError) throw new Error(`fixture: creating the plan failed -- ${planError.message}`);

  const { error: spotLinkError } = await admin.from("plan_spots").insert(
    spots.map((spot, i) => ({
      plan_id: planId,
      spot_id: spot.id,
      pool_number: (i % 3) + 1,
      advanced: false,
    })),
  );
  if (spotLinkError) throw new Error(`fixture: linking spots failed -- ${spotLinkError.message}`);

  await writeFile(FIXTURE_FILE, JSON.stringify({ planId, createdAt: new Date().toISOString() }, null, 2));
  console.log(`[e2e] disposable plan ${planId} provisioned on the local stack`);
}
