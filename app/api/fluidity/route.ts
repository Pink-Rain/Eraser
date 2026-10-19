import { NextResponse } from "next/server"

import { googleQuotaPauseMs } from "@/lib/google-quota"
import { performanceReport } from "@/lib/perf-trace"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Le relevé du serveur local joint au relevé de fluidité (« Copier le relevé ») : le temps de
 * Google et du serveur partagé, les refus de quota. Chaque compte, joueurs compris : c'est leur
 * propre installation. Rien de personnel (les identifiants longs sont raccourcis).
 */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ ...performanceReport(), quotaPauseMs: googleQuotaPauseMs() }, { headers: { "cache-control": "no-store" } })
}
