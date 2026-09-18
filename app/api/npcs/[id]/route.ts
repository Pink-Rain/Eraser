import { NextResponse } from "next/server"

import { getCampaignDashboard, getNpcById, saveNpc } from "@/lib/google-sheets"
import { saveNpcPortrait } from "@/lib/npc-portraits"
import { authorizedAccount } from "@/lib/server-auth"

async function authorizedNpc(id: string) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) return null
  const npc = await getNpcById(id)
  if (!npc) return null
  if (npc.pageLinked === "bac-a-sable") return { account, npc }
  const campaign = await getCampaignDashboard(account.role === "admin" ? null : account.uid, npc.pageLinked).catch(() => null)
  return campaign ? { account, npc } : null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await authorizedNpc(id)
  if (!access) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  try {
    const form = await request.formData()
    const file = form.get("portrait")
    if (!(file instanceof File)) throw new Error("INVALID_PORTRAIT")
    const portrait = await saveNpcPortrait(id, file)
    const npc = await saveNpc(access.npc.pageLinked, { ...access.npc, portrait })
    return NextResponse.json({ npc })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    return NextResponse.json({ error: code === "INVALID_PORTRAIT" ? "Choisis une image de moins de 10 Mo." : "Le portrait n’a pas pu être enregistré." }, { status: 400 })
  }
}
