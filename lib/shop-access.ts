import { listCampaignSessionsForDisplay } from "@/lib/campaign-sessions"
import { listCampaignMembers, listCharactersForUser, listSavedShops } from "@/lib/google-sheets"
import { campaignReader } from "@/lib/session-access"
import { revealedSession } from "@/lib/session-reveal"
export { shopForPlayers } from "@/lib/shop-purchase"

/** Les magasins d'une session : les siens, et les marchés ambulants rangés parmi ses événements. */
export const sessionShopIds = (session: { shopIds: string[]; eventIds: string[] }) => [...session.shopIds, ...session.eventIds.filter((entry) => entry.startsWith("shop:")).map((entry) => entry.slice(5))]

/**
 * Qui ouvre un magasin d'une campagne : le MJ (et l'admin) tous ; un joueur, ceux entrés dans
 * une session et révélés par le MJ. `null` : pas d'accès (ou magasin introuvable).
 */
export async function shopAccess(campaignId: string, shopId: string) {
  const reader = await campaignReader(campaignId)
  if (!reader) return null
  const [shops, sessions] = await Promise.all([listSavedShops(campaignId), listCampaignSessionsForDisplay(campaignId)])
  const shop = shops.find((candidate) => candidate.id === shopId)
  if (!shop) return null
  const visible = reader.manager ? sessions : sessions.map(revealedSession)
  if (!reader.manager && !visible.some((session) => sessionShopIds(session).includes(shop.id))) return null
  return { ...reader, shop, sessions: visible }
}

export type ShopBuyer = { id: string; name: string }

/**
 * Pour qui le lecteur peut acheter : un joueur, ses personnages de la campagne (ceux présents
 * à la session d'abord, seuls s'il y en a) ; le MJ, les personnages de la session (ou de la
 * campagne si la session n'a pas de groupe).
 */
export async function shopBuyers(access: NonNullable<Awaited<ReturnType<typeof shopAccess>>>, sessionId: string): Promise<ShopBuyer[]> {
  const campaignId = access.campaign.id
  const [members, mine] = await Promise.all([
    listCampaignMembers(campaignId).catch(() => []),
    access.manager ? Promise.resolve([]) : listCharactersForUser(access.account.uid).catch(() => []),
  ])
  const session = access.sessions.find((candidate) => candidate.id === sessionId)
  const present = new Set(session?.characterIds ?? [])
  const own = new Set(mine.map((character) => character.id))
  const allowed = access.manager ? members : members.filter((member) => own.has(member.id))
  const here = allowed.filter((member) => present.has(member.id))
  return (here.length ? here : allowed).map((member) => ({ id: member.id, name: member.name }))
}
