import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import { companionState, installCompanion, openBrowserExtensions, openCompanionFolder, pickCompanionFolder, rememberCompanionFolder } from "@/lib/roll20-companion"

/**
 * Le compagnon Roll20 sur ce PC (dossier du compagnon, mise à jour en un clic, page des
 * extensions du navigateur) : pour le MJ et l'admin, dans l'application Windows. Le pont lui-même
 * (`/api/roll20/bridge`) reste à part, authentifié par la clé de la campagne.
 */
function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ""
  if (code === "COMPANION_INSTALL_UNAVAILABLE") return "Seule l’application Eraser pour Windows peut ranger le compagnon sur ce PC."
  if (code === "COMPANION_FOLDER_MISSING") return "Le dossier du compagnon est introuvable : mets d’abord le compagnon à jour (étape 1)."
  if (code === "COMPANION_FOLDER_INVALID") return "Ce dossier n’est pas utilisable."
  console.error("ROLL20_COMPANION_FAILED", code || "UNKNOWN_ERROR")
  if (/EPERM|EACCES/.test(code)) return "Windows refuse d’écrire dans ce dossier : choisis-en un autre (dans Documents, par exemple)."
  return "Le compagnon n’a pas pu être mis à jour sur ce PC."
}

export async function GET() {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json(await companionState(), { headers: { "cache-control": "no-store" } })
}

export async function POST(request: Request) {
  if (!await authorizedAccount(["admin", "mj"])) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; browser?: unknown }
    // Étape 1 : écrire les fichiers du compagnon dans son dossier.
    if (body.action === "install") return NextResponse.json(await installCompanion())
    // Choisir (ou retrouver) le dossier où le navigateur charge le compagnon.
    if (body.action === "choose-folder") {
      const chosen = await pickCompanionFolder()
      if (!chosen) return NextResponse.json({ ...(await companionState()), cancelled: true })
      return NextResponse.json(await rememberCompanionFolder(chosen))
    }
    if (body.action === "open-folder") {
      await openCompanionFolder()
      return NextResponse.json({ ok: true })
    }
    // Étape 2 : Chrome ou Opera ouvert sur sa page des extensions.
    if (body.action === "open-browser" && (body.browser === "chrome" || body.browser === "opera")) {
      return NextResponse.json({ opened: openBrowserExtensions(body.browser) })
    }
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 })
  }
}
