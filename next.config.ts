import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build for the Docker image (see Dockerfile).
  output: "standalone",
  // Allow opening the dev server via the LAN IP (e.g. from another machine or
  // when services on this host address it as 192.168.1.21 instead of localhost).
  allowedDevOrigins: ["192.168.1.21"],
};

export default nextConfig;
