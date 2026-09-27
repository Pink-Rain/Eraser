import { NextResponse } from "next/server"

import { clearAuthCookies } from "@/lib/auth-cookies"
import { currentAccount, currentAuthToken } from "@/lib/server-auth"
import { deleteOwnPendingAccount } from "@/lib/site-auth"

/** Supprime son propre compte, seulement s'il est encore en attente de validation. */
export async function DELETE() {
  const [account, token] = await Promise.all([currentAccount(), currentAuthToken()])
  if (!account || !token) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    await deleteOwnPendingAccount(account, token)
    const response = NextResponse.json({ ok: true })
    clearAuthCookies(response)
    return response
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "ACCOUNT_NOT_PENDING" ? "Seul un compte encore en attente peut être supprimé ici." : "Le compte n’a pas pu être supprimé." }, { status: 400 })
  }
}
