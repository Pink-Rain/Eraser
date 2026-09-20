import { NextResponse } from "next/server"

import { authorizedAccount, currentAuthToken } from "@/lib/server-auth"
import { deleteAccount } from "@/lib/site-auth"

export async function DELETE(_request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const admin = await authorizedAccount(["admin"])
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })

  const { uid } = await params
  if (!uid) return NextResponse.json({ error: "Compte invalide." }, { status: 400 })

  try {
    await deleteAccount(uid, admin.uid, await currentAuthToken())
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "CANNOT_DELETE_SELF"
      ? "Tu ne peux pas supprimer ton propre compte."
      : code === "ACCOUNT_NOT_FOUND"
        ? "Ce compte n’existe plus."
        : code === "ACCOUNT_REFERENCED"
          ? "Ce compte a connecté Google Drive ou configuré la connexion Google : relie un autre compte avant de le supprimer."
          : "Le compte n’a pas pu être supprimé."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
