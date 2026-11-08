import { NextResponse } from "next/server"

import { extensionsOverview, syncExtensions } from "@/lib/extensions-sync"
import { authorizedAccount } from "@/lib/server-auth"

const refused = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })

/** Administration › Extensions : les extensions liées et leurs versions. */
export async function GET() {
  if (!await authorizedAccount(["admin"])) return refused()
  return NextResponse.json(await extensionsOverview())
}

/** `{ action: "check" }` : relit GitHub et met à jour, sur cet ordinateur, toutes les extensions. */
export async function POST(request: Request) {
  if (!await authorizedAccount(["admin"])) return refused()
  const body = await request.json().catch(() => ({})) as { action?: unknown }
  if (body.action !== "check") return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
  // D'abord relire GitHub pour toutes, puis installer depuis cette lecture.
  await extensionsOverview({ force: true })
  await syncExtensions()
  return NextResponse.json(await extensionsOverview())
}
