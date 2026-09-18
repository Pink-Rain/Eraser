import { NextResponse } from "next/server"

import { APPS_SCRIPT_CLOUD_PROJECT_REQUIRED } from "@/lib/google-apps-script"
import { syncClassImagesFromDrive } from "@/lib/google-sheets"
import { authorizedAccount } from "@/lib/server-auth"

export async function POST() {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  try {
    const result = await syncClassImagesFromDrive()
    return NextResponse.json({
      ok: true,
      matched: result.matched.length,
      placeholders: result.placeholders.length,
      unmatchedClasses: result.unmatchedClasses,
      unusedFiles: result.unusedFiles,
      updated: result.updated,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED")
      ? "Reconnecte d’abord le compte Google dédié."
      : code.includes("CLASS_IMAGES_FOLDER_NOT_FOUND")
        ? "Le dossier « Images Classe » est introuvable dans le Drive connecté."
        : code.includes("CLASSES_SHEET_NOT_CONFIGURED")
          ? "Crée d’abord la feuille Classes."
          : code.includes(APPS_SCRIPT_CLOUD_PROJECT_REQUIRED)
            ? "Relie le script d’images au projet Google Cloud Eraser depuis la page d’administration."
            : "Les images n’ont pas pu être reliées pour le moment."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
