import { NextResponse } from "next/server"

import { companionState, recordCompanionSeen } from "@/lib/roll20-companion"

const headers = { "access-control-allow-origin": "*", "cache-control": "no-store" }

/**
 * Pour le compagnon lui-même (sans clé ni cookie : rien de privé) : la version livrée avec Eraser
 * et celle rangée dans son dossier sur ce PC ; il y signale la sienne et celle du script Mod. Plus récente que la sienne, le compagnon se recharge
 * tout seul depuis ce dossier.
 */
export async function GET(request: Request) {
  // Le compagnon dit aussi quelle version tourne dans le navigateur (et celle du script Mod) :
  // le dossier de campagne coche alors seul les étapes 2 et 3.
  const query = new URL(request.url).searchParams
  await recordCompanionSeen({ running: query.get("running"), mod: query.get("mod") }).catch(() => {})
  const state = await companionState()
  return NextResponse.json({ version: state.version, folderVersion: state.folderVersion }, { headers })
}
