import type { NextConfig } from "next";

/**
 * Next.js 16 config.
 * - Docker / 腾讯云: set DOCKER_BUILD=1 to enable `output: "standalone"`.
 * - Netlify: do NOT set DOCKER_BUILD — OpenNext adapter handles packaging.
 * Docs: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
 */
const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  // Avoid shipping local data / remotion sandbox into traces accidentally
  outputFileTracingExcludes: {
    "*": [
      "./.nexa-data/**/*",
      "./视频/**/*",
      "./infra/searxng-win/**/*",
      "./docs/**/*",
    ],
  },
  poweredByHeader: false,
};

export default nextConfig;
