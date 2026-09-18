// One real-browser spec in the pre-merge gate, and proof that it ASSERTED.
//
// Why this exists: removing "N people voting" broke three E2E specs and
// nobody noticed for a day, because the suite isn't in the gate and a spec
// that dies in setup (no local stack, no fixture, no browser) looks exactly
// like a spec that passed — zero failures either way. That silence is how the
// un-vote regression shipped. So this fails on "didn't run" as loudly as it
// fails on "ran and broke".
//
// Scope is deliberate: realtime-multi-client is the one spec that covers the
// thing unit tests can't reach (a second client seeing a vote live), on
// chromium only. It takes seconds. The rest of the suite stays a manual run —
// a gate people skip protects nothing.
import { spawnSync } from "node:child_process";

const SPEC = "tests/e2e/realtime-multi-client.spec.ts";

function fail(reason, fix) {
  console.error(`\ngate:e2e FAILED — ${reason}`);
  if (fix) console.error(`  ${fix}\n`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL is not set, so the spec would skip.",
    "Point it at your LOCAL stack, e.g. NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55021 npm run gate:e2e",
  );
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(supabaseUrl)) {
  fail(
    `NEXT_PUBLIC_SUPABASE_URL is not a local stack (${supabaseUrl}).`,
    "This spec votes for real. Run it against a local Supabase only — see tests/README.md.",
  );
}

const run = spawnSync(
  "npx",
  ["playwright", "test", SPEC, "--project=chromium", "--reporter=json"],
  { encoding: "utf8", env: process.env },
);

// Playwright writes the JSON report to stdout, but a missing browser or a
// throwing globalSetup leaves stderr as the only explanation.
let report;
try {
  report = JSON.parse(run.stdout.slice(run.stdout.indexOf("{")));
} catch {
  fail(
    "Playwright produced no report, so the spec never ran.",
    (run.stderr || run.stdout || "").trim().split("\n").slice(-6).join("\n  ")
      || "Install browsers with `npx playwright install chromium`.",
  );
}

const { expected = 0, unexpected = 0, skipped = 0, flaky = 0 } = report.stats ?? {};
if (unexpected > 0) fail(`${unexpected} test(s) failed.`, "Run `npm run test:e2e -- " + SPEC + "` to see them.");
// The dark-spec case: setup provisioned nothing, so the spec skipped itself
// and reported success. Treat it as a failure, because it proved nothing.
if (skipped > 0) fail(`${skipped} test(s) skipped, so they asserted nothing.`, "Start the local Supabase stack and retry.");
if (expected === 0) {
  // Usually globalSetup threw (no local stack answering, no fixture), which
  // Playwright reports as an error with zero tests rather than a failure.
  const why = (report.errors ?? []).map((e) => e.message).join("\n  ").trim();
  fail("No tests ran at all.", why || `Check that ${SPEC} still exists and matches the chromium project.`);
}

console.log(`gate:e2e ok — ${expected} passed${flaky ? `, ${flaky} flaky` : ""} (${SPEC})`);
