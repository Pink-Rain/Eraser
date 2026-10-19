import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The packaged desktop build is emitted as a self-contained Node server.
  ...(process.env.ERASER_DESKTOP === "1" ? { output: "standalone" } : {}),
  // Autorise le relevé de fluidité à noter, pendant un gros gel de l'écran, les fonctions qui
  // tournaient (JS Self-Profiling, lib/fluidity-journal.ts). Rien n'est envoyé ailleurs.
  async headers() {
    const headers = [{ key: "Document-Policy", value: "js-profiling" }];
    // « /:path* » ne couvre pas l'accueil, où s'ouvre Eraser.
    return [{ source: "/", headers }, { source: "/:path*", headers }];
  },
};

export default nextConfig;
