import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["bcryptjs", "pg"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.aona.co.th",
      },
    ],
  },
};

export default nextConfig;
