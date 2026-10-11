import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { CustomPageView, type PageLinkTarget } from "@/components/eraser/custom-page-view"
import { allBlocks, canManagePages, pageForViewer, pageHref, type PagePlace } from "@/lib/custom-pages"
import { findCustomPage } from "@/lib/custom-pages-store"
import { campaignsOf, readablePages, viewerFor } from "@/lib/custom-pages-server"
import { currentAccount, currentViewAccount } from "@/lib/server-auth"
import { worldIndexDefinitions } from "@/lib/world-index-definitions"

/**
 * Une page du créateur de pages, à son adresse (/regles/…, /campagne/…/pages/…, /pages/…).
 * Absente, à la corbeille, ou fermée au lecteur : « page introuvable », sans rien dire de
 * plus (un joueur n'apprend pas qu'une page réservée existe).
 */
export async function CustomPageRoute({ place, slug, campaignId = "" }: { place: PagePlace; slug: string; campaignId?: string }) {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()])
  if (!account) redirect("/connexion")
  if (!viewAccount) redirect("/")
  const page = await findCustomPage(place, decodeURIComponent(slug), campaignId ? decodeURIComponent(campaignId) : "").catch(() => null)
  if (!page) notFound()
  const view = pageForViewer(page, await viewerFor(viewAccount, page))
  if (!view) notFound()
  const blocks = view.sections.flatMap((section) => section.cols.flat())
  // Les pages vers lesquelles mènent les blocs Lien : seulement celles que le lecteur peut ouvrir.
  const linked = new Set(blocks.flatMap((block) => block.type === "link" && block.pageId ? [block.pageId] : []))
  const links: Record<string, PageLinkTarget> = {}
  if (linked.size) {
    for (const { page: target } of await readablePages(viewAccount, { includeDrafts: canManagePages(viewAccount.role) })) {
      if (!linked.has(target.id)) continue
      const content = target.status === "publiee" && target.published ? target.published : target
      links[target.id] = { title: content.title, href: pageHref(target), icon: content.icon, emoji: content.emoji, description: content.description }
    }
  }
  // Une vue d'index mène à son index (MJ et admins seulement : les joueurs n'y ont pas accès).
  const indexPaths: Record<string, string> = {}
  if (canManagePages(viewAccount.role)) {
    for (const block of allBlocks(view)) {
      if (block.type !== "view" || !block.index) continue
      indexPaths[block.index] = (worldIndexDefinitions as Record<string, { path: string } | undefined>)[block.index]?.path ?? `/ressources/index/${encodeURIComponent(block.index)}`
    }
  }
  const campaignName = page.place === "campagne" ? (await campaignsOf(viewAccount).catch(() => [])).find((campaign) => campaign.id === page.campaignId)?.name : undefined
  return (
    <AuthenticatedShell pageLabel={view.title}>
      <CustomPageView key={view.id} initial={view} links={links} campaignName={campaignName} indexPaths={indexPaths} />
    </AuthenticatedShell>
  )
}
