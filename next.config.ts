import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The packaged desktop build is emitted as a self-contained Node server.
  ...(process.env.ERASER_DESKTOP === "1" ? { output: "standalone" } : {}),
  // vinext prend tout envoi de fichiers (multipart), même vers /api/…, pour une « action serveur »
  // et le refusait au-delà de 1 Mo (413) : un document, un portrait ou un fond un peu lourds ne
  // pouvaient pas partir. Chaque route vérifie ensuite ses propres limites (15 Mo par image).
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  // Autorise le relevé de fluidité à noter, pendant un gros gel de l'écran, les fonctions qui
  // tournaient (JS Self-Profiling, lib/fluidity-journal.ts). Rien n'est envoyé ailleurs.
  async headers() {
    const headers = [{ key: "Document-Policy", value: "js-profiling" }];
    // « /:path* » ne couvre pas l'accueil, où s'ouvre Eraser.
    return [{ source: "/", headers }, { source: "/:path*", headers }];
  },
};

export default nextConfig;
