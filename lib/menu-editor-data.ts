/**
 * Ce que l'éditeur du menu reçoit (page /pages/menu et GET /api/menu) : le menu réglé, les pages
 * qu'on peut y placer — celles de l'atelier et celles d'Eraser, sous la même forme — et les
 * dossiers du créateur de pages.
 */
import { mergeMenu } from "@/lib/app-menu"
import { hasPreviousMenu, readMenuLayout } from "@/lib/app-menu-store"
import { pageMenuHref, type PageVisibility } from "@/lib/custom-pages"
import { listCustomPages } from "@/lib/custom-pages-store"
import { readablePages } from "@/lib/custom-pages-server"
import { eraserPageEntries } from "@/lib/eraser-page-blueprints"
import { eraserFolderKey, emptyFolders, folderKeyOf } from "@/lib/page-folders"
import { readPageFolders } from "@/lib/page-folders-store"
import type { AuthorizedUser } from "@/lib/server-auth"

/**
 * Une page qu'on peut mettre au menu. `id` : la page de l'atelier (« page:… » au menu), vide pour
 * une page d'Eraser pas encore reprise ; une page d'Eraser (`eraser`, reprise ou non) entre au
 * menu comme un lien vers son adresse, qui la montre telle que les lecteurs la lisent. `published` : déjà lue à cette
 * adresse ; `place` : la section du menu où elle se range d'elle-même ("" sinon).
 */
export type MenuPageChoice = { key: string; id: string; title: string; href: string; icon: string; emoji: string; vis: PageVisibility; published: boolean; place: string; eraser: boolean }

export async function menuEditorData(account: Pick<AuthorizedUser, "uid" | "role" | "displayName" | "email">) {
  const [layout, previous, readable, all, folders] = await Promise.all([
    readMenuLayout().catch(() => null),
    hasPreviousMenu().catch(() => false),
    readablePages(account, { includeDrafts: true }).catch(() => []),
    listCustomPages().catch(() => []),
    readPageFolders().catch(() => emptyFolders()),
  ])
  const pages: MenuPageChoice[] = []
  const keys = new Set<string>()
  for (const { page } of readable) {
    // Une page de ligne d'index (son modèle) n'a pas d'adresse à elle ; une page sur « /campagne/[id] » non plus.
    if (page.rowOf?.index || page.replaces?.includes("[")) continue
    const content = page.published ?? page
    const key = folderKeyOf(page)
    keys.add(key)
    pages.push({ key, id: page.id, title: content.title, href: pageMenuHref(page), icon: content.icon, emoji: content.emoji, vis: page.vis, published: Boolean(page.replaces) || (page.status === "publiee" && Boolean(page.published)), place: page.replaces ? "" : page.place, eraser: Boolean(page.replaces) })
  }
  // Les pages d'Eraser : publiées d'office (les lecteurs voient celle d'origine tant que sa reprise ne l'est pas).
  for (const entry of eraserPageEntries(all, account.role)) {
    const key = eraserFolderKey(entry.path)
    if (entry.path.includes("[") || keys.has(key)) continue
    pages.push({ key, id: "", title: entry.label, href: entry.path, icon: entry.icon, emoji: "", vis: entry.vis, published: true, place: "", eraser: true })
  }
  pages.sort((left, right) => left.title.localeCompare(right.title, "fr", { numeric: true, sensitivity: "base" }))
  return {
    items: mergeMenu(layout?.items),
    custom: Boolean(layout),
    updatedAt: layout?.updatedAt ?? "",
    updatedBy: layout?.updatedBy ?? "",
    previous,
    pages,
    folders,
    /** La page de l'atelier de chaque page d'Eraser déjà reprise (« Ouvrir dans l'atelier »). */
    studio: Object.fromEntries(eraserPageEntries(all, account.role).flatMap((entry) => entry.page ? [[entry.path, entry.page.id]] : [])) as Record<string, string>,
  }
}

export type MenuEditorData = Awaited<ReturnType<typeof menuEditorData>>
