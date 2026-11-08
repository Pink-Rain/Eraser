import { NextResponse } from "next/server"

import { checkExtensionsNow } from "@/lib/extensions-sync"
import { authorizedAccount } from "@/lib/server-auth"

/**
 * « Chercher les mises à jour » de la barre latérale, pour tous les comptes : met à jour tout de
 * suite, sur cet ordinateur, les extensions que le compte reçoit (son vrai rôle).
 */
export async function POST() {
  const account = await authorizedAccount()
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    return NextResponse.json({ extensions: await checkExtensionsNow(account.accountRole) })
  } catch {
    return NextResponse.json({ error: "Les extensions n'ont pas pu être vérifiées." }, { status: 500 })
  }
}
