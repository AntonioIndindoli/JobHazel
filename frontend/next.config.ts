import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.JOBHAZEL_E2E === "1" ? ".next-e2e" : ".next",
  devIndicators: process.env.JOBHAZEL_E2E === "1" ? false : undefined,
  output: "export",
  images: {
    unoptimized: true,
  },

  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        poll: 500,
        aggregateTimeout: 100,
      };
    }

    return config;
  },
};

export default nextConfig;
