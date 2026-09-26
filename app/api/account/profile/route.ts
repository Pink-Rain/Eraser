import { NextResponse } from "next/server"

import { currentAccount, currentAuthToken } from "@/lib/server-auth"
import { sharedStoreAvailable, writeSharedRecord } from "@/lib/shared-store"
import { updateOwnProfile } from "@/lib/site-auth"

const messages: Record<string, string> = {
  INVALID_DISPLAY_NAME: "Le pseudo doit faire entre 2 et 80 caractères.",
  INVALID_EMAIL: "Cette adresse e-mail n’est pas valide.",
  INVALID_NEW_PASSWORD: "Le nouveau mot de passe doit faire au moins 8 caractères.",
  INVALID_CURRENT_PASSWORD: "Le mot de passe actuel est incorrect.",
  EMAIL_EXISTS: "Un autre compte utilise déjà cette adresse.",
}

export async function POST(request: Request) {
  const [account, token] = await Promise.all([currentAccount(), currentAuthToken()])
  if (!account || !token) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const body = (await request.json()) as Record<string, unknown>
    const text = (key: string) => typeof body[key] === "string" ? body[key] as string : undefined
    const updated = await updateOwnProfile(account.uid, token, {
      displayName: text("displayName"),
      email: text("email"),
      currentPassword: text("currentPassword"),
      newPassword: text("newPassword") || undefined,
    })
    // L’annuaire des noms du chat suit le nouveau pseudo.
    if (updated.displayName !== account.displayName && sharedStoreAvailable()) {
      await writeSharedRecord("account-names", updated.uid, updated.displayName).catch(() => undefined)
    }
    return NextResponse.json({ ok: true, account: { uid: updated.uid, email: updated.email, displayName: updated.displayName } })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: messages[code] || "Le compte n’a pas pu être modifié." }, { status: 400 })
  }
}
