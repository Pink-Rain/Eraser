import { NextResponse } from "next/server"

import { achievementsOf, grantAchievement, revokeAchievement } from "@/lib/achievements"
import type { AchievementBoard } from "@/lib/achievements-shared"
import { authorizedAccount, currentAuthToken, type AuthorizedUser } from "@/lib/server-auth"
import { listAccounts } from "@/lib/site-auth"

/** Un MJ ou un administrateur attribue les succès, quelle que soit la vue affichée. */
function canGrant(account: AuthorizedUser) {
  return account.accountRole === "admin" || account.accountRole === "mj"
}

async function activeAccounts() {
  const accounts = await listAccounts(await currentAuthToken().catch(() => undefined))
  return accounts.filter((account) => account.status === "actif")
}

/**
 * Les succès de l'index et ceux obtenus par un compte : le sien, ou celui d'un autre
 * (`uid`, pour un MJ ou un administrateur). `accounts=1` donne la liste des comptes à
 * qui attribuer un succès.
 */
export async function GET(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
  const url = new URL(request.url)
  try {
    if (url.searchParams.get("accounts") === "1") {
      if (!canGrant(account)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const accounts = (await activeAccounts()).map((candidate) => ({ uid: candidate.uid, name: candidate.displayName || candidate.email, role: candidate.role }))
      return NextResponse.json({ accounts: accounts.sort((left, right) => left.name.localeCompare(right.name, "fr")) })
    }
    const uid = url.searchParams.get("uid")?.trim() || account.uid
    let target = { uid: account.uid, displayName: account.displayName }
    if (uid !== account.uid) {
      if (!canGrant(account)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 })
      const found = (await activeAccounts()).find((candidate) => candidate.uid === uid)
      if (!found) return NextResponse.json({ error: "Ce compte est introuvable." }, { status: 404 })
      target = { uid: found.uid, displayName: found.displayName }
    }
    const board: AchievementBoard = { ...(await achievementsOf(target)), canGrant: canGrant(account) }
    return NextResponse.json(board)
  } catch (error) {
    console.error("ACHIEVEMENTS_LOAD_FAILED", error instanceof Error ? error.message : "UNKNOWN_ERROR")
    return NextResponse.json({ error: "Les succès n’ont pas pu être chargés depuis Google Sheets." }, { status: 503 })
  }
}

/**
 * MJ ou administrateur : `{ action: "grant", achievement, uid, note? }` attribue un
 * succès à un compte, `{ action: "revoke", id }` retire une attribution.
 */
export async function POST(request: Request) {
  const account = await authorizedAccount(["admin", "mj", "joueur"])
  if (!account || !canGrant(account)) return NextResponse.json({ error: "Seuls les MJ et les administrateurs attribuent les succès." }, { status: 403 })
  try {
    const body = (await request.json()) as { action?: unknown; achievement?: unknown; uid?: unknown; note?: unknown; id?: unknown }
    if (body.action === "revoke") {
      if (typeof body.id !== "string" || !body.id) throw new Error("ACHIEVEMENT_INVALID")
      await revokeAchievement(body.id)
      return NextResponse.json({ ok: true })
    }
    if (body.action !== "grant" || typeof body.achievement !== "string" || typeof body.uid !== "string") throw new Error("ACHIEVEMENT_INVALID")
    const player = (await activeAccounts()).find((candidate) => candidate.uid === body.uid)
    if (!player) throw new Error("ACHIEVEMENT_ACCOUNT_NOT_FOUND")
    const result = await grantAchievement({
      achievement: body.achievement,
      uid: player.uid,
      player: player.displayName || player.email,
      grantedBy: account.displayName || account.email,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
    })
    return NextResponse.json({ ok: true, created: result.created })
  } catch (error) {
    const code = error instanceof Error ? error.message : ""
    console.error("ACHIEVEMENT_SAVE_FAILED", code)
    const message = code === "ACHIEVEMENT_NOT_FOUND" ? "Ce succès n’est plus dans l’Index des succès."
      : code === "ACHIEVEMENT_ACCOUNT_NOT_FOUND" ? "Ce compte est introuvable ou désactivé."
        : code === "ACHIEVEMENT_GRANT_NOT_FOUND" ? "Cette attribution a déjà été retirée."
          : code === "ACHIEVEMENT_INVALID" ? "Demande incomplète."
            : "Le succès n’a pas pu être enregistré dans Google Sheets."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
