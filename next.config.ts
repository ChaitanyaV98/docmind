import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Document uploads go through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Node-only packages stay out of the bundle.
  serverExternalPackages: ["ioredis", "postgres", "unpdf"],
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
