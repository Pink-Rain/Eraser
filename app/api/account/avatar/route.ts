import { NextResponse } from "next/server"

import { accountAvatarUrl, saveAccountAvatarFile, saveAccountAvatarFromUrl } from "@/lib/account-avatars"
import { currentAccount } from "@/lib/server-auth"

export async function POST(request: Request) {
  const account = await currentAccount()
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("avatar")
      if (!(file instanceof File)) throw new Error("INVALID_AVATAR")
      await saveAccountAvatarFile(account.uid, file)
    } else {
      const { url } = (await request.json()) as { url?: unknown }
      if (typeof url !== "string") throw new Error("INVALID_AVATAR_URL")
      await saveAccountAvatarFromUrl(account.uid, url)
    }
    return NextResponse.json({ ok: true, avatarUrl: `${accountAvatarUrl(account.uid)}?v=${Date.now()}` })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    const message = code === "INVALID_AVATAR" ? "Choisis une image de moins de 10 Mo."
      : code === "INVALID_AVATAR_URL" ? "Ce lien ne mène pas à une image accessible."
        : code.includes("GOOGLE_DRIVE_NOT_AUTHORIZED") ? "Le compte Google d’Eraser doit être reconnecté."
          : "L’avatar n’a pas pu être enregistré."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
