/**
 * L'index des pages : toutes les pages qu'un lecteur peut ouvrir, celles faites dans l'atelier
 * comme celles d'Eraser (Règles, Classes, Index des créatures…), au même rang et sous les mêmes
 * colonnes. Le moteur des index s'en sert comme d'un index : cartes, listes, survols, et blocs
 * Vue d'index des pages (un menu de pages, une galerie de règles…).
 *
 * Il n'a pas de feuille Google : ses lignes sont faites à la demande depuis les pages du serveur
 * partagé et le menu d'Eraser. Une page d'Eraser remplacée par une page de l'atelier prend son
 * titre, son icône et sa description (c'est elle qu'on ouvre à cette adresse).
 */
import { allBlocks, canReadPage, pageHref, pageVisibilities, pageVisibleTo, placeLabel, type CustomPage, type PageContent, type PageRole } from "@/lib/custom-pages"
import { menuCatalog, type MenuIconKey } from "@/lib/app-menu"
import { listCustomPages } from "@/lib/custom-pages-store"
import type { IndexSource } from "@/lib/custom-pages-data"
import { blueprintVisibility, eraserPageBlueprint } from "@/lib/eraser-page-blueprints"
import { escapeCell, PAGES_INDEX, PAGES_INDEX_TITLE, PAGES_TAB, pagesIndexColumns, pagesIndexHeaders, type PagesIndexRow } from "@/lib/pages-index-shared"
import { indexPages, type IndexPageKey } from "@/lib/index-pages"
import type { AuthorizedUser } from "@/lib/server-auth"

export { PAGES_INDEX, PAGES_INDEX_TITLE, PAGES_TAB }

/** L'icône d'Eraser d'une entrée du menu, en nom d'icône (celle que montre le menu). */
const menuIconNames: Record<MenuIconKey, string> = { home: "house", map: "map", user: "user", scroll: "scroll-text", library: "library-big", flask: "flask-conical", shield: "shield", "file-plus": "file-plus", menu: "menu", link: "file-text", folder: "folder", star: "star" }

/** L'icône de chaque page d'index (celle de la page Index). */
const indexIconNames: Record<IndexPageKey, string> = {
  campagnes: "map", classes: "swords", creatures: "paw-print", langues: "languages", lieux: "map-pin", objets: "package", peuples: "users", personnages: "circle-user-round", pnjs: "drama",
  religions: "church", "sorts-classes": "sparkles", "sorts-creatures": "flame", etats: "activity", "armes-modificateurs": "hexagon", caracteristiques: "gauge", succes: "trophy", vocabulaire: "book-text", calendriers: "calendar-days",
}

/** La première image d'une page (bloc Image, hors « {Colonne} » d'une page de ligne) : son illustration dans une carte. */
function firstImage(content: PageContent) {
  const image = allBlocks(content).find((block) => block.type === "image" && block.src && !/^\{/.test(block.src))
  return image && image.type === "image" ? image.src : ""
}

/** Où se range une page, en mots : la section du menu, « Campagne », « Hors menu ». */
function sectionOfPath(path: string) {
  if (path === "/") return "Accueil"
  const first = path.split("/")[1] ?? ""
  return { regles: "Règles", ressources: "Index", "bac-a-sable": "Bac à sable", administration: "Administration", pages: "Pages", campagne: "Campagne" }[first] ?? "Accueil"
}

const visibilityLabel = (vis: string) => pageVisibilities.find((item) => item.value === vis)?.label ?? "Tout le monde"
const day = (value: string) => value ? value.slice(0, 10) : ""

/** Les pages d'Eraser ouvertes à ce rôle : le menu d'Eraser (ses liens) et, pour les MJ et admins, les pages d'index. */
function eraserEntries(role: PageRole): Array<{ path: string; title: string; icon: string; description: string; vis: "tous" | "mj" | "admin" }> {
  const seen = new Set<string>()
  const out: Array<{ path: string; title: string; icon: string; description: string; vis: "tous" | "mj" | "admin" }> = []
  for (const entry of menuCatalog) {
    if (!entry.href || entry.dynamic || !entry.roles.includes(role) || seen.has(entry.href)) continue
    seen.add(entry.href)
    const blueprint = eraserPageBlueprint(entry.href)
    out.push({ path: entry.href, title: entry.label, icon: blueprint.icon || menuIconNames[entry.icon], description: blueprint.description, vis: blueprintVisibility(entry.href) })
  }
  if (role !== "joueur") for (const page of indexPages) {
    if (seen.has(page.href)) continue
    seen.add(page.href)
    out.push({ path: page.href, title: page.label, icon: indexIconNames[page.key], description: page.description, vis: "mj" })
  }
  return out
}

/**
 * Les lignes de l'index des pages pour ce lecteur. `includeDrafts` : aussi les brouillons qu'il
 * peut modifier (l'Index des pages) ; sinon seulement les pages publiées (blocs, menus).
 */
export function pagesIndexRows(pages: CustomPage[], account: Pick<AuthorizedUser, "uid" | "role">, campaigns: Set<string> | null, options: { includeDrafts?: boolean } = {}): PagesIndexRow[] {
  const admin = account.role === "admin"
  const readable = pages.filter((page) => {
    if (page.trashedAt) return false
    const member = page.place === "campagne" && (admin || Boolean(campaigns?.has(page.campaignId)))
    if (!canReadPage(page, { role: account.role, uid: account.uid, member, manager: member && account.role !== "joueur" })) return false
    return options.includeDrafts || (page.status === "publiee" && Boolean(page.published))
  })
  const shown = (page: CustomPage) => page.status === "publiee" && page.published ? page.published : page
  const replacing = new Map(readable.filter((page) => page.replaces && page.status === "publiee" && page.published).map((page) => [page.replaces!, page]))
  const rows: PagesIndexRow[] = []
  for (const entry of eraserEntries(account.role)) {
    if (!pageVisibleTo(entry.vis, account.role)) continue
    const replaced = replacing.get(entry.path)
    const content = replaced ? shown(replaced) : null
    rows.push({
      id: `eraser:${entry.path}`,
      href: entry.path,
      title: content?.title || entry.title,
      description: content ? content.description : entry.description,
      icon: content ? content.emoji || content.icon || entry.icon : entry.icon,
      image: content ? firstImage(content) : "",
      section: sectionOfPath(entry.path),
      address: entry.path,
      visibility: visibilityLabel(entry.vis),
      status: "Publiée",
      origin: replaced ? "Eraser, modifiée" : "Eraser",
      updated: replaced ? day(replaced.publishedAt || replaced.updatedAt) : "",
    })
  }
  for (const page of readable) {
    // Une page de ligne (son modèle) ou une page qui en remplace une d'Eraser : déjà comptée, ou pas une page à elle seule.
    if (page.rowOf?.index || page.replaces) continue
    const content = shown(page)
    rows.push({
      id: page.id,
      href: pageHref(page),
      title: content.title,
      description: content.description,
      icon: content.emoji || content.icon || "file-text",
      image: firstImage(content),
      section: page.place === "hors-menu" ? "Hors menu" : placeLabel(page.place),
      address: pageHref(page),
      visibility: visibilityLabel(page.vis),
      status: page.status === "publiee" && page.published ? "Publiée" : "Brouillon",
      origin: "Créée",
      updated: day(page.updatedAt),
    })
  }
  return rows
}

/** L'index des pages vu comme un index (lib/custom-pages-data.ts) : un onglet « Pages », une ligne par page. */
export function pagesIndexSourceOf(rows: PagesIndexRow[]): IndexSource {
  const byId = new Map(rows.map((row) => [row.id, row.href]))
  return {
    key: PAGES_INDEX,
    title: PAGES_INDEX_TITLE,
    path: "/pages",
    nameHeader: "Titre",
    openToPlayers: true,
    rowHref: (id) => byId.get(id),
    tables: [{
      tabName: PAGES_TAB,
      headers: [...pagesIndexHeaders],
      rows: rows.map((row) => {
        const values = [row.title, row.description, row.icon, row.image, row.section, row.address, row.visibility, row.status, row.origin, row.updated, row.id]
        return { values, html: values.map(escapeCell) }
      }),
    }],
    columns: { [PAGES_TAB]: pagesIndexColumns() },
  }
}

/** Les campagnes du compte (pour ses pages de campagne) : lues seulement s'il y a de telles pages. */
async function campaignIdsOf(account: Pick<AuthorizedUser, "uid" | "role">, pages: CustomPage[]) {
  if (account.role === "admin" || !pages.some((page) => page.place === "campagne" && !page.trashedAt)) return null
  const { campaignsOf } = await import("@/lib/custom-pages-server")
  return new Set((await campaignsOf(account).catch(() => [])).map((campaign) => campaign.id))
}

/** L'index des pages de ce lecteur, prêt pour un bloc Vue ou l'Index des pages. */
export async function pagesIndexSource(account: Pick<AuthorizedUser, "uid" | "role">, options: { includeDrafts?: boolean } = {}) {
  const pages = await listCustomPages().catch(() => [] as CustomPage[])
  return pagesIndexSourceOf(pagesIndexRows(pages, account, await campaignIdsOf(account, pages), options))
}
