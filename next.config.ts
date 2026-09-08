import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "@libsql/client", "libsql"],
};

export default nextConfig;
