import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  // Build output and Playwright artifacts are generated, not source.
  { ignores: [".next/**", "out/**", ".static-preview/**", "playwright-report/**", "test-results/**", "blob-report/**"] },
  ...nextVitals,
  ...nextTypeScript,
];

export default config;
