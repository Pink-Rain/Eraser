import { NextResponse } from "next/server"

import type { SiteRole } from "@/lib/auth-types"
import { extensionRoleOrder, linkedExtension } from "@/lib/extensions"
import { updateExtension } from "@/lib/extensions-install"
import { listExtensionSettings, saveExtensionRoles } from "@/lib/extensions-store"
import { extensionsOverview, syncExtensions } from "@/lib/extensions-sync"
import { authorizedAccount } from "@/lib/server-auth"

const refused = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })

/** Administration › Extensions : les extensions liées, leurs versions et qui les reçoit. */
export async function GET() {
  if (!await authorizedAccount(["admin"])) return refused()
  return NextResponse.json(await extensionsOverview())
}

/** Qui reçoit une extension : `{ id, roles }`. */
export async function PATCH(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return refused()
  const body = await request.json().catch(() => ({})) as { id?: unknown; roles?: unknown }
  const definition = typeof body.id === "string" ? linkedExtension(body.id) : null
  if (!definition || !Array.isArray(body.roles)) return NextResponse.json({ error: "Extension inconnue." }, { status: 400 })
  const roles = extensionRoleOrder.filter((role) => (body.roles as unknown[]).includes(role))
  try {
    const settings = await saveExtensionRoles(definition.id, roles as SiteRole[])
    // Cochée pour son propre rôle : elle arrive tout de suite sur l'ordinateur de l'admin.
    if (settings[definition.id]?.roles.includes(admin.accountRole)) void updateExtension(definition).catch(() => undefined)
    return NextResponse.json({ roles: settings[definition.id]?.roles ?? [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    return NextResponse.json({
      error: message === "EXTENSION_SETTINGS_UNAVAILABLE" ? "Le serveur partagé n'est pas configuré : ce choix ne peut pas être gardé." : "Le choix n'a pas pu être enregistré.",
    }, { status: 503 })
  }
}

/** `{ action: "check" }` : relit GitHub et met à jour, sur cet ordinateur, les extensions de l'admin. */
export async function POST(request: Request) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return refused()
  const body = await request.json().catch(() => ({})) as { action?: unknown }
  if (body.action !== "check") return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
  // D'abord relire GitHub pour toutes, puis installer celles de l'admin depuis cette lecture.
  await extensionsOverview({ force: true })
  await syncExtensions(admin.accountRole, await listExtensionSettings())
  return NextResponse.json(await extensionsOverview())
}
