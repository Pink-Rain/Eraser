import { redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PageDirectory } from "@/components/eraser/page-directory"
import { canEditPage, pageSummary, type PageViewer } from "@/lib/custom-pages"
import { listCustomPages, listPageTemplates } from "@/lib/custom-pages-store"
import { campaignsOf, pageAuthor } from "@/lib/custom-pages-server"
import { eraserPageEntries } from "@/lib/eraser-page-blueprints"
import { pagesIndexRows } from "@/lib/pages-index"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/** L'Index des pages du créateur de pages : admins et MJ. */
export default async function PagesIndexPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await authorizedAccount(["admin"])
  if (!account) redirect("/")
  const parameters = await searchParams
  const [pages, templates, campaigns] = await Promise.all([
    listCustomPages({ fresh: true }).catch(() => []),
    listPageTemplates().catch(() => []),
    campaignsOf(account),
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
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
  const wantsNew = single(parameters.nouvelle) === "1"
  return (
    <AuthenticatedShell pageLabel="Index des pages" roles={["admin"]}>
      <PageDirectory
        // « Nouvelle page » depuis le menu, alors que l'Index est déjà ouvert : la fenêtre s'ouvre quand même.
        key={wantsNew ? `nouvelle:${single(parameters.section) ?? ""}` : "index"}
        pages={summaries}
        eraser={eraserPageEntries(pages, account.role)}
        // Les pages vues comme les lignes de l'index des pages (aperçus de « Modifier l'affichage »).
        indexRows={pagesIndexRows(pages, account, admin ? null : new Set(campaigns.map((campaign) => campaign.id)))}
        templates={templates.map((template) => ({ id: template.id, name: template.name, createdAt: template.createdAt, createdBy: template.createdBy.name, title: template.content.title, icon: template.content.icon, emoji: template.content.emoji, blocks: template.content.sections.reduce((total, section) => total + section.cols.flat().length, 0) }))}
        campaigns={campaigns.filter((campaign) => admin || campaign.mine).map((campaign) => ({ id: campaign.id, name: campaign.name }))}
        allCampaigns={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
        role={account.role}
        newPage={wantsNew ? { place: single(parameters.section), template: single(parameters.modele) } : undefined}
      />
    </AuthenticatedShell>
  )
}
