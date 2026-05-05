import type { NextConfig } from "next";

export const APP_BASE_PATH = "/cashflow";

const nextConfig: NextConfig = {
  basePath: APP_BASE_PATH,
  async redirects() {
    return [
      // Bare subdomain → /cashflow. basePath: false keeps the source as `/`,
      // not `/cashflow/`.
      { source: "/", destination: APP_BASE_PATH, basePath: false, permanent: false },
    ];
  },
};

export default nextConfig;
