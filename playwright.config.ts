import { defineConfig, devices } from "@playwright/test";

// Real-browser E2E, separate from the hermetic `npm test` suite — these hit a
// running Next.js server and (for guest-vote.spec.ts) the live Supabase
// project via .env.local, the same way scripts/smoke-test.mjs does.
//
// Not wired into `npm run test`/the lint-tsc-test-build gate on purpose: it
// needs @playwright/test + browser binaries installed
// (`npx playwright install --with-deps chromium`), which this repo's
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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
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
