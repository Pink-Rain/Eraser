/**
 * Les lignes de l'explorateur des pages (Index des pages) : une seule forme pour toutes les
 * pages, qu'elles aient été faites dans l'atelier ou livrées par Eraser. Une page d'Eraser y a
 * son titre, son icône, son adresse et sa place comme une autre, se range dans un dossier et
 * s'ouvre dans l'atelier par le même « Ouvrir » (elle y est reprise en coulisses).
 *
 * Une page de l'atelier qui remplace une page d'Eraser n'est qu'une ligne, à l'adresse d'Eraser :
 * tant qu'elle n'est pas publiée, les lecteurs voient la page d'origine, elle est donc
 * « Publiée », et « modifiée » dès qu'on l'a changée dans l'atelier.
 *
 * Règles pures : l'explorateur, l'éditeur du menu et les tests s'en servent.
 */
import { placeLabel, type PageStatus, type PageSummary, type PageVisibility } from "@/lib/custom-pages"
import type { EraserPageEntry } from "@/lib/eraser-page-blueprints"
import { eraserFolderKey, folderKeyOf, folderPathLabel, type PageFolders } from "@/lib/page-folders"
import { replaceableRoutes, replacementLabel } from "@/lib/page-replacements"

export type ExplorerPage = {
  /** Sa clé de rangement (lib/page-folders.ts), unique dans la liste. */
  key: string
  /** La page de l'atelier ; "" pour une page d'Eraser pas encore reprise. */
  id: string
  /** L'adresse d'Eraser qu'elle est (ou qu'elle complète) ; "" pour une page faite dans l'atelier. */
  path: string
  title: string
  icon: string
  emoji: string
  description: string
  /** L'adresse montrée ; `visitable` : on peut l'ouvrir telle quelle (pas « /campagne/[id] »). */
  href: string
  visitable: boolean
  /** Sa place dans le menu, en mots (« Règles », « Campagne · Les Ombres », « Hors menu »). */
  where: string
  /** Le groupe qui sert à « Ranger par section » (« Règles », « Campagnes »…). */
  group: string
  vis: PageVisibility
  status: PageStatus
  unpublished: boolean
  updatedAt: string
  updatedBy: string
  trashedAt: string
  editable: boolean
}

const routeOf = (path: string) => replaceableRoutes.find((route) => route.path === path)

/** L'adresse se visite-t-elle telle quelle (pas de segment « [id] ») ? */
export const visitablePath = (path: string) => !path.includes("[")

/**
 * Toutes les pages de l'explorateur : celles de l'atelier (corbeille comprise) et les pages
 * d'Eraser qu'aucune page de l'atelier ne reprend encore.
 */
export function explorerPages(pages: PageSummary[], eraser: EraserPageEntry[], campaignName: (id: string) => string = () => "Campagne"): ExplorerPage[] {
  const out: ExplorerPage[] = []
  const taken = new Set<string>()
  for (const page of pages) {
    const route = page.replaces ? routeOf(page.replaces) : undefined
    const key = folderKeyOf(page)
    // Une seule ligne par clé : la page vivante passe avant celle de la corbeille.
    if (taken.has(key) && page.trashedAt) continue
    if (!page.trashedAt) taken.add(key)
    const replaced = Boolean(page.replaces)
    // Jamais publiée, elle laisse voir la page d'Eraser : celle-ci reste publiée, « modifiée » si on l'a changée.
    const shadow = replaced && page.status !== "publiee"
    const where = replaced
      ? `${route?.group ?? "Eraser"}${page.replaceMode === "before" ? ` · au-dessus de « ${replacementLabel(page.replaces!)} »` : page.replaceMode === "after" ? ` · en dessous de « ${replacementLabel(page.replaces!)} »` : ""}`
      : page.place === "campagne" ? `Campagne · ${campaignName(page.campaignId)}` : placeLabel(page.place)
    out.push({
      key,
      id: page.id,
      path: page.replaces ?? "",
      title: page.title,
      icon: page.icon || (route?.icon ?? ""),
      emoji: page.emoji,
      description: page.description,
      href: replaced ? page.replaces! : page.href,
      visitable: replaced ? visitablePath(page.replaces!) : true,
      where,
      group: replaced ? route?.group ?? "Eraser" : page.place === "campagne" ? "Campagnes" : placeLabel(page.place),
      vis: page.vis,
      status: shadow ? "publiee" : page.status,
      unpublished: shadow ? page.updatedAt !== page.createdAt : page.unpublished,
      updatedAt: page.updatedAt,
      updatedBy: page.updatedBy,
      trashedAt: page.trashedAt,
      editable: page.editable,
    })
  }
  for (const entry of eraser) {
    const key = eraserFolderKey(entry.path)
    if (entry.page || taken.has(key)) continue
    taken.add(key)
    out.push({
      key,
      id: "",
      path: entry.path,
      title: entry.label,
      icon: entry.icon,
      emoji: "",
      description: entry.description,
      href: entry.path,
      visitable: visitablePath(entry.path),
      where: entry.group,
      group: entry.group,
      vis: entry.vis,
      status: "publiee",
      unpublished: false,
      updatedAt: "",
      updatedBy: "",
      trashedAt: "",
      editable: true,
    })
  }
  return out
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** La page correspond-elle à la recherche (titre, description, adresse, place, dossier) ? */
export function matchesExplorerQuery(page: ExplorerPage, query: string, folders: PageFolders) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = fold(`${page.title} ${page.description} ${page.href} ${page.where} ${folderPathLabel(folders, folders.placement[page.key] ?? "")}`)
  return words.every((word) => text.includes(word))
}

/**
 * « Ranger par section » : un dossier par groupe (Accueil, Règles, Campagnes…) et chaque page
 * non rangée dans le sien. Rend les dossiers à créer (ceux d'un même nom à la racine sont
 * réutilisés) et les pages à y mettre.
 */
export function sectionFolderPlan(pages: ExplorerPage[], folders: PageFolders, newId: () => string) {
  const existing = new Map(folders.folders.filter((folder) => !folder.parent).map((folder) => [folder.name, folder.id]))
  const create: Array<{ id: string; name: string }> = []
  const place = new Map<string, string[]>()
  for (const page of pages) {
    if (page.trashedAt || folders.placement[page.key]) continue
    let id = existing.get(page.group)
    if (!id) { id = newId(); existing.set(page.group, id); create.push({ id, name: page.group }) }
    place.set(id, [...(place.get(id) ?? []), page.key])
  }
  return { create, place: [...place.entries()].map(([folder, keys]) => ({ folder, keys })) }
}
