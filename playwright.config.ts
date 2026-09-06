import { defineConfig, devices } from "@playwright/test";

// Real-browser E2E, separate from the hermetic `npm test` suite — these hit a
// running Next.js server and (for guest-vote.spec.ts) the live Supabase
// project via .env.local, the same way scripts/smoke-test.mjs does.
//
// Not wired into `npm run test`/the lint-tsc-test-build gate on purpose: it
// needs @playwright/test + browser binaries installed
// (`npx playwright install --with-deps chromium webkit firefox`), which this repo's
// worktrees deliberately don't do themselves — see tests/README.md.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  // Cross-environment matrix. Was chromium-desktop only, which is the wrong
  // shape for this app: a plan is created on one device and its share link
  // is opened on someone else's phone, so the guest path — the product's own
  // delivery item #1 — is *mostly* a mobile path and was never tested as one.
  //
  // WebKit earns its slot rather than being cross-browser box-ticking: every
  // iOS browser is WebKit regardless of its badge, so an iPhone user has no
  // alternative engine to fall back on if something breaks there. It is also
  // where this app is most likely to break — the vote screen leans on
  // backdrop-filter, and `100vh` behaves differently under a Safari toolbar.
  //
  // Run a subset with `--project`, e.g. `npm run test:e2e -- --project="Mobile Safari"`.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 14"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
  ],
  // Reuses a server you already have running (PLAYWRIGHT_BASE_URL or a local
  // `npm run dev`/`npm run start`) if one answers; otherwise builds and
  // starts one itself. The production build sidesteps this worktree's
  // Turbopack-dev-server symlink issue (see tests/README.md).
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
