/**
 * Ce que reçoit l'atelier des pages (l'extension Eraser Page, Pink-Rain/Eraser_page) pour chacun
 * de ses écrans : l'Index des pages, l'atelier d'une page, l'éditeur du menu. Calculé ici, sur le
 * serveur d'Eraser, comme le faisaient ses anciennes pages ; l'extension n'en garde que
 * l'affichage. Réservé aux administrateurs (`canBuildPages`).
 */
import { canEditPage, pageSummary, studioPage, type PageViewer } from "@/lib/custom-pages"
import { listCustomPages, listPageTemplates, pagesLinkingTo, readCustomPage } from "@/lib/custom-pages-store"
import { campaignsOf, pageAuthor, viewerFor } from "@/lib/custom-pages-server"
import { eraserPageEntries } from "@/lib/eraser-page-blueprints"
import { menuEditorData } from "@/lib/menu-editor-data"
import { folderKeyOf, emptyFolders } from "@/lib/page-folders"
import { knownPageFolders, readPageFolders } from "@/lib/page-folders-store"
import { pagesIndexRows } from "@/lib/pages-index"
import type { AuthorizedUser } from "@/lib/server-auth"

/** L'Index des pages : les pages, celles d'Eraser, les modèles, les campagnes et le rangement. */
export async function pagesIndexData(account: AuthorizedUser) {
  const [pages, templates, campaigns, folders] = await Promise.all([
    listCustomPages({ fresh: true }).catch(() => []),
    listPageTemplates().catch(() => []),
    campaignsOf(account),
    readPageFolders().catch(() => emptyFolders()),
  ])
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const base: PageViewer = { role: account.role, uid: account.uid, name: pageAuthor(account).name }
  const admin = account.role === "admin"
  // Un MJ voit les pages qu'il peut modifier et celles qui lui sont ouvertes (jamais celles réservées aux admins).
  const summaries = pages.flatMap((page) => {
    const campaign = page.place === "campagne" ? byId.get(page.campaignId) : undefined
    const viewer: PageViewer = { ...base, member: admin || Boolean(campaign), manager: admin || Boolean(campaign?.mine) }
    if (!admin && !canEditPage(page, viewer) && (page.vis === "admin" || page.place === "administration" || (page.place === "campagne" && !campaign))) return []
    return [pageSummary(page, viewer)]
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return {
    pages: summaries,
    eraser: eraserPageEntries(pages, account.role),
    // Les pages vues comme les lignes de l'index des pages (aperçus de « Modifier l'affichage »).
    indexRows: pagesIndexRows(pages, account, admin ? null : new Set(campaigns.map((campaign) => campaign.id)), { folders }),
    templates: templates.map((template) => ({ id: template.id, name: template.name, createdAt: template.createdAt, createdBy: template.createdBy.name, title: template.content.title, icon: template.content.icon, emoji: template.content.emoji, blocks: template.content.sections.reduce((total, section) => total + section.cols.flat().length, 0) })),
    campaigns: campaigns.filter((campaign) => admin || campaign.mine).map((campaign) => ({ id: campaign.id, name: campaign.name })),
    allCampaigns: campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name })),
    role: account.role,
    folders,
  }
}

/** L'atelier d'une page ; null si elle n'existe pas, est à la corbeille ou n'est pas modifiable par ce compte. */
export async function pageStudioData(account: AuthorizedUser, id: string) {
  const page = await readCustomPage(id, { fresh: true }).catch(() => null)
  if (!page || page.trashedAt) return null
  const viewer = await viewerFor(account, page)
  if (!canEditPage(page, viewer)) return null
  const [pages, campaigns, linking] = await Promise.all([listCustomPages().catch(() => []), campaignsOf(account), pagesLinkingTo(page.id).catch(() => [])])
  const base: PageViewer = { role: account.role, uid: account.uid, name: pageAuthor(account).name }
  const admin = account.role === "admin"
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  // Les pages vers lesquelles un bloc Lien peut mener : celles que le compte peut lire.
  const summaries = pages.filter((other) => !other.trashedAt).flatMap((other) => {
    const campaign = other.place === "campagne" ? byId.get(other.campaignId) : undefined
    const otherViewer: PageViewer = { ...base, member: admin || Boolean(campaign), manager: admin || Boolean(campaign?.mine) }
    if (!admin && (other.vis === "admin" || other.place === "administration" || (other.place === "campagne" && !campaign))) return []
    return [pageSummary(other, otherViewer)]
  }).sort((left, right) => left.title.localeCompare(right.title, "fr"))
  return {
    initial: studioPage(page),
    pages: summaries,
    campaigns: campaigns.filter((campaign) => admin || campaign.mine).map((campaign) => ({ id: campaign.id, name: campaign.name })),
    linking,
    role: account.role,
    // Le retour ramène au dossier de la page (copie en mémoire du rangement : rien n'est attendu).
    folder: knownPageFolders().placement[folderKeyOf(page)] ?? null,
  }
}

/** L'éditeur du menu latéral. */
export async function menuStudioData(account: AuthorizedUser) {
  return { role: account.role, initial: await menuEditorData(account) }
}
