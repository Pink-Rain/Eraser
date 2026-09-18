import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop build is emitted as a self-contained Node server. The regular
  // Sites/Cloudflare build deliberately keeps its existing output unchanged.
  ...(process.env.ERASER_DESKTOP === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
