import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The packaged desktop build is emitted as a self-contained Node server.
  ...(process.env.ERASER_DESKTOP === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
