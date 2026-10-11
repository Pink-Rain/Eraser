import { NextResponse } from "next/server"

import { authorizedAccount } from "@/lib/server-auth"
import { prepareShopTypeTab } from "@/lib/shop-types-server"

/**
 * « Préparer l'onglet » Lieux › Magasin (admin) : colonnes et types d'Eraser ajoutés à
 * droite et en bas, rien d'effacé ni de déplacé.
 */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin"])
  if (!account) return NextResponse.json({ error: "Seul un admin peut préparer l’onglet Lieux › Magasin." }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  if (body.action !== "prepare") return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
  try {
    return NextResponse.json(await prepareShopTypeTab())
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("SHOP_TYPES_PREPARE_FAILED", code || "UNKNOWN_ERROR")
    return NextResponse.json({ error: `L’onglet Lieux › Magasin n’a pas pu être préparé.${code ? ` (${code.slice(0, 160)})` : ""}` }, { status: 502 })
  }
}
