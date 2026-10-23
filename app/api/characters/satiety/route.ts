import { NextResponse } from "next/server"

import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { readCharacterSatieties, satietyAvailable, updateCharacterSatiety } from "@/lib/character-satiety"
import { getCharacterForMj, getCharacterForUser, listCampaignMembers, listCharactersForUser } from "@/lib/google-sheets"
import { parseSatietyAction } from "@/lib/satiety"
import { authorizedAccount, type AuthorizedUser } from "@/lib/server-auth"
import { campaignReader } from "@/lib/session-access"

const MAX_CHARACTERS = 40

function characterIds(raw: unknown) {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []
  const ids = [...new Set(list.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter((id) => id && id.length <= 120))]
  return ids.length && ids.length <= MAX_CHARACTERS ? ids : null
}

/** Le joueur de la fiche, son MJ (ou un MJ qui y joue) et les administrateurs. */
async function ownsOrLeads(account: AuthorizedUser, id: string) {
  if (account.role === "admin") return true
  const found = account.role === "mj" ? await getCharacterForMj(account.uid, id).catch(() => null) : await getCharacterForUser(account.uid, id).catch(() => null)
  return Boolean(found)
}

/**
 * Depuis le journal d'une session : son MJ (ou un admin) pour les personnages de la campagne,
 * et chaque joueur présent pour les personnages présents. Ce qu'on peut toucher, ou `null`.
 */
async function sessionScope(account: AuthorizedUser, campaignId: string, sessionId: string) {
  const reader = await campaignReader(campaignId)
  if (!reader) return null
  if (reader.manager) return new Set((await listCampaignMembers(campaignId).catch(() => [])).map((member) => member.id))
  const session = (await listCampaignSessionsForDisplay(campaignId).catch(() => [])).find((entry) => entry.id === sessionId)
  if (!session) return null
  const present = new Set(session.characterIds)
  const mine = await listCharactersForUser(account.uid).catch(() => [])
  return mine.some((character) => present.has(character.id)) ? present : null
}

export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!satietyAvailable()) return NextResponse.json({ available: false, records: {} })
  const ids = characterIds(new URL(request.url).searchParams.get("ids"))
  if (!ids) return NextResponse.json({ error: "Personnages illisibles." }, { status: 400 })
  const allowed = await Promise.all(ids.map((id) => ownsOrLeads(account, id)))
  if (allowed.some((ok) => !ok)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  return NextResponse.json({ available: true, records: await readCharacterSatieties(ids) })
}

/**
 * Une action sur la barre de rassasiement d'un ou plusieurs personnages : une nuit, une
 * ellipse (avec ou sans repas), ou des charges réglées à la main. Chaque barre est relue
 * avant d'être changée ; celles qui n'ont pas pu l'être sont rendues dans `failed`.
 */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  if (!satietyAvailable()) return NextResponse.json({ error: "Le serveur partagé est injoignable : la barre de rassasiement ne peut pas être enregistrée." }, { status: 503 })
  const body = (await request.json().catch(() => null)) as { characterIds?: unknown; action?: unknown; campaignId?: unknown; sessionId?: unknown } | null
  const ids = characterIds(body?.characterIds)
  const action = parseSatietyAction(body?.action)
  if (!ids || !action) return NextResponse.json({ error: "Cette action est illisible : actualise la page." }, { status: 400 })
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId : ""
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : ""
  const scope = campaignId && sessionId ? await sessionScope(account, campaignId, sessionId) : null
  const allowed = await Promise.all(ids.map(async (id) => scope?.has(id) || await ownsOrLeads(account, id)))
  if (allowed.some((ok) => !ok)) return NextResponse.json({ error: "Tu ne peux pas changer la barre de ces personnages." }, { status: 403 })
  const results = await Promise.all(ids.map(async (id) => [id, await updateCharacterSatiety(id, action).catch((error) => {
    console.error("CHARACTER_SATIETY_WRITE_FAILED", id, error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return null
  })] as const))
  const records = Object.fromEntries(results.filter(([, state]) => state))
  const failed = results.flatMap(([id, state]) => state ? [] : [id])
  if (!Object.keys(records).length) return NextResponse.json({ error: "La barre de rassasiement n’a pas pu être enregistrée.", failed }, { status: 503 })
  return NextResponse.json({ records, failed })
}
