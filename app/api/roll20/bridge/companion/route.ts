import { NextResponse } from "next/server"

import { companionState } from "@/lib/roll20-companion"

const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" }

/**
 * Pour le compagnon lui-même (sans clé ni cookie : rien de privé) : la version livrée avec Eraser
 * et celle rangée dans son dossier sur ce PC. Plus récente que la sienne, le compagnon se recharge
 * tout seul depuis ce dossier.
 */
export async function GET() {
  const state = await companionState()
  return NextResponse.json({ version: state.version, folderVersion: state.folderVersion }, { headers })
}
