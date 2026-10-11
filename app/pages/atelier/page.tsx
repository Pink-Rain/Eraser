import { notFound, redirect } from "next/navigation"

import { AuthenticatedShell } from "@/components/eraser/authenticated-shell"
import { PageStudio } from "@/components/eraser/page-studio"
import { canEditPage, pageSummary, studioPage, type PageViewer } from "@/lib/custom-pages"
import { listCustomPages, pagesLinkingTo, readCustomPage } from "@/lib/custom-pages-store"
import { campaignsOf, pageAuthor, viewerFor } from "@/lib/custom-pages-server"
import { authorizedAccount } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

/**
 * L'atelier du créateur de pages (admins et MJ) : « ?id= » ouvre une page ; « ?nouvelle=1 »
 * (avec « &section= ») propose d'en créer une, depuis l'Index des pages.
 */
export default async function PageStudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await authorizedAccount(["admin", "mj"])
  if (!account) redirect("/")
  const parameters = await searchParams
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
  const id = single(parameters.id)
  if (!id) {
    const query = new URLSearchParams({ nouvelle: "1" })
    const section = single(parameters.section)
    if (section) query.set("section", section)
    redirect(`/pages?${query.toString()}`)
  }
  const page = await readCustomPage(id, { fresh: true }).catch(() => null)
  if (!page || page.trashedAt) notFound()
  const viewer = await viewerFor(account, page)
  if (!canEditPage(page, viewer)) notFound()
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
  return (
    <AuthenticatedShell pageLabel={`Atelier · ${page.title}`} roles={["admin", "mj"]}>
      <PageStudio
        key={page.id}
        initial={studioPage(page)}
        pages={summaries}
        campaigns={campaigns.filter((campaign) => admin || campaign.mine).map((campaign) => ({ id: campaign.id, name: campaign.name }))}
        linking={linking}
        role={account.role}
      />
    </AuthenticatedShell>
  )
}
