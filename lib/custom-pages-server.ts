/**
 * Le créateur de pages côté serveur : qui lit une page (son rôle, sa campagne), les pages
 * d'une section pour sa page menu, et leurs liens pour la recherche (Ctrl + K). Les règles
 * elles-mêmes sont dans lib/custom-pages.ts.
 */
import { getCampaignForMj, getCampaignForPlayer, listAllCampaignsForAdmin, listCampaignsForMj, listCampaignsForPlayer } from "@/lib/google-sheets"
import { canEditPage, canManagePages, canReadPage, pageForViewer, pageHref, placeLabel, type CustomPage, type PageAuthor, type PagePlace, type PageView, type PageViewer } from "@/lib/custom-pages"
import { listCustomPages } from "@/lib/custom-pages-store"
import type { BlockDataOptions, IndexSource } from "@/lib/custom-pages-data"
import { rowPageHref, templateForRow } from "@/lib/custom-pages-rows"
import { resolveMenu, type MenuPageEntry, type ResolvedMenuItem } from "@/lib/app-menu"
import { readMenuLayout } from "@/lib/app-menu-store"
import { listCustomIndexes } from "@/lib/custom-indexes"
import { entityColumnHiddenForPlayers } from "@/lib/index-references-entities"
import { isForbiddenReplacement, matchesReplacement } from "@/lib/page-replacements"
import type { AuthorizedUser } from "@/lib/server-auth"
import { worldIndexDefinitions, type WorldIndexKey } from "@/lib/world-index-definitions"
import { getWorldIndexQuick } from "@/lib/world-indexes"

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

/* ---------- Index : leurs données, côté serveur ---------- */

/** Un index du monde tel que les blocs le lisent (la copie gardée en mémoire : aucune lecture Google de plus si elle est là). */
export async function indexSourceOf(key: WorldIndexKey): Promise<IndexSource> {
  const data = await getWorldIndexQuick(key)
  return {
    key,
    title: data.definition.title,
    path: data.definition.path,
    nameHref: data.definition.entity?.nameHref,
    nameHeader: data.definition.entity?.nameHeader,
    tables: data.tables.map((table) => ({ tabName: table.tabName, headers: table.headers, rows: table.rows })),
    columns: data.columns,
  }
}

/** Ce qu'un lecteur peut lire d'un index : colonnes privées des entités retirées pour un joueur. */
export function readOptions(key: string, player: boolean, rowPageOf?: BlockDataOptions["rowPageOf"]): BlockDataOptions {
  return { player, hiddenForPlayers: (column) => entityColumnHiddenForPlayers(key, column), rowPageOf }
}

/**
 * Les modèles de page de ligne que le compte peut lire (publiés) : pour lier chaque ligne à
 * sa page, partout où elle apparaît (vues des pages, fiche de l'index).
 */
export async function rowTemplates(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">) {
  return (await readablePages(account)).filter(({ page }) => page.rowOf?.index).map(({ page }) => page)
}

/** Le lien de la page d'une ligne, si un modèle publié et lisible existe pour son index (et son onglet). */
export async function rowPageResolver(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">) {
  const templates = await rowTemplates(account).catch(() => [])
  if (!templates.length) return undefined
  return (index: string, tab: string, id: string) => templateForRow(templates, index, tab) ? rowPageHref(index, id) : undefined
}

/** Les index où chercher les lignes qui en citent une autre : ceux du monde (pas les entités, lues à part). */
export async function backlinkSources() {
  const keys: WorldIndexKey[] = [
    ...(Object.values(worldIndexDefinitions).filter((definition) => !definition.entity).map((definition) => definition.key) as WorldIndexKey[]),
    ...((await listCustomIndexes().catch(() => [])).map((entry) => entry.key) as WorldIndexKey[]),
  ]
  return (await Promise.all(keys.map((key) => indexSourceOf(key).catch(() => null)))).filter((source): source is IndexSource => Boolean(source))
}

/* ---------- Le menu ---------- */

/**
 * Le menu tel que le voit ce compte (sa vue) : celui réglé dans l'éditeur, sinon celui
 * d'Eraser, avec les pages publiées et lisibles de chaque section sous la section (Règles,
 * Index, Bac à sable, Administration) et celles d'une campagne sous son dossier. Une lecture
 * du serveur partagé gardée en mémoire ; aucune de Google.
 */
export async function shellMenu(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">): Promise<ResolvedMenuItem[]> {
  const [layout, readable] = await Promise.all([readMenuLayout().catch(() => null), readablePages(account).catch(() => [])])
  const pages: Record<string, MenuPageEntry> = {}
  const sectionPages: Record<string, MenuPageEntry[]> = {}
  const campaignPages: Record<string, MenuPageEntry[]> = {}
  for (const { page } of readable) {
    const content = page.published ?? page
    const entry: MenuPageEntry = { title: content.title, href: pageHref(page), icon: content.icon, emoji: content.emoji }
    pages[page.id] = entry
    // Une page de ligne d'index ou qui remplace une page d'Eraser n'est pas une entrée de section.
    if (page.rowOf?.index || page.replaces) continue
    if (page.place === "campagne") (campaignPages[page.campaignId] ??= []).push(entry)
    else if (page.place !== "hors-menu") (sectionPages[page.place] ??= []).push(entry)
  }
  for (const list of [...Object.values(sectionPages), ...Object.values(campaignPages)]) list.sort((left, right) => left.title.localeCompare(right.title, "fr"))
  return resolveMenu(layout?.items ?? null, { role: account.role, pages, sectionPages, campaignPages })
}

/* ---------- Pages d'Eraser remplacées ou complétées ---------- */

/**
 * La page du créateur de pages qui remplace ou complète l'adresse demandée, telle que ce
 * compte la lit (publiée, ouverte à son rôle) ; `null` : la page d'Eraser telle quelle.
 */
export async function replacementFor(pathname: string, account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">) {
  if (!pathname || isForbiddenReplacement(pathname)) return null
  const candidates = (await listCustomPages().catch(() => [])).filter((page) => !page.trashedAt && page.status === "publiee" && page.published && page.replaces && matchesReplacement(page.replaces, pathname))
  for (const page of candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const view = pageForViewer(page, await viewerFor(account, page))
    if (view) return { page, view, mode: page.replaceMode ?? "after" }
  }
  return null
}

/** Les pages vers lesquelles mènent les blocs Lien d'une page : seulement celles que le lecteur peut ouvrir. */
export async function linkTargetsOf(view: PageView, account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">) {
  const linked = new Set(view.sections.flatMap((section) => section.cols.flat()).flatMap((block) => block.type === "link" && block.pageId ? [block.pageId] : []))
  const links: Record<string, { title: string; href: string; icon: string; emoji: string; description: string }> = {}
  if (!linked.size) return links
  for (const { page: target } of await readablePages(account, { includeDrafts: canManagePages(account.role) })) {
    if (!linked.has(target.id)) continue
    const content = target.status === "publiee" && target.published ? target.published : target
    links[target.id] = { title: content.title, href: pageHref(target), icon: content.icon, emoji: content.emoji, description: content.description }
  }
  return links
}

/** L'adresse de l'index de chaque bloc Vue (MJ et admins : les joueurs n'ont pas accès aux index). */
export function indexPathsOf(view: PageView, role: PageViewer["role"]) {
  const paths: Record<string, string> = {}
  if (!canManagePages(role)) return paths
  for (const block of view.sections.flatMap((section) => section.cols.flat())) {
    if (block.type !== "view" || !block.index) continue
    paths[block.index] = (worldIndexDefinitions as Record<string, { path: string } | undefined>)[block.index]?.path ?? `/ressources/index/${encodeURIComponent(block.index)}`
  }
  return paths
}
