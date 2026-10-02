import { NextResponse } from "next/server"

import { performanceReport } from "@/lib/perf-trace"
import { authorizedAccount } from "@/lib/server-auth"

/** Le relevé des lenteurs du serveur local (Google, serveur partagé), pour l'administration. */
export async function GET() {
  const account = await authorizedAccount(["admin"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json(performanceReport(), { headers: { "cache-control": "no-store" } })
}
