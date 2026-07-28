import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  // Build output and Playwright artifacts are generated; Deno function
  // entrypoints use a different runtime and are checked by the Supabase CLI.
  { ignores: [".next/**", "out/**", ".static-preview/**", "playwright-report/**", "test-results/**", "blob-report/**", "supabase/functions/*/index.ts"] },
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      // Underscore marks a binding that exists only to omit a key from a rest spread.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
];

export default config;
