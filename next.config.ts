import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["ffmpeg-static", "@libsql/client", "libsql"],
};

export default nextConfig;
