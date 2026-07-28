import { defineConfig, devices } from "@playwright/test";

const port = 4173;

// Tests run against the production static export served from the /ai-interviewer
// subpath — the same shape GitHub Pages serves — so basePath and asset-prefix
// regressions fail in CI instead of on the live demo. The trailing slash matters:
// Playwright resolves relative paths against baseURL with URL semantics, and
// without it "interview" would resolve to the server root.
const baseURL = `http://localhost:${port}/ai-interviewer/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Requires a prior `npm run build:static`.
    command: "npm run serve:static",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
