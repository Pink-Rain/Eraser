import { NextResponse } from "next/server"

import { legacyCharacterListCells, restoreLegacyCharacterListCells, rewriteLegacyCharacterListCells } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * Les cases de fiches encore écrites en ancien JSON (`["Elfe"]`) : les voir, les réécrire en
 * texte lisible, ou annuler une réécriture. Administrateur seulement ; rien ne se fait sans
 * qu'il le demande.
 */
export async function GET() {
  if (!(await authorizedAccount(["admin"]))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const cells = await legacyCharacterListCells({ fresh: true }).catch(() => null)
  if (!cells) return NextResponse.json({ error: "La feuille des personnages n’a pas pu être lue." }, { status: 400 })
  return NextResponse.json({ cells: cells.map(({ characterName, header, before, after }) => ({ characterName, header, before, after })) })
}

export async function POST(request: Request) {
  if (!(await authorizedAccount(["admin"]))) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; backup?: unknown }
  try {
    if (body.action === "rewrite") {
      const { backup, cells } = await rewriteLegacyCharacterListCells()
      return NextResponse.json({ backup, rewritten: cells.length })
    }
    if (body.action === "restore" && typeof body.backup === "string" && body.backup) {
      return NextResponse.json(await restoreLegacyCharacterListCells(body.backup))
    }
    return NextResponse.json({ error: "La demande est invalide." }, { status: 400 })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "LIST_CELLS_BACKUP_UNAVAILABLE"
      ? "Le serveur partagé d’Eraser est injoignable : sans sauvegarde de l’ancien texte, rien n’a été réécrit."
      : code === "LIST_CELLS_BACKUP_NOT_FOUND"
        ? "La sauvegarde de cette réécriture est introuvable."
        : "La feuille des personnages n’a pas pu être mise à jour. Vérifie la connexion Google Drive."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
