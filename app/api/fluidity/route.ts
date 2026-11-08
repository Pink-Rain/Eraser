import { NextResponse } from "next/server"

import { readInstalledExtension } from "@/lib/extensions-install"
import { linkedExtensions } from "@/lib/extensions"
import { googleQuotaPauseMs } from "@/lib/google-quota"
import { performanceReport } from "@/lib/perf-trace"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Le relevé du serveur local joint au relevé de fluidité (« Copier le relevé ») : le temps de
 * Google et du serveur partagé, les refus de quota, et les extensions installées avec leur
 * version (celle sur le disque, `null` si elle n'est pas installée). Chaque compte, joueurs
 * compris : c'est leur propre installation. Rien de personnel (les identifiants longs sont
 * raccourcis).
 */
export async function GET() {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const extensions = await Promise.all(linkedExtensions.map(async (extension) => {
    const installed = await readInstalledExtension(extension.id).catch(() => null)
    return { id: extension.id, version: installed?.version ?? null }
  }))
  return NextResponse.json({ ...performanceReport(), quotaPauseMs: googleQuotaPauseMs(), extensions }, { headers: { "cache-control": "no-store" } })
}
