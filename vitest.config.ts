import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only. Playwright owns e2e/ and must not be collected by vitest.
    include: ["{app,components,hooks,lib}/**/*.test.ts"],
  },
});
