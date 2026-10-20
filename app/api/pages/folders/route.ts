import { NextResponse } from "next/server"

import { canBuildPages } from "@/lib/custom-pages"
import { PageStoreError } from "@/lib/custom-pages-store"
import { pageAuthor } from "@/lib/custom-pages-server"
import { cleanFolderOp, FOLDER_LIMITS } from "@/lib/page-folders"
import { readPageFolders, updatePageFolders } from "@/lib/page-folders-store"
import { authorizedAccount } from "@/lib/server-auth"

const denied = () => NextResponse.json({ error: "Accès refusé." }, { status: 403 })

function failure(error: unknown) {
  if (error instanceof PageStoreError) return NextResponse.json({ error: error.userMessage, code: error.code }, { status: error.status })
  console.error("PAGE_FOLDERS_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
  return NextResponse.json({ error: "Le rangement n’a pas pu être enregistré sur le serveur partagé d’Eraser." }, { status: 502 })
}

/** Le rangement des pages en dossiers (créateur de pages : administrateurs). */
export async function GET() {
  const account = await authorizedAccount(["admin"])
  if (!account || !canBuildPages(account.role)) return denied()
  try {
    return NextResponse.json({ folders: await readPageFolders() })
  } catch (error) {
    return failure(error)
  }
}

/** { ops } : créer, renommer, déplacer, supprimer un dossier, ranger des pages ; rend le rangement enregistré. */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin"])
  if (!account || !canBuildPages(account.role)) return denied()
  let body: { ops?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Requête illisible." }, { status: 400 }) }
  const ops = (Array.isArray(body.ops) ? body.ops : []).slice(0, FOLDER_LIMITS.ops).flatMap((op) => { const clean = cleanFolderOp(op); return clean ? [clean] : [] })
  if (!ops.length) return NextResponse.json({ error: "Rien à ranger." }, { status: 400 })
  try {
    return NextResponse.json({ folders: await updatePageFolders(ops, pageAuthor(account).name) })
  } catch (error) {
    return failure(error)
  }
}
