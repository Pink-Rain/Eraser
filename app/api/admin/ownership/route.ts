import { NextResponse } from "next/server"

import { updateAdminItemOwner } from "@/lib/google-sheets"
import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"

export async function POST(request: Request) {
  if (!(await authorizedAccount(["admin"]))) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  }

  try {
    const body = (await request.json()) as { kind?: unknown; id?: unknown; ownerUid?: unknown; ownerUids?: unknown }
    if ((body.kind !== "character" && body.kind !== "campaign") || typeof body.id !== "string") {
      return NextResponse.json({ error: "La demande est invalide." }, { status: 400 })
    }
    // Plusieurs propriétaires (`ownerUids`) ; `ownerUid` seul reste accepté.
    const owners = Array.isArray(body.ownerUids) ? body.ownerUids : body.ownerUid === null || body.ownerUid === undefined ? [] : [body.ownerUid]
    if (owners.length > 20 || owners.some((uid) => typeof uid !== "string")) {
      return NextResponse.json({ error: "Le propriétaire est invalide." }, { status: 400 })
    }
    await updateAdminItemOwner(body.kind, body.id, owners as string[], await currentAuthToken())
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "OWNER_NOT_FOUND"
      ? "Ce compte n’existe plus."
      : code.includes("SHEET") || code.includes("GOOGLE")
        ? "La feuille Google n’a pas pu être mise à jour. Vérifie la connexion Google Drive."
        : "Le propriétaire n’a pas pu être modifié."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
