import type { NextConfig } from "next";

// The GitHub Pages build is a static export served from a repository subpath, so it
// cannot run route handlers. `route.server.ts` files are only recognised as routes
// when `server.ts` is in pageExtensions, which keeps the OpenAI adapter and the
// Realtime client-secret endpoint out of the exported bundle entirely.
const isStaticExport = process.env.BUILD_TARGET === "static";
const basePath = isStaticExport ? "/ai-interviewer" : "";

const nextConfig: NextConfig = {
  ...(isStaticExport ? { output: "export" as const } : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  images: { unoptimized: true },
  pageExtensions: isStaticExport ? ["tsx", "ts"] : ["server.ts", "tsx", "ts"],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SERVER_FEATURES: isStaticExport ? "disabled" : "enabled",
  },
};

export default nextConfig;
