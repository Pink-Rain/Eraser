/**
 * Le créateur de pages côté serveur : qui lit une page (son rôle, sa campagne), les pages
 * d'une section pour sa page menu, et leurs liens pour la recherche (Ctrl + K). Les règles
 * elles-mêmes sont dans lib/custom-pages.ts.
 */
import { getCampaignForMj, getCampaignForPlayer, listAllCampaignsForAdmin, listCampaignsForMj, listCampaignsForPlayer } from "@/lib/google-sheets"
import { canEditPage, canReadPage, pageHref, placeLabel, type CustomPage, type PageAuthor, type PagePlace, type PageViewer } from "@/lib/custom-pages"
import { listCustomPages } from "@/lib/custom-pages-store"
import type { AuthorizedUser } from "@/lib/server-auth"

export function pageAuthor(account: Pick<AuthorizedUser, "uid" | "displayName" | "email">): PageAuthor {
  return { uid: account.uid, name: account.displayName || account.email || "Quelqu’un" }
}

/** Le compte est-il de cette campagne (`member` : son MJ, ou un joueur qui y a un personnage ; `manager` : son MJ) ? */
export async function campaignMembership(account: Pick<AuthorizedUser, "uid" | "role">, campaignId: string) {
  if (!campaignId) return { member: false, manager: false }
  if (account.role === "admin") return { member: true, manager: true }
  if (account.role === "mj" && await getCampaignForMj(account.uid, campaignId).catch(() => null)) return { member: true, manager: true }
  return { member: Boolean(await getCampaignForPlayer(account.uid, campaignId).catch(() => null)), manager: false }
}

/** Le lecteur d'une page : son rôle (la vue choisie), et pour une page de campagne s'il en est. */
export async function viewerFor(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">, page?: Pick<CustomPage, "place" | "campaignId">): Promise<PageViewer> {
  const membership = page?.place === "campagne" ? await campaignMembership(account, page.campaignId) : { member: false, manager: false }
  return { role: account.role, uid: account.uid, name: pageAuthor(account).name, ...membership }
}

/** Les campagnes du compte : toutes pour un administrateur, les siennes (MJ ou joueur) sinon. */
export async function campaignsOf(account: Pick<AuthorizedUser, "uid" | "role">) {
  if (account.role === "admin") return (await listAllCampaignsForAdmin().catch(() => [])).map((campaign) => ({ id: campaign.id, name: campaign.name, mine: true }))
  const [own, played] = await Promise.all([
    account.role === "mj" ? listCampaignsForMj(account.uid).catch(() => []) : Promise.resolve([]),
    listCampaignsForPlayer(account.uid).catch(() => []),
  ])
  const seen = new Map<string, { id: string; name: string; mine: boolean }>()
  for (const campaign of own) seen.set(campaign.id, { id: campaign.id, name: campaign.name, mine: true })
  for (const campaign of played) if (!seen.has(campaign.id)) seen.set(campaign.id, { id: campaign.id, name: campaign.name, mine: false })
  return [...seen.values()]
}

/**
 * Les pages que le compte peut lire, avec ses droits : une seule lecture des campagnes pour
 * toutes les pages de campagne. `editableOnly` : celles qu'il peut aussi modifier.
 */
export async function readablePages(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">, options: { includeDrafts?: boolean } = {}) {
  const pages = (await listCustomPages().catch(() => [])).filter((page) => !page.trashedAt)
  if (!pages.length) return []
  const needsCampaigns = account.role !== "admin" && pages.some((page) => page.place === "campagne")
  const campaigns = needsCampaigns ? new Map((await campaignsOf(account)).map((campaign) => [campaign.id, campaign])) : null
  const base = { role: account.role, uid: account.uid, name: pageAuthor(account).name }
  const admin = account.role === "admin"
  return pages.flatMap((page) => {
    const campaign = page.place === "campagne" ? campaigns?.get(page.campaignId) : undefined
    const viewer: PageViewer = { ...base, member: page.place === "campagne" && (admin || Boolean(campaign)), manager: page.place === "campagne" && (admin || Boolean(campaign?.mine)) }
    if (!canReadPage(page, viewer)) return []
    // Un brouillon n'est listé (menus, recherche) que si on le demande.
    if (!options.includeDrafts && (page.status !== "publiee" || !page.published)) return []
    return [{ page, viewer, editable: canEditPage(page, viewer) }]
  })
}

/** Les pages d'une section (ou d'une campagne), publiées et visibles du compte, par titre. */
export async function pagesOfPlace(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">, place: PagePlace, campaignId = "") {
  return (await readablePages(account))
    .filter(({ page }) => page.place === place && (place !== "campagne" || page.campaignId === campaignId))
    .map(({ page }) => ({ id: page.id, title: page.published?.title ?? page.title, description: page.published?.description ?? page.description, icon: page.published?.icon ?? page.icon, emoji: page.published?.emoji ?? page.emoji, href: pageHref(page) }))
    .sort((left, right) => left.title.localeCompare(right.title, "fr"))
}

/** Les pages publiées visibles du compte, pour la recherche (Ctrl + K) et le fil d'Ariane. */
export async function pageLinkTargets(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">) {
  return (await readablePages(account)).map(({ page }) => ({ label: page.published?.title ?? page.title, href: pageHref(page), group: "Pages", hint: placeLabel(page.place) }))
}
