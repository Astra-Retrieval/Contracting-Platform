import type { NextConfig } from "next";

// Every page in this app is per-user (auth cookies), so the static-shell features
// (cacheComponents / partialPrefetching) are left off and pages render on request.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
