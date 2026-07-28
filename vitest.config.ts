import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirror the "@/*" path alias from tsconfig.json.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    // Unit tests only. Playwright owns e2e/ and must not be collected by vitest.
    include: ["{app,components,hooks,lib}/**/*.test.ts"],
  },
});
